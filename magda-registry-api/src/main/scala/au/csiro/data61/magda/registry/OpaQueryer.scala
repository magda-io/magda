package au.csiro.data61.magda.registry


import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.model._
import akka.http.scaladsl.model.headers.RawHeader
import akka.stream.Materializer
import au.csiro.data61.magda.api.{FilterValue, Specified, Unspecified}
import com.sksamuel.elastic4s.http.ElasticDsl.boolQuery
import com.sksamuel.elastic4s.searches.queries.matches.{MatchAllQuery, MatchNoneQuery}
import com.sksamuel.elastic4s.searches.queries.matches.MatchQuery
import com.sksamuel.elastic4s.searches.queries.term.TermQuery
import com.sksamuel.elastic4s.searches.queries.{ExistsQuery, RangeQuery, Query => QueryDefinition}
import com.typesafe.config.Config
import akka.util.ByteString
import scala.concurrent.duration._
import spray.json._

import scala.concurrent.{ExecutionContext, Future}

class OpaQueryer(
  implicit val config: Config,
  implicit val system: ActorSystem,
  implicit val ec: ExecutionContext,
  implicit val materializer: Materializer) {
  
  private val logger = system.log
  private val opaUrl:String = config.getConfig("opa").getString("baseUrl")

  def isAspectAllowed(aspectId: String, record: JsObject, jwtToken: Option[String]): Future[Boolean] = {
    var headers = List(RawHeader("X-Magda-Session", jwtToken.getOrElse("")))
    val requestData:String = s"""{
                                 | 	"query": "data.object.registry.aspect[\"${aspectId}\"].view",
                                 |  "unknowns": ["input.object"]
                                 |}""".stripMargin

    val httpRequest = HttpRequest(
      //localhost:30104/v0/opa/data/object/registry/aspect/orgunit/edit?explain=true
      uri = s"${opaUrl}compile",
      method = HttpMethods.POST,
      entity = HttpEntity(ContentTypes.`application/json`, requestData),
      headers = headers
    )

    Http().singleRequest(httpRequest).flatMap(parseOpaResponse(_))
  }

  private def parseOpaResponse(res:HttpResponse): Future[Boolean] = {
    if(res.status.intValue() != 200) {
      res.entity.dataBytes.runFold(ByteString(""))(_ ++ _).flatMap { body =>
        logger.error(s"OPA failed to process the request: {}", body.utf8String)
        throw new Error(s"Failed to retrieve access control decision from OPA: ${body.utf8String}")
      }
    } else {
        res.entity.toStrict(10.seconds).map { entity =>
        val json = entity.data.utf8String.parseJson
        val ruleQuries = json
          .asJsObject
          .fields
          .get("result")
          .flatMap(_.asJsObject.fields.get("support"))
          .flatMap(_.asInstanceOf[JsArray].elements)
          .flatMap(_.asJsObject.fields.get("rules"))
          .toSeq
          .flatMap(_.asInstanceOf[JsArray].elements)
          .map(ruleToQueryDef(_))

        // mergeNonMatchQuries(ruleQuries)
      }

      Future.successful(true)
    }
  }

  private def ruleToQueryDef(ruleJson:JsValue):QueryDefinition = {
    ruleJson match {
      case JsObject(rule) =>
        val isDefault:Boolean = rule.get("default").flatMap{
          case JsBoolean(v) => Some(v)
          case _ => None
        }.getOrElse(false)

        val defaultValue:Option[JsValue] = rule.get("head").flatMap{
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
      case _ => reportErrorWithMatchNoneQuery(s"Rule should be JsObject: ${ruleJson}")
    }
  }

  private def translateDataRefString(refString:String):String = {
    unknownDataRefs.find { prefix =>
      s"^${prefix}".r.findFirstIn(refString) match {
        case None => false
        case _ => true
      }
    } match {
      case Some(prefix:String) => refString.replaceFirst(s"^${prefix}\\.", "")
      case _ => refString
    }
  }
}
