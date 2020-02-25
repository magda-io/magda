package au.csiro.data61.magda.opa

import akka.actor.ActorSystem
import akka.http.scaladsl.model._
import akka.stream.Materializer
import akka.util.ByteString
import au.csiro.data61.magda.opa.OpaTypes._
import com.typesafe.config.Config
import spray.json._

import scala.concurrent.duration._
import scala.concurrent.{ExecutionContext, Future}
import au.csiro.data61.magda.client.AuthApiClient

object OpaTypes {
  case class OpaQueryPair(policyId: String, queries: List[OpaQuery])

  sealed trait OpaOp extends OpaRef
  case object Eq extends OpaOp
  case object Neq extends OpaOp
  case object Lt extends OpaOp
  case object Gt extends OpaOp
  case object Lte extends OpaOp
  case object Gte extends OpaOp

  object OpaOp {

    def apply(op: String): OpaOp = op match {
      case "equal" => Eq
      case "eq"    => Eq
      case "neq"   => Neq
      case "lt"    => Lt
      case "gt"    => Gt
      case "lte"   => Lte
      case "gte"   => Gte
      case _       => throw new Exception("Could not match " + op + " to OpaOp")
    }
  }

  sealed trait OpaRef
  case object OpaRefAnyInArray extends OpaRef
  case class OpaRefObjectKey(key: String) extends OpaRef

  sealed trait OpaValue
  case class OpaValueString(value: String) extends OpaValue
  case class OpaValueNumber(value: BigDecimal) extends OpaValue
  case class OpaValueBoolean(value: Boolean) extends OpaValue

  sealed trait OpaQuery
  case class OpaQueryMatchValue(
      path: List[OpaRef],
      operation: OpaOp,
      value: OpaValue
  ) extends OpaQuery
  case class OpaQueryExists(
      path: List[OpaRef]
  ) extends OpaQuery

  /** A no-op query that occurs when OPA has determined that the query should be resolved regardless of unknowns */
  case object OpaQueryAllMatched extends OpaQuery

  /** A no-op query that occurs when OPA has determined that the query cannot be resolved regardless of unknowns */
  case object OpaQueryNoneMatched extends OpaQuery
  case object OpaQuerySkipAccessControl extends OpaQuery

  case class OpaPartialResponse(
      queries: List[OpaQuery]
  )
}

sealed trait RegoTerm
case class RegoTermRef(value: List[RegoRefPart]) extends RegoTerm
case class RegoTermVar(value: String) extends RegoTerm
sealed trait RegoTermValue extends RegoTerm
case class RegoTermString(value: String) extends RegoTermValue
case class RegoTermBoolean(value: Boolean) extends RegoTermValue
case class RegoTermNumber(value: BigDecimal) extends RegoTermValue

object RegoTerm {

  def apply(termJson: JsValue): RegoTerm = {
    val jsObj = termJson.asJsObject
    (jsObj.fields("type"), jsObj.fields("value")) match {
      case (JsString("ref"), JsArray(value: Vector[JsValue])) =>
        RegoTermRef(value.toList.map(RegoRefPart(_)))
      case (JsString("string"), JsString(value: String)) =>
        RegoTermString(value)
      case (JsString("number"), JsNumber(value: BigDecimal)) =>
        RegoTermNumber(value)
      case (JsString("var"), JsString(value: String)) => RegoTermVar(value)
      case _                                          => throw new Exception("Could not parse value " + jsObj)
    }
  }
}

sealed trait RegoRefPart
case class RegoRefPartString(value: String) extends RegoRefPart
case class RegoRefPartVar(value: String) extends RegoRefPart

object RegoRefPart {

  def apply(refJson: JsValue): RegoRefPart = refJson match {
    case JsObject(ref) =>
      (ref.get("type"), ref.get("value")) match {
        case (Some(JsString("var")), Some(value: JsString)) =>
          RegoRefPartVar(value.value)
        case (Some(JsString("string")), Some(value: JsString)) =>
          RegoRefPartString(value.value)
        case _ => throw new Error("Could not parse" + refJson.toString())
      }
    case _ => throw new Error("Could not parse" + refJson.toString())
  }
}

object OpaConsts {
  val ANY_IN_ARRAY: String = "[_]"
}

object OpaParser {

  def parseOpaResponse(json: JsValue): List[List[OpaQuery]] = {
    val result = json.asJsObject.fields
      .get("result") match {
      case Some(aResult) => aResult
      case None          => throw new Exception("Got no result for opa query")
    }

    val rulesOpt: List[List[OpaQuery]] = result.asJsObject.fields
      .get("queries") match {
      case Some(JsArray(rules)) =>
        // It is assumed that a registry record level access OPA policy consists of outer and inner
        // sub-policies where all outer OPA policies are in logical OR relationship; All inner OPA
        // policies are in logical AND relationship. For example, an access policy document may look
        // like
        // ------------------------
        //    policy_0 {
        //      policy_0_0
        //      ...
        //      policy_0_i
        //      ...
        //    }
        //
        //    ...
        //
        //    policy_m {
        //      policy_m_0
        //      ...
        //      policy_m_k
        //      ...
        //    }
        //    ...
        // -------------------------
        //
        // An OPA query will return a complicated AST structure that maps the above access policy. We will
        // transform the AST into a nested array of rules that have one-to-one mapping to the policy set:
        //
        //    [
        //      [
        //        rule_0_0,
        //        ...
        //        rule_0_i,
        //        ...
        //      ],
        //      ...
        //      [
        //        rule_m_0,
        //        ...
        //        rule_m_k,
        //        ...
        //      ],
        //      ...
        //    ]
        //
        // where an outer array element (that is, an outer rule, e.g. [rule_m_0, rule_m_k, ...])
        // maps to an outer OPA policy (e.g. policy_m) while an inner array element (that is, an inner
        // rule, e.g. rule_m_k) to an inner OPA policy (e.g. policy_m_k).
        //
        // An empty outer rule indicates that the corresponding outer policy has been fully evaluated to
        // true therefore the whole access policy should be evaluated to true.
        val hasEmptyOuterRule = rules
          .map(
            outerRule => outerRule.asInstanceOf[JsArray].elements.toList
          )
          .exists(outerRule => outerRule.isEmpty)

        if (hasEmptyOuterRule) {
          List(List(OpaQueryAllMatched))
        } else {
          val rawRules: List[List[JsValue]] = rules
            .map(outerRule => {
              outerRule
                .asInstanceOf[JsArray]
                .elements
                .toList
                .flatMap(
                  innerRules => innerRules.asJsObject.fields.get("terms").toList
                )
            })
            .toList

          rawRules
            .map(outerRule => outerRule.map(parseRule))
            .map(outerRule => {
              outerRule.map({
                case List(
                    operation: RegoTermVar,
                    path: RegoTermRef,
                    value: RegoTermValue
                    ) =>
                  val thePath: List[OpaRef] =
                    regoRefPathToOpaRefPath(path.value)
                  val theOperation: OpaOp = operation match {
                    case RegoTermVar(opString: String) =>
                      OpaOp(opString)
                  }
                  val theValue = value match {
                    case RegoTermBoolean(aValue) => OpaValueBoolean(aValue)
                    case RegoTermString(aValue)  => OpaValueString(aValue)
                    case RegoTermNumber(aValue)  => OpaValueNumber(aValue)
                  }

                  OpaQueryMatchValue(
                    path = thePath,
                    operation = theOperation,
                    value = theValue
                  )
                case e => throw new Exception(s"Could not understand $e")
              })
            })
        }
      case None =>
        // This happens if access is always disallowed for the input given to OPA
        List(List(OpaQueryNoneMatched))
      case e => throw new Exception(s"Could not understand $e")
    }

    rulesOpt
  }

  private def regoRefPathToOpaRefPath(path: List[RegoRefPart]): List[OpaRef] = {
    path.map {
      case pathSegment: RegoRefPartString =>
        OpaRefObjectKey(pathSegment.value)
      case e =>
        throw new Exception(s"Could not understand $e")
    }
  }

  private val anyInArrayPattern = "\\$.*".r
  private def parseRule(terms: JsValue): List[RegoTerm] = {
    // The terms may look like
    //
    // Case 1: A scalar property should meet the requirement.
    //
    // [
    //	{
    //		"type":"ref","value":[{"type":"var","value":"gt"}]
    //	},
    //	{
    //		"type":"ref","value":[{"type":"var","value":"input"},{"type":"string","value":"object"},{"type":"string","value":"registry"},{"type":"string","value":"record"},{"type":"string","value":"esri-access-control"},{"type":"string","value":"expiration"}]
    //	},
    //
    //	{"type":"number","value":1570075939709}
    // ]
    //
    // Case 2: At least one of the elements of array property should meet the requirement.
    //         Note that the element order of the terms is different from Case 1.
    // [
    //	{
    //		"type":"ref","value":[{"type":"var","value":"eq"}]
    //	},
    //	{
    //		"type":"string","value":"Dep. A"
    //	},
    //	{
    //		"type":"ref","value":[{"type":"var","value":"input"},{"type":"string","value":"object"},{"type":"string","value":"registry"},{"type":"string","value":"record"},{"type":"string","value":"esri-access-control"},{"type":"string","value":"groups"},{"type":"var","value":"$06"}]
    //	}
    // ]
    val theTerms = terms.asInstanceOf[JsArray].elements.toList
    if (theTerms.length != 3) {
      throw new Exception(s"$theTerms must consist of 3 elements.")
    } else {
      val regoTerms: List[RegoTerm] = theTerms.flatMap(term => {
        term match {
          case termsObj: JsObject =>
            (termsObj.fields("type"), termsObj.fields("value")) match {
              case (JsString("ref"), array: JsArray) =>
                array.elements.toList
                  .map(parseTerm)
              case (JsString("boolean"), value: JsBoolean) =>
                List(RegoTermBoolean(value.value))
              case (JsString("number"), value: JsNumber) =>
                List(RegoTermNumber(value.value))
              case (JsString("string"), value: JsString) =>
                List(RegoTermString(value.value))
              case e => throw new Exception("Could not parse term " + e)
            }
          case other => throw new Exception("Could not parse term " + other)
        }
      })

      val operation: RegoTermVar = regoTerms.head.asInstanceOf[RegoTermVar]
      val value: RegoTerm =
        if (regoTerms(1) == RegoTermVar("input")) regoTerms.last
        else regoTerms(1)
      val path: List[RegoRefPart] = if (regoTerms(1) == RegoTermVar("input")) {
        val pathStartIndex = 2
        val pathEndIndex = regoTerms.length - 1
        regoTerms
          .slice(pathStartIndex, pathEndIndex)
          .map(term => {
            val theTerm = term match {
              case RegoTermString(v) => v
              case e                 => throw new Exception(s"Could not understand $e")
            }
            RegoRefPartString(theTerm)
          })
      } else {
        val pathStartIndex = 3
        val pathEndIndex = regoTerms.length
        regoTerms
          .slice(pathStartIndex, pathEndIndex)
          .map(term => {
            val aPathSegment = term match {
              case RegoTermString(v)                => v
              case RegoTermVar(anyInArrayPattern()) => OpaConsts.ANY_IN_ARRAY
              case e                                => throw new Exception(s"Could not understand $e")
            }
            RegoRefPartString(aPathSegment)
          })
      }
      List(operation, RegoTermRef(path), value)
    }
  }

  private def parseTerm(termJson: JsValue): RegoTerm = RegoTerm(termJson)
}
