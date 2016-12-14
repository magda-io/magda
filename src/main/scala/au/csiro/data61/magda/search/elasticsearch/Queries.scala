package au.csiro.data61.magda.search.elasticsearch

import com.sksamuel.elastic4s.ElasticDsl._
import java.time.Instant
import au.csiro.data61.magda.api.Region
import org.elasticsearch.common.geo.ShapeRelation
import au.csiro.data61.magda.search.elasticsearch.IndexedGeoShapeQueryDefinition._

object Queries {
  def publisherQuery(publisher: String) = matchPhraseQuery("publisher.name", publisher)
  def exactPublisherQuery(publisher: String) = termQuery("publisher.name.untouched", publisher)
  def formatQuery(format: String) = nestedQuery("distributions")
    .query(matchQuery("distributions.format", format))
  def exactFormatQuery(format: String) = nestedQuery("distributions")
    .query(matchQuery("distributions.format.untokenized", format))
  def regionIdQuery(region: Region) = indexedGeoShapeQuery("spatial.geoJson", generateRegionId(region.regionType, region.regionId), "regions")
    .relation(ShapeRelation.INTERSECTS)
    .shapeIndex(IndexDefinition.regions.indexName)
    .shapePath("geometry")
  def dateFromQuery(dateFrom: Instant) = filter(should(
    rangeQuery("temporal.end.date").gte(dateFrom.toString),
    rangeQuery("temporal.start.date").gte(dateFrom.toString)).minimumShouldMatch(1))
  def dateToQuery(dateTo: Instant) = filter(should(
    rangeQuery("temporal.end.date").lte(dateTo.toString),
    rangeQuery("temporal.start.date").lte(dateTo.toString)).minimumShouldMatch(1))
  def generateRegionId(regionType: String, id: String) = s"${regionType}/$id".toLowerCase
  def exactDateQuery(dateFrom: Instant, dateTo: Instant) = must(dateFromQuery(dateFrom), dateToQuery(dateTo))
}

