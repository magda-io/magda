package au.csiro.data61.magda.search.elasticsearch.queries

import com.sksamuel.elastic4s.handlers.searches.queries.compound.BoolQueryBuilderFn
import com.sksamuel.elastic4s.json.{XContentBuilder, XContentFactory}
import com.sksamuel.elastic4s.requests.searches.queries.CustomQuery
import com.sksamuel.elastic4s.requests.searches.queries.compound.BoolQuery

case class KnnQuery(
    field: String,
    vector: Array[Double],
    k: Int,
    filter: Option[BoolQuery]
) extends CustomQuery {

  def buildQueryBody(): XContentBuilder = {
    val xcb = XContentFactory.jsonBuilder()
    xcb.startObject("knn")
    // --- start field name
    xcb.startObject(field)
    xcb.array("vector", vector)
    xcb.field("k", k)
    filter.foreach(f => xcb.rawField("filter", BoolQueryBuilderFn(f)))
    // --- end field name
    xcb.endObject()
    xcb.endObject()
  }
}

object KnnQuery {

  def apply(
      field: String,
      vector: Array[Double],
      k: Int,
      filter: Option[BoolQuery]
  ): KnnQuery = {
    new KnnQuery(field, vector, k, filter)
  }

  def apply(
      field: String,
      vector: Seq[Double],
      k: Int,
      filter: Option[BoolQuery]
  ): KnnQuery = {
    new KnnQuery(field, vector.toArray, k, filter)
  }
}
