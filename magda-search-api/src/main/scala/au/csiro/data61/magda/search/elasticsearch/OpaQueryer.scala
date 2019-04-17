package au.csiro.data61.magda.search.elasticsearch

import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.model._
import akka.http.scaladsl.model.headers.RawHeader
import akka.stream.Materializer
import au.csiro.data61.magda.api.{FilterValue, Specified, Unspecified}
import com.sksamuel.elastic4s.http.ElasticDsl.boolQuery
import com.sksamuel.elastic4s.searches.queries.matches.{MatchAllQuery, MatchNoneQuery}
import com.sksamuel.elastic4s.searches.queries.term.TermQuery
import com.sksamuel.elastic4s.searches.queries.{ExistsQuery, RangeQuery, Query => QueryDefinition}
import com.typesafe.config.Config
import akka.util.ByteString
import spray.json._

import scala.concurrent.{ExecutionContext, Future}

class OpaQueryer(

  implicit val config: Config,
  implicit val system: ActorSystem,
  implicit val ec: ExecutionContext,
  implicit val materializer: Materializer) {

  private val http = Http(system)
  private val logger = system.log
  private val opaUrl:String = config.getConfig("opa").getString("baseUrl")

  private val RegoOperators = Map(
    "eq" -> "=",
    "equal" -> "=",
    "neq" -> "!=",
    "lt" -> "<",
    "gt" -> ">",
    "lte" -> "<=",
    "gte" -> ">="
  )

  private def ruleToQueryDef(ruleJson:JsValue):QueryDefinition = {
    ruleJson match {
      case JsObject(rule) =>
        val isDefault:Boolean = rule.get("default").flatMap{
          case JsBoolean(v) => Some(v)
          case _ => None
        }.getOrElse(false)

        var defaultValue:Option[JsValue] = rule.get("head").flatMap{
          case JsObject(head) => head.get("value").flatMap(_.asJsObject.fields.get("value"))
          case _ => None
        }

        if(isDefault) {
          //--- it's a default rule; rule body can be ignored
          defaultValue match {
            case Some(JsTrue) => MatchAllQuery()
            case _ => MatchNoneQuery()
          }
        } else {
          val ruleExps = rule.get("body").toSeq.flatMap(_.asInstanceOf[JsArray].elements.map(_.asJsObject))
          val ruleExpQueries = ruleExps.map(ruleExpressionToQueryDef(_))
          if(ruleExpQueries.isEmpty){
            MatchNoneQuery()
          } else {
            if(ruleExpQueries.size == 0) MatchNoneQuery()
            else boolQuery().must(ruleExpQueries)
          }
        }
      case _ => MatchNoneQuery()
    }
  }

  private def jsValueToRefString(refJson: JsValue):Option[String] = {
    refJson match {
      case JsObject(ref) =>
        ref.get("type") match {
          case Some(JsString("ref")) =>
            ref.get("value") match {
              case Some(JsArray(values)) =>
                val refStr:String = values
                  .flatMap(_.asJsObject.fields.get("value"))
                  .flatMap{
                    case JsString(v) => Some(v)
                    case _ => None
                  }.mkString(".")
                Some(refStr)
              case _ => None
            }
          case _ => None
        }
      case _ => None
    }
  }

  private def unboxOperandValue(refJson: JsValue):Option[JsValue] = {
    refJson match {
      case JsObject(ref) => ref.get("value")
      case _ => None
    }
  }

  private def ruleExpressionToQueryDef(expJson:JsValue):QueryDefinition = {

    expJson match {
      case JsObject(exp) =>
        val terms = exp.get("terms").toArray.flatMap(_.asInstanceOf[JsArray].elements.map(_.asJsObject))
        if(terms.size != 3) {
          // --- all our policy residual should be in form of 'left term' operator 'right term'
          MatchNoneQuery()
        } else {
          var operator: String = ""
          var datasetRef: String = ""
          var value: Option[JsValue] = None

          terms.foreach{ term =>
            term.fields.get("type") match {
              case Some(JsString("ref")) =>
                val refString = jsValueToRefString(term).getOrElse("")
                RegoOperators.get(refString) match {
                  case Some(str) =>
                    operator = str
                  case _ =>
                    datasetRef = refString.replaceFirst("^input\\.object\\.dataset\\.", "")
                }
              case _ => value = unboxOperandValue(term)

            }
          }

          value match {
            case Some(JsString(v)) =>
              operator match {
                case "=" => TermQuery(datasetRef, v)
                case "!=" => boolQuery().not(TermQuery(datasetRef, v))
                case _ => MatchNoneQuery()
              }
            case Some(JsBoolean(v)) =>
              operator match {
                case "=" => TermQuery(datasetRef, v)
                case "!=" => boolQuery().not(TermQuery(datasetRef, v))
                case _ => MatchNoneQuery()
              }
            case  Some(JsNumber(v)) =>
              val q = RangeQuery(datasetRef)
              operator match {
                case "=" => q.lte(v.toDouble).gte(v.toDouble)
                case ">" => q.gt(v.toDouble)
                case "<" => q.lt(v.toDouble)
                case ">=" => q.gte(v.toDouble)
                case "<=" => q.lte(v.toDouble)
                case _ => MatchNoneQuery()
              }
            case None => ExistsQuery(datasetRef)
            case _ => throw new Error(s"Invalid operand: ${value}")
          }
        }
      case _ => MatchNoneQuery()
    }
  }

  private def mergeNonMatchQuries(queries: Seq[QueryDefinition]):Seq[QueryDefinition] = {
    val reducedQueries = if(queries.size > 1 && queries.exists{
      case MatchNoneQuery(x) => true
      case _ => false
    }) {
      /**
        * If contains more than one query & at least one is MatchNoneQuery
        * Will filter out MatchNoneQuery as it does nothing
        */
      queries.filter{
        case MatchNoneQuery(x) => false
        case _ => true
      }
    } else {
      queries
    }

    if(reducedQueries.size == 0) Seq(MatchNoneQuery())
    else reducedQueries
  }

  private def parseOpaResponse(res:HttpResponse): Future[Seq[QueryDefinition]] = {
    if(res.status.intValue() != 200) {
      res.entity.dataBytes.runFold(ByteString(""))(_ ++ _).flatMap { body =>
        logger.error(s"OPA failed to process the request: {}", body.utf8String)
        Future.failed(new Error(s"Failed to retrieve access control decision from OPA: ${body.utf8String}"))
      }
    } else {
      res.entity.dataBytes.map(_.utf8String)
        .map(_.parseJson)
        .runFold[Seq[QueryDefinition]](List())((queries: Seq[QueryDefinition], json:JsValue)=>{
          val ruleQuries = json
            .asJsObject
            .fields
            .get("result")
            .flatMap(_.asJsObject.fields.get("support"))
            .flatMap(_.asInstanceOf[JsArray].elements.headOption)
            .flatMap(_.asJsObject.fields.get("rules"))
            .toSeq
            .flatMap(_.asInstanceOf[JsArray].elements)
            .map(ruleToQueryDef(_))

          val combinedQuery = mergeNonMatchQuries(ruleQuries)

          queries ++ combinedQuery
      })
    }
  }

  def publishingStateQuery(publishingStateValue: Set[FilterValue[String]], jwtToken: Option[String]): Future[QueryDefinition] = {

    var filteredValue = publishingStateValue.map(value => {
      value match {
        case Specified(inner) => inner
        case Unspecified() => ""
      }
    }).filter(_ == "").toSeq

    // --- if "*" means all possible publishingState, should ignore all other options
    if(filteredValue.exists(_ == "*")) filteredValue = List("*")

    filteredValue = if(!filteredValue.isEmpty) filteredValue else List("*")

    val opaRequestFutures = filteredValue.map{ datasetType =>
      val requestData:String = s"""{
                                 |  "query": "data.object.dataset.allow",
                                 |  "input": {
                                 |    "operationUri": "object/dataset/${datasetType}/read"
                                 |  },
                                 |  "unknowns": [
                                 |    "input.object.dataset"
                                 |  ]
                                 |}""".stripMargin
      val httpRequest = HttpRequest(
        uri = s"${opaUrl}compile",
        method = HttpMethods.POST,
        entity = HttpEntity(ContentTypes.`application/json`, requestData),
        headers = List(RawHeader("X-Magda-Session", jwtToken.getOrElse("")))
      )

      Http().singleRequest(httpRequest).flatMap(parseOpaResponse(_))
    }

    Future.sequence(opaRequestFutures).map { queries =>

      val combinedQuery = mergeNonMatchQuries(queries.flatten)

      boolQuery().should(combinedQuery).minimumShouldMatch(1)
    }
  }

}
