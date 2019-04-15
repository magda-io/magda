package au.csiro.data61.magda.search.elasticsearch

import java.time.OffsetDateTime

import com.sksamuel.elastic4s.searches.ScoreMode
import com.sksamuel.elastic4s.http.ElasticDsl._
import com.sksamuel.elastic4s.searches.queries.{RangeQuery, NestedQuery => NestedQueryDefinition, Query => QueryDefinition}
import com.typesafe.config.Config
import au.csiro.data61.magda.model.misc.QueryRegion
import au.csiro.data61.magda.spatial.RegionSource.generateRegionId
import com.sksamuel.elastic4s.searches.queries.geo.{PreindexedShape, ShapeRelation, GeoShapeQuery => GeoShapeQueryDefinition}
import au.csiro.data61.magda.api.FilterValue
import au.csiro.data61.magda.api.Specified
import au.csiro.data61.magda.api.Unspecified
import au.csiro.data61.magda.model.misc.Region
import au.csiro.data61.magda.search.SearchStrategy
import scalaj.http.Http
import au.csiro.data61.magda.AppConfig
import akka.actor.{Actor, ActorLogging, ActorSystem, DeadLetter, Props}
import akka.event.Logging
import com.typesafe.config.Config
import spray.json._
import DefaultJsonProtocol._
import com.sksamuel.elastic4s.searches.queries.matches.{MatchAllQuery, MatchNoneQuery}
import com.sksamuel.elastic4s.searches.queries.term.TermQuery

object Queries {

  implicit val config = AppConfig.conf()
  implicit val system = ActorSystem("search-api-opa", config)
  implicit val logger = Logging(system, getClass)

  val opaUrl:String = config.getConfig("opa").getString("baseUrl")

  def publisherQuery(strategy: SearchStrategy)(publisher: FilterValue[String]) = {
    handleFilterValue(publisher, (publisherString: String) =>
      strategy match {
        case SearchStrategy.MatchAll =>
          matchQuery("publisher.name.keyword_lowercase", publisherString)

        case SearchStrategy.MatchPart =>
          multiMatchQuery(publisherString)
            .fields("publisher.acronym", "publisher.name")
            .minimumShouldMatch("1")

      }, "publisher.name")
  }

  def exactPublisherQuery(publisher: FilterValue[String]) = publisherQuery(SearchStrategy.MatchAll)(publisher)
  def baseFormatQuery(strategy: SearchStrategy, formatString: String) = nestedQuery("distributions")
    .query(strategy match {
      case SearchStrategy.MatchAll => matchQuery("distributions.format.quote", formatString)
      case SearchStrategy.MatchPart =>
        multiMatchQuery(formatString)
          .fields("distributions.format", "distributions.format.quote")
          .minimumShouldMatch("1")
    })
    .scoreMode(ScoreMode.Avg)
  def formatQuery(strategy: SearchStrategy)(formatValue: FilterValue[String]): QueryDefinition = {
    formatValue match {
      case Specified(inner) => baseFormatQuery(strategy, inner)
      case Unspecified()    => nestedQuery("distributions").query(boolQuery().not(existsQuery("distributions.format"))).scoreMode(ScoreMode.Max)
    }
  }

  val RegoOperators = Map(
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

  private def jsValueToJsValue(refJson: JsValue):Option[JsValue] = {
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
              case _ => value = jsValueToJsValue(term)

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
          }
        }
      case _ => MatchNoneQuery()
    }
  }


  def publishingStateQuery(publishingStateValue: Set[FilterValue[String]], jwtToken: Option[String])(implicit config: Config): QueryDefinition = {

    var filteredValue = publishingStateValue.map(value => {
        value match {
          case Specified(inner) => inner
          case Unspecified() => ""
        }
      }).filter(_ == "").toSeq

    filteredValue = if(!filteredValue.isEmpty) filteredValue else List("draft", "published", "archived")

    val residualRules = filteredValue.map{ datasetType =>
      Http(s"${opaUrl}compile")
        .postData(s"""{
                    |  "query": "data.object.dataset.allow",
                    |  "input": {
                    |    "operationUri": "object/dataset/${datasetType}/read"
                    |  },
                    |  "unknowns": [
                    |    "input.object.dataset"
                    |  ]
                    |}""".stripMargin)
        .header("X-Magda-Session", jwtToken.getOrElse(""))
        .header("content-type", "application/json")
        .asString
    }.map{res =>
      if(res.code != 200) {
        logger.error(s"OPA failed to process the request: {}", res.body)
        matchNoneQuery()
      } else {
        val json = res.body.parseJson.asJsObject
        // --- default rule value
        var defaultValue:Boolean = false
        val ruleQuries = json
          .fields
          .get("result")
          .flatMap(_.asJsObject.fields.get("support"))
          .flatMap(_.asInstanceOf[JsArray].elements.headOption)
          .flatMap(_.asJsObject.fields.get("rules"))
          .toSeq
          .flatMap(_.asInstanceOf[JsArray].elements)
          .map(ruleToQueryDef(_))

        if(ruleQuries.size == 0) MatchNoneQuery()
        else boolQuery().should(ruleQuries).minimumShouldMatch(1)
      }
    }

    if(residualRules.size == 0) MatchNoneQuery()
    else boolQuery().should(residualRules).minimumShouldMatch(1)
  }

  def regionToGeoShapeQuery(region: Region, indices: Indices)(implicit config: Config) = new GeoShapeQueryDefinition(
      "spatial.geoJson",
      PreindexedShape(
        generateRegionId(region.queryRegion.regionType, region.queryRegion.regionId),
        indices.getIndex(config, Indices.RegionsIndex),
        indices.getType(Indices.RegionsIndexType),
        "geometry"
      ),
      Some(ShapeRelation.INTERSECTS)
    )

  def regionIdQuery(regionValue: FilterValue[Region], indices: Indices)(implicit config: Config) = {
    handleFilterValue(regionValue, (region: Region) => regionToGeoShapeQuery(region, indices), "spatial.geoJson")
  }
  def dateQueries(dateFrom: Option[FilterValue[OffsetDateTime]], dateTo: Option[FilterValue[OffsetDateTime]]) = {
    Seq(
      (dateFrom, dateTo) match {
        case (Some(Unspecified()), Some(Unspecified())) |
          (Some(Unspecified()), None) |
          (None, Some(Unspecified())) => Some(Queries.dateUnspecifiedQuery)
        case _ => None
      },
      dateFrom.flatMap(_.map(dateFromQuery)),
      dateTo.flatMap(_.map(dateToQuery))).flatten
  }

  def dateFromQuery(dateFrom: OffsetDateTime) = {
    boolQuery().filter(should(
      rangeQuery("temporal.end.date").gte(dateFrom.toString),
      rangeQuery("temporal.start.date").gte(dateFrom.toString)).minimumShouldMatch(1))
  }
  def dateToQuery(dateTo: OffsetDateTime) = {
    boolQuery().filter(should(
      rangeQuery("temporal.end.date").lte(dateTo.toString),
      rangeQuery("temporal.start.date").lte(dateTo.toString)).minimumShouldMatch(1))
  }
  val dateUnspecifiedQuery = boolQuery().not(existsQuery("temporal.end.date"), existsQuery("temporal.start.date"))

  def exactDateQuery(dateFrom: OffsetDateTime, dateTo: OffsetDateTime) = must(dateFromQuery(dateFrom), dateToQuery(dateTo))

  def handleFilterValue[T](filterValue: FilterValue[T], converter: T => QueryDefinition, field: String) = filterValue match {
    case Specified(inner) => converter(inner)
    case Unspecified()    => boolQuery().not(existsQuery(field))
  }
}
