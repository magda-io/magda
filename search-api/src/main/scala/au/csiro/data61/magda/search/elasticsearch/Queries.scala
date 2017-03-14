package au.csiro.data61.magda.search.elasticsearch

import java.time.OffsetDateTime

import org.apache.lucene.search.join.ScoreMode
import org.elasticsearch.common.geo.ShapeRelation
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.searches.queries.NestedQueryDefinition
import com.typesafe.config.Config

import au.csiro.data61.magda.model.misc.QueryRegion
import au.csiro.data61.magda.spatial.RegionSource.generateRegionId
import com.sksamuel.elastic4s.searches.queries.geo.GeoShapeDefinition
import au.csiro.data61.magda.api.FilterValue
import com.sksamuel.elastic4s.searches.queries.QueryDefinition
import au.csiro.data61.magda.api.Specified
import au.csiro.data61.magda.api.Unspecified
import au.csiro.data61.magda.model.misc.Region
import au.csiro.data61.magda.search.SearchStrategy

object Queries {
  def publisherQuery(strategy: SearchStrategy)(publisher: FilterValue[String]) = {
    handleFilterValue(publisher, (p: String) =>
      strategy match {
        case SearchStrategy.MatchAll  => termQuery("publisher.name.not_analyzed", p)
        case SearchStrategy.MatchPart => matchQuery("publisher.name", p)
      }, "publisher.name"
    )
  }

  def exactPublisherQuery(publisher: FilterValue[String]) = handleFilterValue(publisher, (p: String) => termQuery("publisher.name.not_analyzed", p), "publisher.name.not_analyzed")
  def baseFormatQuery(formatString: String) = nestedQuery("distributions")
    .query(matchQuery("distributions.format", formatString))
    .scoreMode(ScoreMode.Avg)
  def formatQuery(field: String, formatValue: FilterValue[String]): QueryDefinition = {
    formatValue match {
      case Specified(inner) => baseFormatQuery(inner)
      case Unspecified()    => nestedQuery("distributions").query(boolQuery().not(existsQuery(field))).scoreMode(ScoreMode.Avg)
    }
  }

  def formatQuery(formatValue: FilterValue[String]): QueryDefinition = {
    formatQuery("distributions.format", formatValue)
  }

  def exactFormatQuery(format: FilterValue[String]) = {
    formatQuery("distributions.format.not_analyzed", format)
  }

  def regionIdQuery(regionValue: FilterValue[Region], indices: Indices)(implicit config: Config) = {
    def normal(region: Region) = geoShapeQuery("spatial.geoJson", generateRegionId(region.queryRegion.regionType, region.queryRegion.regionId), indices.getType(Indices.RegionsIndexType))
      .relation(ShapeRelation.INTERSECTS)
      .indexedShapeIndex(indices.getIndex(config, Indices.RegionsIndex))
      .indexedShapePath("geometry")

    handleFilterValue(regionValue, normal, "spatial.geoJson")
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
      dateTo.flatMap(_.map(dateToQuery))
    ).flatten
  }

  def dateFromQuery(dateFrom: OffsetDateTime) = {
    filter(should(
      rangeQuery("temporal.end.date").gte(dateFrom.toString),
      rangeQuery("temporal.start.date").gte(dateFrom.toString)).minimumShouldMatch(1))
  }
  def dateToQuery(dateTo: OffsetDateTime) = {
    filter(should(
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

