package au.csiro.data61.magda.search.elasticsearch

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

sealed trait OpaRef
case class OpaRefVar(value: String) extends OpaRef
case object OpaRefAllInArray extends OpaRef
case class OpaRefObjectKey(key: String) extends OpaRef

sealed trait OpaQuery
case class OpaQueryMatchValue(
    path: Seq[OpaRef],
    operation: OpaOp,
    value: JsValue
) extends OpaQuery
case class OpaQueryExists(
    path: Seq[OpaRef]
) extends OpaQuery
case object OpaQueryMatchAll extends OpaQuery
case object OpaQueryMatchNone extends OpaQuery

case class OpaPartialResponse(
    queries: Seq[OpaQuery]
)

/**
  * Part of a RegoRef - i.e. one element in the array of the AST like so:
  *
  * {
        "type": "var",
        "value": "input"
    }
  */
case class RegoRefPart(refType: String, refString: String) {
  def isVar: Boolean = refType == "var"
}

object RegoRefPart {
  def unapply(json: JsValue): Option[RegoRefPart] = json match {
    case JsObject(data) =>
      (data.get("type"), data.get("value")) match {
        case (Some(refType), Some(refValue)) =>
          Some(RegoRefPart(refType.toString, refValue.toString))
        case _ => None
      }
    case _ => None
  }
}

case class RegoRef(refParts: Seq[RegoRefPart]) {
  def opaRef: Seq[OpaRef] = {
    refParts.map {
      case RegoRefPart("var", "equal")     => Eq
      case RegoRefPart("var", "neq")       => Neq
      case RegoRefPart("var", "lt")        => Lt
      case RegoRefPart("var", "gt")        => Gt
      case RegoRefPart("var", "lte")       => Lte
      case RegoRefPart("var", "gte")       => Gte
      case RegoRefPart("var", "[_]")       => OpaRefAllInArray
      case RegoRefPart("var", refValue)    => OpaRefVar(refValue)
      case RegoRefPart("string", refValue) => OpaRefObjectKey(refValue)
    }
  }

  def isOperator: Boolean = {
    this.opaRef.contains(
      (x: OpaRef) =>
        x match {
          case (x: OpaOp) => true
          case _          => false
        }
    )
  }

  // --- the first var type won't count as collection lookup
  def hasCollectionLookup: Boolean = {
    if (refParts.size <= 1) false
    else refParts.indexWhere(_.isVar, 1) != -1
  }

  // -- simple collection only contains 1 level lookup
  // -- we don't need Nested Query to handle it
  def isSimpleCollectionLookup: Boolean = {
    if (refParts.size <= 1) false
    else refParts.indexWhere(_.isVar, 1) == refParts.size - 1
  }
}

object RegoRef {
  def unapply(refJson: JsValue): Option[RegoRef] = refJson match {
    case JsObject(ref) =>
      ref.get("type") match {
        case Some(JsString("ref")) =>
          ref.get("value") match {
            case Some(JsArray(values)) =>
              val RegoRefArray = values.flatMap {
                case RegoRefPart(part) => Some(part)
                case _                 => None
              }.toArray
              Some(RegoRef(RegoRefArray))
            case _ => None
          }
        case _ => None
      }
    case _ => None
  }

}


case class RegoValue(valueType: String, value: JsValue) {

  def asNumber:Option[Number] = value match {
    case JsNumber(v) => Some(v)
    case _ => None
  }

  def asString:Option[String] = value match {
    case JsNumber(v) => Some(v.toString())
    case JsString(v) => Some(v)
    case JsTrue => Some("true")
    case JsFalse => Some("false")
    case _ => None
  }

  def asBoolean:Option[Boolean] = value match {
    case JsBoolean(v) => Some(v)
    case _ => None
case class RegoValue(valueType: String, value: JsValue) {

  def asNumber: Option[Number] = value match {
    case JsNumber(v) => Some(v)
    case _           => None
  }

  def asString: Option[String] = value match {
    case JsNumber(v) => Some(v.toString())
    case JsString(v) => Some(v)
    case JsTrue      => Some("true")
    case JsFalse     => Some("false")
    case _           => None
  }

  def asBoolean: Option[Boolean] = value match {
    case JsBoolean(v) => Some(v)
    case _            => None
  }

}

object RegoValue {

  def unapply(refJson: JsValue): Option[RegoValue] = refJson match {
    case JsObject(ref) =>
      ref.get("type") match {
        case Some(JsString(typeString)) if typeString != "ref" =>
          ref.get("value") match {
            case Some(v: JsNumber)  => Some(RegoValue(typeString, v))
            case Some(v: JsString)  => Some(RegoValue(typeString, v))
            case Some(v: JsBoolean) => Some(RegoValue(typeString, v))
            case _                  => None
          }
        case _ => None
      }
    case _ => None
  }

}

sealed trait RegoRule

/**
  *
  * @param unknownDataRefs: the dataset refs that set to `unknown` for OPA's partial evaluation
  * @param config
  * @param system
  * @param ec
  * @param materializer
  */
class OpaParser(var unknownDataRefs: Seq[String] = Seq("input.object.dataset"))(
    implicit val config: Config,
    implicit val system: ActorSystem,
    implicit val ec: ExecutionContext,
    implicit val materializer: Materializer
) {

  private val logger = system.log

  var hasErrors = false
  var errors: List[String] = List()

  unknownDataRefs = unknownDataRefs
    .map(_.trim)
    .filter(_.length > 0)
    .sortWith(_.length > _.length)

  private def reportErrorWithMatchNoneQuery(message: String): Seq[OpaQuery] = {
    hasErrors = true
    errors = message :: errors
    logger.warning(message)
    Seq(OpaQueryMatchNone)
  }

  private def resetErrors() = {
    errors = List()
    hasErrors = false
  }

  private def parseOpaResponse(res: HttpResponse): Future[Seq[OpaQuery]] = {
    if (res.status.intValue() != 200) {
      res.entity.dataBytes.runFold(ByteString(""))(_ ++ _).flatMap { body =>
        logger.error(s"OPA failed to process the request: {}", body.utf8String)
        Future.failed(
          new Error(
            s"Failed to retrieve access control decision from OPA: ${body.utf8String}"
          )
        )
      }
    } else {

      res.entity.toStrict(10.seconds).map { entity =>
        val json = entity.data.utf8String.parseJson
        val resultOpt = json.asJsObject.fields
          .get("result")
        val rules = for {
          result <- resultOpt
          support <- result.asJsObject.fields.get("support")
          supports = support.asInstanceOf[JsArray].elements.toSeq
          rulesFromSupports = supports
            .flatMap(
              _.asJsObject.fields.get("rules").map(_.asInstanceOf[JsArray])
            )
            .flatMap(_.elements.toSeq)
            .flatMap(
              _.asJsObject.fields
                .get("body")
                .map(_.asInstanceOf[JsArray])
            )
            .flatMap(_.elements.toSeq)
          queriesElement <- result.asJsObject.fields.get("queries")
          rulesFromQueries = queriesElement.asInstanceOf[JsArray].elements.toSeq
        } yield rulesFromSupports ++ rulesFromQueries

        val parsedRules = rules.map(parseRule)

      // -> )
      // .flatMap(_.asJsObject.fields.get("rules"))

      // val ruleQueries =
      //   .toSeq
      //   .flatMap(_.asInstanceOf[JsArray].elements)
      //   .map(parseRule(_))

      // mergeNonMatchQueries(ruleQueries)
      }
    }
  }

  private def parseRule(ruleJson: JsValue): OpaQuery = {
    ruleJson match {
      case JsObject(rule) =>
        val isDefault: Boolean = rule
          .get("default")
          .flatMap {
            case JsBoolean(v) => Some(v)
            case _            => None
          }
          .getOrElse(false)

        val defaultValue: Option[JsValue] = rule.get("head").flatMap {
          case JsObject(head) =>
            head.get("value").flatMap(_.asJsObject.fields.get("value"))
          case _ => None
        }

        if (isDefault) {
          //--- it's a default rule; rule body can be ignored
          defaultValue match {
            case Some(JsTrue) => Seq(OpaQueryMatchAll)
            case _            => Seq(OpaQueryMatchNone)
          }
        } else {
          val ruleExps = rule
            .get("body")
            .toSeq
            .flatMap(_.asInstanceOf[JsArray].elements.map(_.asJsObject))
          val ruleExpQueries = ruleExps.flatMap(ruleExpressionToQueryDef(_))
          if (ruleExpQueries.isEmpty) {
            Seq(OpaQueryMatchNone)
          } else {
            if (ruleExpQueries.size == 0) Seq(OpaQueryMatchNone)
            else (ruleExpQueries)
          }
        }
      case _ =>
        reportErrorWithMatchNoneQuery(s"Rule should be JsObject: ${ruleJson}")
    }
  }

  private def translateDataRefString(refString: String): String = {
    unknownDataRefs.find { prefix =>
      s"^${prefix}".r.findFirstIn(refString) match {
        case None => false
        case _    => true
      }
    } match {
      case Some(prefix: String) => refString.replaceFirst(s"^${prefix}\\.", "")
      case _                    => refString
    }
  }

  def parseTerm(term: RegoRef) {}

  private def ruleExpressionToQueryDef(expJson: JsValue): Seq[OpaQuery] = {

    expJson match {
      case JsObject(exp) =>
        val terms = exp
          .get("terms")
          .toArray
          .flatMap(_.asInstanceOf[JsArray].elements.map(_.asJsObject))
        val parsedTerms = terms

        if (terms.size == 1) {
          // --- expression like data.abc with no operator
          // --- should use exist Query for this
          terms.head match {
            case RegoRef(r) =>
              if (!r.isOperator && !r.hasCollectionLookup) {
                Seq(OpaQueryExists(r.opaRef))
              } else {
                reportErrorWithMatchNoneQuery(
                  s"Invalid single Opa term, ref: ${r.toString}"
                )
              }
            case _ => {
              reportErrorWithMatchNoneQuery(
                s"Invalid single Opa term: ${terms.head}"
              )
            }
          }
        } else if (terms.size == 3) {
          var operator: Option[OpaOp] = None
          var datasetRef: Option[RegoRef] = None
          var value: Option[RegoValue] = None

          val parsed = terms
            .foldRight[(Option[Seq[OpaRef]], Option[OpaOp], Option[OpaRef])](
              (None, None, None)
            )(
              (term, soFar) =>
                term match {
                  case RegoRef(ref) =>
                    if (ref.isOperator) (soFar._1, Some(ref.opaRef), soFar._3)
                    else (Some(ref.opaRef), soFar._2, soFar._3)
                  case RegoValue(v) => (soFar._1, soFar._2, Some(v))
                  case _            => throw new Exception(s"Invalid opa term: ${term}")
                }
            )

          terms.foreach { term =>
            term match {
              case RegoRef(ref) =>
                if (ref.isOperator) operator = ref.asInstanceOf[OpaOp]
                else datasetRef = Some(ref)
              case RegoValue(v) => value = Some(v)
              case _ =>
                reportErrorWithMatchNoneQuery(s"Invalid opa term: ${term}")
            }
          }
          if (datasetRef.isEmpty || operator.isEmpty || value.isEmpty) {
            reportErrorWithMatchNoneQuery(
              s"Invalid opa expression (can't locate datasetRef, operator or value): ${expJson}"
            )
          } else {
            createQueryForThreeTermsExpression(
              datasetRef.get,
              operator.get,
              value.get
            )
          }
        } else {
          // --- we only support 1 or 3 terms expression
          // --- 2 terms expression are very rare (or unlikely) to produce in rego
          reportErrorWithMatchNoneQuery(
            s"Invalid ${terms.size} Opa terms expression: ${expJson}"
          )
        }
      case _ =>
        reportErrorWithMatchNoneQuery(
          s"Rule expression should be JsObject: ${expJson}"
        )
    }
  }

  private def mergeNonMatchQueries(
      queries: Seq[QueryDefinition]
  ): Seq[QueryDefinition] = {
    val reducedQueries = if (queries.size > 1 && queries.exists {
                               case MatchNoneQuery(x) => true
                               case _                 => false
                             }) {

      /**
        * If contains more than one query & at least one is MatchNoneQuery
        * Will filter out MatchNoneQuery as it does nothing
        */
      queries.filter {
        case MatchNoneQuery(x) => false
        case _                 => true
      }
    } else {
      queries
    }

    if (reducedQueries.size == 0) Seq(OpaQueryMatchNone)
    else reducedQueries
  }

  private def unknownDataRefsJson =
    JsArray(unknownDataRefs.map(JsString(_)).toVector)

  def publishingStateQuery(
      publishingStateValue: Set[FilterValue[String]],
      jwtToken: Option[String]
  ): Future[QueryDefinition] = {

    resetErrors()

    var filteredValue = publishingStateValue
      .map(value => {
        value match {
          case Specified(inner) => inner
          case Unspecified()    => ""
        }
      })
      .filter(_ != "")
      .toSeq

    // --- if "*" means all possible publishingState, should ignore all other options
    if (filteredValue.exists(_ == "*")) filteredValue = List("*")

    filteredValue = if (!filteredValue.isEmpty) filteredValue else List("*")

    val opaRequestFutures = filteredValue.map { datasetType =>
      val requestData: String = s"""{
                                 |  "query": "data.object.dataset.allow",
                                 |  "input": {
                                 |    "operationUri": "object/dataset/${datasetType}/read"
                                 |  },
                                 |  "unknowns": ${unknownDataRefsJson
                                     .toString()}
                                 |}""".stripMargin

      var headers = List(RawHeader("X-Magda-Session", jwtToken.getOrElse("")))
      if (!testSessionId.isEmpty) {
        // --- only used for testing so that MockServer can server different tests in parallel
        headers = RawHeader("x-test-session-id", testSessionId.get) :: headers
      }

      val httpRequest = HttpRequest(
        uri = s"${opaUrl}compile",
        method = HttpMethods.POST,
        entity = HttpEntity(ContentTypes.`application/json`, requestData),
        headers = headers
      )

      Http().singleRequest(httpRequest).flatMap(parseOpaResponse(_))
    }

    Future.sequence(opaRequestFutures).map { queries =>
      val combinedQuery = mergeNonMatchQueries(queries.flatten)

      boolQuery().should(combinedQuery).minimumShouldMatch(1)
    }
  }

}
