package au.csiro.data61.magda.search.elasticsearch.queries

import com.sksamuel.elastic4s.handlers.searches.queries.QueryBuilderFn
import com.sksamuel.elastic4s.json.{XContentBuilder, XContentFactory}
import com.sksamuel.elastic4s.requests.searches.queries.{CustomQuery, Query}

case class HybridQuery(
    field: String,
    queries: Seq[Query]
) extends CustomQuery {

  def buildQueryBody(): XContentBuilder = {
    val xcb = XContentFactory.jsonBuilder()
    xcb.startObject("hybrid")
    xcb.array("queries", queries.map(q => QueryBuilderFn(q)).toArray)
    xcb.endObject()
  }
}

object HybridQuery {

  def apply(field: String, queries: Seq[Query]): HybridQuery = {
    if (queries.length == 0) {
      throw new IllegalArgumentException(
        "`HybridQuery.queries` cannot be empty"
      )
    }
    new HybridQuery(field, queries)
  }
}
