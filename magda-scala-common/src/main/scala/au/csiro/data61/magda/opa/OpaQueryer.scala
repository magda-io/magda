package au.csiro.data61.magda.opa

import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.model._
import akka.http.scaladsl.model.headers.RawHeader
import akka.stream.Materializer
import akka.util.ByteString
import au.csiro.data61.magda.Authentication
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
// case class OpaRefVar(value: String) extends OpaRef
  case object OpaRefAllInArray extends OpaRef
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
  case object OpaQueryMatchAll extends OpaQuery
  case object OpaQueryMatchNone extends OpaQuery
  case object OpaQueryMatchNoAccessControl extends OpaQuery
  case object OpaQuerySkipAccessControl extends OpaQuery

  case class OpaPartialResponse(
      queries: List[OpaQuery]
  )
}

import au.csiro.data61.magda.opa.OpaTypes._

/**
  * Part of a RegoRef - i.e. one element in the array of the AST like so:
  *
  * {
        "type": "var",
        "value": "input"
    }
  */
// case class RegoRefPart(refType: String, refString: String) {
//   def isVar: Boolean = refType == "var"
// }

// object RegoRefPart {
//   def unapply(json: JsValue): Option[RegoRefPart] = json match {
//     case JsObject(data) =>
//       (data.get("type"), data.get("value")) match {
//         case (Some(refType), Some(refValue)) =>
//           Some(RegoRefPart(refType.toString, refValue.toString))
//         case _ => None
//       }
//     case _ => None
//   }
// }

// case class RegoRef(refParts: List[RegoRefPart]) {
//   def opaRef: List[OpaRef] = {
//     refParts.map {
//       case RegoRefPart("var", "equal")     => Eq
//       case RegoRefPart("var", "neq")       => Neq
//       case RegoRefPart("var", "lt")        => Lt
//       case RegoRefPart("var", "gt")        => Gt
//       case RegoRefPart("var", "lte")       => Lte
//       case RegoRefPart("var", "gte")       => Gte
//       case RegoRefPart("var", "[_]")       => OpaRefAllInArray
//       case RegoRefPart("var", refValue)    => OpaRefVar(refValue)
//       case RegoRefPart("string", refValue) => OpaRefObjectKey(refValue)
//     }
//   }

//   def isOperator: Boolean = {
//     this.opaRef.contains(
//       (x: OpaRef) =>
//         x match {
//           case (x: OpaOp) => true
//           case _          => false
//         }
//     )
//   }

//   // --- the first var type won't count as collection lookup
//   def hasCollectionLookup: Boolean = {
//     if (refParts.size <= 1) false
//     else refParts.indexWhere(_.isVar, 1) != -1
//   }

//   // -- simple collection only contains 1 level lookup
//   // -- we don't need Nested Query to handle it
//   def isSimpleCollectionLookup: Boolean = {
//     if (refParts.size <= 1) false
//     else refParts.indexWhere(_.isVar, 1) == refParts.size - 1
//   }
// }

// object RegoRef {
//   def unapply(refJson: JsValue): Option[RegoRef] = refJson match {
//     case JsObject(ref) =>
//       ref.get("type") match {
//         case Some(JsString("ref")) =>
//           ref.get("value") match {
//             case Some(JsArray(values)) =>
//               val RegoRefArray = values.flatMap {
//                 case RegoRefPart(part) => Some(part)
//                 case _                 => None
//               }.toArray
//               Some(RegoRef(RegoRefArray))
//             case _ => None
//           }
//         case _ => None
//       }
//     case _ => None
//   }

// }

// case class RegoValue(valueType: String, value: JsValue) extends RegoValue
// {}

// def asNumber: Option[Number] = value match {
//   case JsNumber(v) => Some(v)
//   case _           => None
// }

// def asString: Option[String] = value match {
//   case JsNumber(v) => Some(v.toString())
//   case JsString(v) => Some(v)
//   case JsTrue      => Some("true")
//   case JsFalse     => Some("false")
//   case _           => None
// }

// def asBoolean: Option[Boolean] = value match {
//   case JsBoolean(v) => Some(v)
//   case _            => None
// }
// }

// object RegoValue {

//   def unapply(refJson: JsValue): Option[RegoValue] = refJson match {
//     case JsObject(ref) =>
//       ref.get("type") match {
//         case Some(JsString(typeString)) if typeString != "ref" =>
//           ref.get("value") match {
//             case Some(v: JsNumber)  => Some(RegoValue(typeString, v))
//             case Some(v: JsString)  => Some(RegoValue(typeString, v))
//             case Some(v: JsBoolean) => Some(RegoValue(typeString, v))
//             case _                  => None
//           }
//         case _ => None
//       }
//     case _ => None
//   }

// }

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
          recieveOpaResponse(res)(_.asJsObject.fields.get("result") match {
            case Some(JsBoolean(true)) => true
            case _                     => false
          })
      )
  }

  def queryRecord(
    jwtToken: Option[String],
    policyId: String
  ): Future[List[OpaQuery]] = {
    queryPolicy(jwtToken, policyId)
  }
  
  def queryAsDefaultUser(
      policyId: String
  ): Future[List[OpaQuery]] = {
    val jwt = JWT
      .create()
      .withClaim("userId", config.getString("auth.userId"))
      .sign(Authentication.algorithm)

    queryPolicy(Some(jwt), policyId)
  }

  def queryPolicy(
      jwtToken: Option[String],
      policyId: String
  ): Future[List[OpaQuery]] = {
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
      .flatMap(recieveOpaResponse[List[OpaQuery]](_) { json =>
        parseOpaResponse(json)
      })
  }

  def recieveOpaResponse[T](res: HttpResponse)(fn: JsValue => T): Future[T] = {
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

  def parseOpaResponse(json: JsValue): List[OpaQuery] = {
    val result = json.asJsObject.fields
      .get("result") match {
      case Some(aResult) => aResult
      case None         => throw new Exception("Got no result for opa query")
    }

    val rulesOpt = result.asJsObject.fields
      .get("queries") match {
      case None                    => List(OpaQueryMatchNone)
      case Some(JsArray(Vector())) => List(OpaQueryMatchAll)
      case Some(JsArray(rules)) =>
        val rulesFromRules = rules.flatMap(
          rules => rules.asInstanceOf[JsArray].elements.toList
        )
        val supports = result.asJsObject.fields
          .get("support")
          .toList
          .flatMap(support => support.asInstanceOf[JsArray].elements.toList)
        val rulesFromSupports = supports
          .flatMap(
            _.asJsObject.fields.get("rules").map(_.asInstanceOf[JsArray])
          )
          .flatMap(_.elements.toList)
          .flatMap { element =>
            val fields = element.asJsObject.fields
            val isDefault = fields.getOrElse("default", JsFalse)
              .asInstanceOf[JsBoolean]
              .value
            val headValue =
              element.asJsObject
                .fields("head")
                .asJsObject
                .fields("value")

            headValue.asJsObject
              .fields("value") match {
              case JsBoolean(true) =>
                element.asJsObject.fields
                  .get("body")
                  .map(_.asInstanceOf[JsArray])
              case JsBoolean(false) if isDefault =>
                //noinspection ScalaDeprecation
                Seq(JsArray(List(JsObject("terms" -> headValue))))
              case _ =>
                throw new Exception(
                  "Found head value with value other than true that wasn't default"
                )
            }

          }
          .flatMap(_.elements.toList)

        (rulesFromRules ++ rulesFromSupports).toList
          .map(parseRule)
          .flatMap {
            case List(
                operation: RegoTermRef,
                value: RegoTermValue,
                path: RegoTermRef
                ) =>
              Some(
                OpaQueryMatchValue(
                  path = regoRefPathToOpaRefPath(path.value),
                  operation = operation match {
                    case RegoTermRef(
                        List(RegoRefPartVar(opString: String))
                        ) =>
                      OpaOp(opString)
                  },
                  value = value match {
                    case RegoTermBoolean(aValue) => OpaValueBoolean(aValue)
                    case RegoTermString(aValue)  => OpaValueString(aValue)
                    case RegoTermNumber(aValue)  => OpaValueNumber(aValue)
                  }
                )
              )
            case List(RegoTermRef(RegoRefPartVar("input") :: path)) =>
              Some(OpaQueryExists(regoRefPathToOpaRefPath(path)))
            case List(RegoTermBoolean(false)) => Some(OpaQueryMatchNone)
            case _                            => None
          }

    }

    println(rulesOpt)
    rulesOpt
  }

  private val allInArrayPattern = "\\$.*".r
  private def regoRefPathToOpaRefPath(path: List[RegoRefPart]): List[OpaRef] = {
    path.flatMap {
      case RegoRefPartVar(allInArrayPattern()) => Some(OpaRefAllInArray)
      case RegoRefPartString(value)            => Some(OpaRefObjectKey(value))
      case RegoRefPartVar("input")             => None
      case x                                   => throw new Exception("Could not understand " + x)
    }
  }

  private def parseRule(ruleJson: JsValue): List[RegoTerm] = {
    ruleJson match {
      case ruleJsonObject: JsObject =>
        val terms = ruleJsonObject
          .fields("terms")

        terms match {
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
              case _ => throw new Exception("Could not parse rule " + ruleJson)
            }
          case termsArr: JsArray =>
            termsArr.elements.toList
              .map(parseTerm)
          case _ => throw new Exception("Could not parse rule " + ruleJson)
        }
      case _ => throw new Exception("Could not parse rule " + ruleJson)
    }
  }

  private def parseTerm(termJson: JsValue): RegoTerm = RegoTerm(termJson)

}
