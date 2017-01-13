package au.csiro.data61.magda.search.elasticsearch

import java.time.OffsetDateTime

import au.csiro.data61.magda.model.misc.Region
import au.csiro.data61.magda.spatial.RegionSource.generateRegionId
import au.csiro.data61.magda.search.elasticsearch.IndexedGeoShapeQueryDefinition._
import com.sksamuel.elastic4s.ElasticDsl._
import org.elasticsearch.common.geo.ShapeRelation
import au.csiro.data61.magda.search.elasticsearch.Indices

object Queries {
  def publisherQuery(publisher: String) = matchPhraseQuery("publisher.name", publisher)
  def exactPublisherQuery(publisher: String) = termQuery("publisher.name.untouched", publisher)
  def formatQuery(format: String) = nestedQuery("distributions")
    .query(matchQuery("distributions.format", format))
  def exactFormatQuery(format: String) = nestedQuery("distributions")
    .query(matchQuery("distributions.format.untokenized", format))
  def regionIdQuery(region: Region, indices: Indices) = indexedGeoShapeQuery("spatial.geoJson", generateRegionId(region.regionType, region.regionId), indices.regionsIndexName)
    .relation(ShapeRelation.INTERSECTS)
    .shapeIndex(indices.regionsIndexName)
    .shapePath("geometry")
  def dateFromQuery(dateFrom: OffsetDateTime) = filter(should(
    rangeQuery("temporal.end.date").gte(dateFrom.toString),
    rangeQuery("temporal.start.date").gte(dateFrom.toString)).minimumShouldMatch(1))
  def dateToQuery(dateTo: OffsetDateTime) = filter(should(
    rangeQuery("temporal.end.date").lte(dateTo.toString),
    rangeQuery("temporal.start.date").lte(dateTo.toString)).minimumShouldMatch(1))
  def exactDateQuery(dateFrom: OffsetDateTime, dateTo: OffsetDateTime) = must(dateFromQuery(dateFrom), dateToQuery(dateTo))
}

