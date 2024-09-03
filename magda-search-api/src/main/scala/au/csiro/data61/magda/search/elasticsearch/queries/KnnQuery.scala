package au.csiro.data61.magda.search.elasticsearch.queries

import com.sksamuel.elastic4s.handlers.searches.queries.QueryBuilderFn
import com.sksamuel.elastic4s.json.{XContentBuilder, XContentFactory}
import com.sksamuel.elastic4s.requests.searches.queries.{CustomQuery, Query}
import com.sksamuel.elastic4s.requests.searches.queries.compound.BoolQuery

case class KnnQuery(
    field: String,
    vector: Array[Double],
    filter: Option[Query] = None,
    k: Option[Int],
    minScore: Option[Double] = None,
    maxDistance: Option[Double] = None,
    boost: Option[Double] = None
) extends CustomQuery {

  def buildQueryBody(): XContentBuilder = {
    val xcb = XContentFactory.jsonBuilder()
    xcb.startObject("knn")
    // --- start field name
    xcb.startObject(field)
    xcb.array("vector", vector)
    if (k.isDefined) {
      xcb.field("k", k.get)
    } else if (maxDistance.isDefined) {
      xcb.field("max_distance", maxDistance.get)
    } else {
      xcb.field("min_score", minScore.get)
    }
    boost.foreach(v => xcb.field("boost", v))
    filter.foreach(f => xcb.rawField("filter", QueryBuilderFn(f)))
    // --- end field name
    xcb.endObject()
    xcb.endObject()
  }
}

object KnnQuery {

  def apply(
      field: String,
      vector: Array[Double],
      filter: Option[Query] = None,
      k: Option[Int] = None,
      minScore: Option[Double] = None,
      maxDistance: Option[Double] = None,
      boost: Option[Double] = None
  ): KnnQuery = {
    if (k.isEmpty && minScore.isEmpty && maxDistance.isEmpty) {
      throw new IllegalArgumentException(
        "one of `k`, `minScore` or `maxDistance` must be set"
      )
    }
    new KnnQuery(
      field,
      vector = vector,
      k = k,
      minScore = minScore,
      maxDistance = maxDistance,
      boost = boost,
      filter = filter
    )
  }

  def apply(
      field: String,
      vector: Seq[Double],
      filter: Option[Query],
      k: Option[Int],
      minScore: Option[Double],
      maxDistance: Option[Double],
      boost: Option[Double]
  ): KnnQuery = {
    if (k.isEmpty && minScore.isEmpty && maxDistance.isEmpty) {
      throw new IllegalArgumentException(
        "one of `k`, `minScore` or `maxDistance` must be set"
      )
    }
    new KnnQuery(
      field,
      vector = vector.toArray,
      k = k,
      minScore = minScore,
      maxDistance = maxDistance,
      boost = boost,
      filter = filter
    )
  }
}
