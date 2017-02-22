package au.csiro.data61.magda.search.elasticsearch

import com.sksamuel.elastic4s.searches.queries.QueryDefinition
import org.elasticsearch.common.geo.ShapeRelation
import org.elasticsearch.index.query.QueryBuilders

class IndexedGeoShapeQueryDefinition(field: String, indexedShapeDocId: String, indexedShapeType: String) extends QueryDefinition {

  val builder = QueryBuilders.geoShapeQuery(field, indexedShapeDocId, indexedShapeType)

  def relation(relation: ShapeRelation): IndexedGeoShapeQueryDefinition = {
    builder.relation(relation)
    this
  }

  def shapeIndex(shapeIndex: String): IndexedGeoShapeQueryDefinition = {
    builder.indexedShapeIndex(shapeIndex)
    this
  }

  def shapePath(shapePath: String): IndexedGeoShapeQueryDefinition = {
    builder.indexedShapePath(shapePath)
    this
  }
}

object IndexedGeoShapeQueryDefinition {
  def indexedGeoShapeQuery(field: String, indexedShapeDocId: String, indexedShapeType: String) =
    new IndexedGeoShapeQueryDefinition(field, indexedShapeDocId, indexedShapeType)
}