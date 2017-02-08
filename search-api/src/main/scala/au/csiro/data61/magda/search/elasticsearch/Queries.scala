package au.csiro.data61.magda.search.elasticsearch

import java.time.OffsetDateTime

import org.apache.lucene.search.join.ScoreMode
import org.elasticsearch.common.geo.ShapeRelation

import com.sksamuel.elastic4s.ElasticDsl.filter
import com.sksamuel.elastic4s.ElasticDsl.matchPhraseQuery
import com.sksamuel.elastic4s.ElasticDsl.matchQuery
import com.sksamuel.elastic4s.ElasticDsl.must
import com.sksamuel.elastic4s.ElasticDsl.nestedQuery
import com.sksamuel.elastic4s.ElasticDsl.rangeQuery
import com.sksamuel.elastic4s.ElasticDsl.should
import com.sksamuel.elastic4s.ElasticDsl.termQuery
import com.sksamuel.elastic4s.searches.queries.NestedQueryDefinition
import com.typesafe.config.Config

import au.csiro.data61.magda.model.misc.Region
import au.csiro.data61.magda.search.elasticsearch.IndexedGeoShapeQueryDefinition.indexedGeoShapeQuery
import au.csiro.data61.magda.spatial.RegionSource.generateRegionId


object Queries {
  def publisherQuery(publisher: String) = matchPhraseQuery("publisher.name", publisher)
  def exactPublisherQuery(publisher: String) = termQuery("publisher.name.untouched", publisher)
  def formatQuery(format: String) : NestedQueryDefinition = nestedQuery("distributions")
    .query(matchQuery("distributions.format", format))
    .scoreMode(ScoreMode.Avg)
  def exactFormatQuery(format: String) = nestedQuery("distributions")
    .query(matchQuery("distributions.format.untokenized", format))
    .scoreMode(ScoreMode.Avg)
  def regionIdQuery(region: Region, indices: Indices)(implicit config: Config) : IndexedGeoShapeQueryDefinition = {
    indexedGeoShapeQuery("spatial.geoJson", generateRegionId(region.regionType, region.regionId), indices.getType(Indices.RegionsIndexType))
      .relation(ShapeRelation.INTERSECTS)
      .shapeIndex(indices.getIndex(config, Indices.RegionsIndex))
      .shapePath("geometry")
  }
  def dateFromQuery(dateFrom: OffsetDateTime) = filter(should(
    rangeQuery("temporal.end.date").gte(dateFrom.toString),
    rangeQuery("temporal.start.date").gte(dateFrom.toString)).minimumShouldMatch(1))
  def dateToQuery(dateTo: OffsetDateTime) = filter(should(
    rangeQuery("temporal.end.date").lte(dateTo.toString),
    rangeQuery("temporal.start.date").lte(dateTo.toString)).minimumShouldMatch(1))
  def exactDateQuery(dateFrom: OffsetDateTime, dateTo: OffsetDateTime) = must(dateFromQuery(dateFrom), dateToQuery(dateTo))
}

