package au.csiro.data61.magda.opa

import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.model._
import akka.http.scaladsl.model.headers.RawHeader
import akka.stream.Materializer
import akka.util.ByteString
import au.csiro.data61.magda.Authentication
import au.csiro.data61.magda.opa.OpaTypes._
import com.auth0.jwt.JWT
import com.typesafe.config.Config
import spray.json._

import scala.concurrent.duration._
import scala.concurrent.{ExecutionContext, Future}

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
  case object OpaRefAllInArray extends OpaRef
  case class OpaRefObjectKey(key: String) extends OpaRef
  case class OpaRefObjectKey2(key: RegoRefPartString) extends OpaRef

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
  case class OpaQueryMatchValue2(
     path: List[String],
     operation: OpaOp,
     value: OpaValue
   ) extends OpaQuery
  case class OpaQueryExists(
      path: List[OpaRef]
  ) extends OpaQuery
  case object OpaQueryMatchAll extends OpaQuery
  case object OpaQueryMatchAny extends OpaQuery
  case object OpaQueryMatchNone extends OpaQuery
  case object OpaQueryMatchNoAccessControl extends OpaQuery
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

class OpaQueryer()(
    implicit val config: Config,
    implicit val system: ActorSystem,
    implicit val ec: ExecutionContext,
    implicit val materializer: Materializer
) {

  private val opaUrl: String = config.getConfig("opa").getString("baseUrl")
  private val logger = system.log

  def queryBoolean(
      jwtToken: Option[String],
      policyId: String
  ): Future[Boolean] = {
    val headers = jwtToken match {
      case Some(jwt) => List(RawHeader("X-Magda-Session", jwt))
      case None      => List()
    }

    val httpRequest = HttpRequest(
      uri = s"$opaUrl/${policyId.replace(".", "/")}",
      method = HttpMethods.GET,
      headers = headers
    )

    Http()
      .singleRequest(httpRequest)
      .flatMap(
        res =>
          receiveOpaResponse(res)(_.asJsObject.fields.get("result") match {
            case Some(JsBoolean(true)) => true
            case _                     => false
          })
      )
  }

  def queryRecord(
      jwtToken: Option[String],
      policyId: String
  ): Future[List[List[OpaQuery]]] = {
    queryPolicy(jwtToken, policyId)
  }

  def queryAsDefaultUser(
      policyId: String
  ): Future[List[List[OpaQuery]]] = {
    val jwt = JWT
      .create()
      .withClaim("userId", config.getString("auth.userId"))
      .sign(Authentication.algorithm)

    queryPolicy(Some(jwt), policyId)
  }

  def queryPolicy(
      jwtToken: Option[String],
      policyId: String
  ): Future[List[List[OpaQuery]]] = {
    val requestData: String = s"""{
                                 |  "query": "data.$policyId",
                                 |  "unknowns": ["input.object"]
                                 |}""".stripMargin

    // println(requestData)

    val headers = jwtToken match {
      case Some(jwt) => List(RawHeader("X-Magda-Session", jwt))
      case None      => List()
    }

    val httpRequest = HttpRequest(
      uri = s"$opaUrl/compile",
      method = HttpMethods.POST,
      entity = HttpEntity(ContentTypes.`application/json`, requestData),
      headers = headers
    )

    Http()
      .singleRequest(httpRequest)
      .flatMap(receiveOpaResponse[List[List[OpaQuery]]](_) { json =>
        parseOpaResponse(json)
      })
  }

  def receiveOpaResponse[T](res: HttpResponse)(fn: JsValue => T): Future[T] = {
    if (res.status.intValue() != 200) {
      res.entity.dataBytes.runFold(ByteString(""))(_ ++ _).flatMap { body =>
        logger
          .error(s"OPA failed to process the request: {}", body.utf8String)
        Future.failed(
          new Exception(
            s"Failed to retrieve access control decision from OPA: ${body.utf8String}"
          )
        )
      }
    } else {
      res.entity.toStrict(10.seconds).map { entity =>
        fn(entity.data.utf8String.parseJson)
      }
    }
  }

  def parseOpaResponse(json: JsValue): List[List[OpaQuery]] = {
    val result = json.asJsObject.fields
      .get("result") match {
      case Some(aResult) => aResult
      case None          => throw new Exception("Got no result for opa query")
    }

    val rulesOpt: List[List[OpaQuery]] = result.asJsObject.fields
      .get("queries") match {
      case None                    => List(List(OpaQueryMatchNone))
      case Some(JsArray(Vector())) => List(List(OpaQueryMatchAll))
      case Some(JsArray(rules)) =>
        val someRules: Seq[JsValue] = rules

        // Having an empty rule indicates an OR rule condition is fully evaluated to true.
        val hasEmptyRule = someRules.map(
          theRules => theRules.asInstanceOf[JsArray].elements.toList
        ).exists(r => r.isEmpty)

        if (hasEmptyRule) {
          val r: List[List[OpaQuery]] = List(List(OpaQueryMatchAny))
          r
        }
        else {
          // The flatMap (here and after) logic may not work properly as it only supports
          // partial evaluation of one item.
          // E.g. if we need to check record owner and access expiration, it will make query
          // for OR relationship instead of AND.
          //
          val rulesFromRules: Seq[List[JsValue]] = someRules.map(orRule => {
            orRule.asInstanceOf[JsArray].elements.toList.flatMap(
              andRules => andRules.asJsObject.fields.get("terms").toList
            )
          })
          val supports = result.asJsObject.fields
            .get("support")
            .toList
            .flatMap(support => support.asInstanceOf[JsArray].elements.toList)

          if (supports.nonEmpty)
            throw new Exception(s"Don't know how to use supports ${supports.asInstanceOf[JsArray]}")

          val rules: List[List[JsValue]] = rulesFromRules.toList
          val theRules1: List[List[List[RegoTerm]]] = rules
            .map(orRule => {
              val theRules = orRule
              theRules.map(parseRule)
            })

          val theRules: List[List[OpaQuery]] = theRules1.map(orRules => {
            orRules.map({
              case List(RegoTermRef(RegoRefPartVar("input") :: path)) => {
                OpaQueryExists(regoRefPathToOpaRefPath(path))
              }
              case List(RegoTermBoolean(false)) => {
                OpaQueryMatchNone
              }
              case List(RegoTermBoolean(true)) => {
                OpaQueryMatchAll
              }
              case List(
              operation: RegoTermVar,
              path: RegoTermRef,
              value: RegoTermValue
              ) => {
                val thePath: List[OpaRef] = regoRefPathToOpaRefPath(path.value)
                val theOperation: OpaOp = operation match {
                  case RegoTermVar(opString: String) =>
                    OpaOp(opString)
                }
                val theValue = value match {
                  case RegoTermBoolean(aValue) => OpaValueBoolean(aValue)
                  case RegoTermString(aValue) => OpaValueString(aValue)
                  case RegoTermNumber(aValue) => OpaValueNumber(aValue)
                }

                OpaQueryMatchValue(
                  path = thePath,
                  operation = theOperation,
                  value = theValue
                )
              }
              case x => {
                throw new Exception(s"Don't know how to handle $x")
              }
            })
          })

          theRules
        }
    }

    rulesOpt
  }

  private val allInArrayPattern = "\\$.*".r
  private def regoRefPathToOpaRefPath(path: List[RegoRefPart]): List[OpaRef] = {
    path.flatMap {
      case RegoRefPartVar(allInArrayPattern()) =>
        Some(OpaRefAllInArray)
      case x:RegoRefPartString                 =>
        val theValue: RegoRefPartString = x
        Some(OpaRefObjectKey2(theValue))
      case RegoRefPartVar("input")             =>
        None
      case x                                   =>
        throw new Exception("Could not understand " + x)
    }
  }

  private def parseRule(terms: JsValue): List[RegoTerm] = {
    // terms look like:
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
    // or
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
    if (theTerms.length != 3){
      throw new Exception(s"$theTerms must consist of 3 elements.")
    }
    else {
      val regoTerms = theTerms.flatMap(term => {
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
      val value: RegoTerm = if (regoTerms(1) == RegoTermVar("input")) regoTerms.last else regoTerms(1)
      val path: List[RegoRefPart] = if (regoTerms(1) == RegoTermVar("input")) {
        regoTerms.slice(2, regoTerms.length - 1).map(term => {
          val theTerm = term match {
            case RegoTermString(v) => List(v)
            case e => throw new Exception(s"Don't know how to handle $e")
          }
          RegoRefPartString(theTerm.mkString(""))
        })
      }
      else {
        regoTerms.slice(3, regoTerms.length).map(term => {
          val theTerm = term match {
            case RegoTermString(v) => List(v)
            case RegoTermVar(allInArrayPattern()) => List("[_]")
            case e => throw new Exception(s"Don't know how to handle $e")
          }
          RegoRefPartString(theTerm.mkString(""))
        })
      }
      List(operation, RegoTermRef(path), value)
    }
  }

  private def parseTerm(termJson: JsValue): RegoTerm = RegoTerm(termJson)

}
