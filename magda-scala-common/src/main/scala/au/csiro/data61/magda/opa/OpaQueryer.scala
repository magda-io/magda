package au.csiro.data61.magda.opa

import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.model._
import akka.http.scaladsl.model.headers.RawHeader
import akka.stream.Materializer
import com.typesafe.config.Config
import akka.util.ByteString
import scala.concurrent.duration._
import spray.json._

import scala.concurrent.{ExecutionContext, Future}

sealed trait OpaOp extends OpaRef
case object Eq extends OpaOp
case object Neq extends OpaOp
case object Lt extends OpaOp
case object Gt extends OpaOp
case object Lte extends OpaOp
case object Gte extends OpaOp

object OpaOp {
  def apply(op: String) = op match {
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

case class OpaPartialResponse(
    queries: List[OpaQuery]
)

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
// case class RegoRefPartBoolean(value: Boolean) extends RegoRefPart
// case class RegoRefPartInteger(value: Int) extends RegoRefPart
// case class RegoRefPartFloat(value: Double) extends RegoRefPart
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

/**
  *
  * @param unknownDataRefs: the dataset refs that set to `unknown` for OPA's partial evaluation
  * @param config
  * @param system
  * @param ec
  * @param materializer
  */
class OpaQueryer()(
    implicit val config: Config,
    implicit val system: ActorSystem,
    implicit val ec: ExecutionContext,
    implicit val materializer: Materializer
) {

  private val opaUrl: String = config.getConfig("opa").getString("baseUrl")
  private val logger = system.log

  var hasErrors = false
  var errors: List[String] = List()

  private def reportErrorWithMatchNoneQuery(message: String): List[OpaQuery] = {
    hasErrors = true
    errors = message :: errors
    logger.warning(message)
    List(OpaQueryMatchNone)
  }

  private def resetErrors() = {
    errors = List()
    hasErrors = false
  }

  def query(jwtToken: Option[String]): Future[List[OpaQuery]] = {
    val requestData: String = s"""{
      |  "query": "data.object.registry.aspect.orgunit.view",
      |  "unknowns": ["input.object"]
      |}""".stripMargin

    println(requestData)

    println(jwtToken)
    var headers = List(RawHeader("X-Magda-Session", jwtToken.get))
    // if (!testSessionId.isEmpty) {
    //   // --- only used for testing so that MockServer can server different tests in parallel
    //   headers = RawHeader("x-test-session-id", testSessionId.get) :: headers
    // }

    val httpRequest = HttpRequest(
      uri = s"${opaUrl}/compile",
      method = HttpMethods.POST,
      entity = HttpEntity(ContentTypes.`application/json`, requestData),
      headers = headers
    )

    // val httpRequest = HttpRequest(
    //   uri = "http://localhost:30104/v0/public/users/whoami",
    //   method = HttpMethods.GET,
    //   // entity = HttpEntity(ContentTypes.`application/json`, requestData),
    //   headers = headers
    // )
    // var unknownDataRefs: List[String] = List("input.object.dataset")
    // unknownDataRefs = unknownDataRefs
    //   .map(_.trim)
    //   .filter(_.length > 0)
    //   .sortWith(_.length > _.length)
    Http().singleRequest(httpRequest).flatMap(parseOpaResponse(_))
  }

  def parseOpaResponse(res: HttpResponse): Future[List[OpaQuery]] = {
    if (res.status.intValue() != 200) {
      res.entity.dataBytes.runFold(ByteString(""))(_ ++ _).flatMap { body =>
        logger
          .error(s"OPA failed to process the request: {}", body.utf8String)
        Future.failed(
          new Error(
            s"Failed to retrieve access control decision from OPA: ${body.utf8String}"
          )
        )
      }
    } else {

      res.entity.toStrict(10.seconds).map { entity =>
        val json = entity.data.utf8String.parseJson
        println(json.prettyPrint)

        val resultOpt = json.asJsObject.fields
          .get("result")

        val rulesOpt = for {
          result <- resultOpt
          support <- result.asJsObject.fields.get("support")
          supports = support.asInstanceOf[JsArray].elements.toList
          rulesFromSupports = supports
            .flatMap(
              _.asJsObject.fields.get("rules").map(_.asInstanceOf[JsArray])
            )
            .flatMap(_.elements.toList)
            .flatMap(
              _.asJsObject.fields
                .get("body")
                .map(_.asInstanceOf[JsArray])
            )
            .flatMap(_.elements.toList)
          queriesElement <- result.asJsObject.fields.get("queries")
          rulesFromQueries = queriesElement
            .asInstanceOf[JsArray]
            .elements
            .toList
            .flatMap(_.asInstanceOf[JsArray].elements.toList)
        } yield rulesFromSupports ++ rulesFromQueries

        println(rulesOpt.get.foreach(_.prettyPrint))

        val parsedRules = rulesOpt match {
          case Some(rules) => rules.map(parseRule)
          case None =>
            throw new Exception("Could not parse" + rulesOpt.toString)
        }

        println(parsedRules)

        val opaQueries = parsedRules.flatMap {
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
                  case RegoTermBoolean(value) => OpaValueBoolean(value)
                  case RegoTermString(value)  => OpaValueString(value)
                  case RegoTermNumber(value)  => OpaValueNumber(value)
                }
              )
            )
          case List(RegoTermRef(RegoRefPartVar("input") :: path)) =>
            Some(OpaQueryExists(regoRefPathToOpaRefPath(path)))
          case _ => None
        }

        opaQueries
      }
    }
  }

  val allInArrayPattern = "\\$.*".r
  private def regoRefPathToOpaRefPath(path: List[RegoRefPart]): List[OpaRef] = {
    path.flatMap {
      case RegoRefPartVar(allInArrayPattern()) => Some(OpaRefAllInArray)
      case RegoRefPartString(value)             => Some(OpaRefObjectKey(value))
      case RegoRefPartVar("input")              => None
      case x                                    => throw new Exception("Could not understand " + x)
    }
  }

  private def parseRule(ruleJson: JsValue): List[RegoTerm] = {
    ruleJson match {
      case (ruleJsonObject: JsObject) =>
        val terms = ruleJsonObject
          .fields("terms")

        terms match {
          case (termsObj: JsObject) => {
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
          }
          case (termsArr: JsArray) => {
            termsArr.elements.toList
              .map(parseTerm)
          }
          case _ => throw new Exception("Could not parse rule " + ruleJson)
        }
      case _ => throw new Exception("Could not parse rule " + ruleJson)
    }
  }

  private def parseTerm(termJson: JsValue): RegoTerm = RegoTerm(termJson)

  // private def parseRule(ruleJson: JsValue): OpaQuery = {
  //   ruleJson match {
  //     case JsObject(rule) =>
  //       val isDefault: Boolean = rule
  //         .get("default")
  //         .flatMap {
  //           case JsBoolean(v) => Some(v)
  //           case _            => None
  //         }
  //         .getOrElse(false)

  //       val defaultValue: Option[JsValue] = rule.get("head").flatMap {
  //         case JsObject(head) =>
  //           head.get("value").flatMap(_.asJsObject.fields.get("value"))
  //         case _ => None
  //       }

  //       if (isDefault) {
  //         //--- it's a default rule; rule body can be ignored
  //         defaultValue match {
  //           case Some(JsTrue) => List(OpaQueryMatchAll)
  //           case _            => List(OpaQueryMatchNone)
  //         }
  //       } else {
  //         val ruleExps = rule
  //           .get("body")
  //           .toList
  //           .flatMap(_.asInstanceOf[JsArray].elements.map(_.asJsObject))
  //         val ruleExpQueries = ruleExps.flatMap(ruleExpressionToQueryDef(_))
  //         if (ruleExpQueries.isEmpty) {
  //           List(OpaQueryMatchNone)
  //         } else {
  //           if (ruleExpQueries.size == 0) List(OpaQueryMatchNone)
  //           else (ruleExpQueries)
  //         }
  //       }
  //     case _ =>
  //       reportErrorWithMatchNoneQuery(s"Rule should be JsObject: ${ruleJson}")
  //   }
  // }

  // private def translateDataRefString(refString: String): String = {
  //   unknownDataRefs.find { prefix =>
  //     s"^${prefix}".r.findFirstIn(refString) match {
  //       case None => false
  //       case _    => true
  //     }
  //   } match {
  //     case Some(prefix: String) => refString.replaceFirst(s"^${prefix}\\.", "")
  //     case _                    => refString
  //   }
  // }

  // def parseTerm(term: RegoRef) {}

  // private def ruleExpressionToQueryDef(expJson: JsValue): List[OpaQuery] = {

  //   expJson match {
  //     case JsObject(exp) =>
  //       val terms = exp
  //         .get("terms")
  //         .toArray
  //         .flatMap(_.asInstanceOf[JsArray].elements.map(_.asJsObject))
  //       val parsedTerms = terms

  //       if (terms.size == 1) {
  //         // --- expression like data.abc with no operator
  //         // --- should use exist Query for this
  //         terms.head match {
  //           case RegoRef(r) =>
  //             if (!r.isOperator && !r.hasCollectionLookup) {
  //               List(OpaQueryExists(r.opaRef))
  //             } else {
  //               reportErrorWithMatchNoneQuery(
  //                 s"Invalid single Opa term, ref: ${r.toString}"
  //               )
  //             }
  //           case _ => {
  //             reportErrorWithMatchNoneQuery(
  //               s"Invalid single Opa term: ${terms.head}"
  //             )
  //           }
  //         }
  //       } else if (terms.size == 3) {
  //         var operator: Option[OpaOp] = None
  //         var datasetRef: Option[RegoRef] = None
  //         var value: Option[RegoValue] = None

  //         val parsed = terms
  //           .foldRight[(Option[List[OpaRef]], Option[OpaOp], Option[OpaRef])](
  //             (None, None, None)
  //           )(
  //             (term, soFar) =>
  //               term match {
  //                 case RegoRef(ref) =>
  //                   if (ref.isOperator) (soFar._1, Some(ref.opaRef), soFar._3)
  //                   else (Some(ref.opaRef), soFar._2, soFar._3)
  //                 case RegoValue(v) => (soFar._1, soFar._2, Some(v))
  //                 case _            => throw new Exception(s"Invalid opa term: ${term}")
  //               }
  //           )

  //         terms.foreach { term =>
  //           term match {
  //             case RegoRef(ref) =>
  //               if (ref.isOperator) operator = ref.asInstanceOf[OpaOp]
  //               else datasetRef = Some(ref)
  //             case RegoValue(v) => value = Some(v)
  //             case _ =>
  //               reportErrorWithMatchNoneQuery(s"Invalid opa term: ${term}")
  //           }
  //         }
  //         if (datasetRef.isEmpty || operator.isEmpty || value.isEmpty) {
  //           reportErrorWithMatchNoneQuery(
  //             s"Invalid opa expression (can't locate datasetRef, operator or value): ${expJson}"
  //           )
  //         } else {
  //           createQueryForThreeTermsExpression(
  //             datasetRef.get,
  //             operator.get,
  //             value.get
  //           )
  //         }
  //       } else {
  //         // --- we only support 1 or 3 terms expression
  //         // --- 2 terms expression are very rare (or unlikely) to produce in rego
  //         reportErrorWithMatchNoneQuery(
  //           s"Invalid ${terms.size} Opa terms expression: ${expJson}"
  //         )
  //       }
  //     case _ =>
  //       reportErrorWithMatchNoneQuery(
  //         s"Rule expression should be JsObject: ${expJson}"
  //       )
  //   }
  // }

  // private def mergeNonMatchQueries(
  //     queries: List[QueryDefinition]
  // ): List[QueryDefinition] = {
  //   val reducedQueries = if (queries.size > 1 && queries.exists {
  //                              case MatchNoneQuery(x) => true
  //                              case _                 => false
  //                            }) {

  //     /**
  //       * If contains more than one query & at least one is MatchNoneQuery
  //       * Will filter out MatchNoneQuery as it does nothing
  //       */
  //     queries.filter {
  //       case MatchNoneQuery(x) => false
  //       case _                 => true
  //     }
  //   } else {
  //     queries
  //   }

  //   if (reducedQueries.size == 0) List(OpaQueryMatchNone)
  //   else reducedQueries
  // }

  // private def unknownDataRefsJson =
  //   JsArray(unknownDataRefs.map(JsString(_)).toVector)

  // def publishingStateQuery(
  //     publishingStateValue: Set[FilterValue[String]],
  //     jwtToken: Option[String]
  // ): Future[QueryDefinition] = {

  //   resetErrors()

  //   var filteredValue = publishingStateValue
  //     .map(value => {
  //       value match {
  //         case Specified(inner) => inner
  //         case Unspecified()    => ""
  //       }
  //     })
  //     .filter(_ != "")
  //     .toList

  //   // --- if "*" means all possible publishingState, should ignore all other options
  //   if (filteredValue.exists(_ == "*")) filteredValue = List("*")

  //   filteredValue = if (!filteredValue.isEmpty) filteredValue else List("*")

  //   val opaRequestFutures = filteredValue.map { datasetType =>
  //     val requestData: String = s"""{
  //                                |  "query": "data.object.dataset.allow",
  //                                |  "input": {
  //                                |    "operationUri": "object/dataset/${datasetType}/read"
  //                                |  },
  //                                |  "unknowns": ${unknownDataRefsJson
  //                                    .toString()}
  //                                |}""".stripMargin

  //     var headers = List(RawHeader("X-Magda-Session", jwtToken.getOrElse("")))
  //     if (!testSessionId.isEmpty) {
  //       // --- only used for testing so that MockServer can server different tests in parallel
  //       headers = RawHeader("x-test-session-id", testSessionId.get) :: headers
  //     }

  //     val httpRequest = HttpRequest(
  //       uri = s"${opaUrl}compile",
  //       method = HttpMethods.POST,
  //       entity = HttpEntity(ContentTypes.`application/json`, requestData),
  //       headers = headers
  //     )

  //     Http().singleRequest(httpRequest).flatMap(parseOpaResponse(_))
  //   }

  //   Future.Listuence(opaRequestFutures).map { queries =>
  //     val combinedQuery = mergeNonMatchQueries(queries.flatten)

  //     boolQuery().should(combinedQuery).minimumShouldMatch(1)
  //   }
  // }

}
