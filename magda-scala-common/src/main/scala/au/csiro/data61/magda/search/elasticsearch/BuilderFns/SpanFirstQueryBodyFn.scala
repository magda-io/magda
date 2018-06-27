package au.csiro.data61.magda.search.elasticsearch.BuilderFns

import com.sksamuel.elastic4s.json.{XContentBuilder, XContentFactory}
import com.sksamuel.elastic4s.searches.queries.span.SpanFirstQueryDefinition

object SpanFirstQueryBodyFn {
  def apply(q: SpanFirstQueryDefinition): XContentBuilder = {
    val builder = XContentFactory.jsonBuilder()
    builder.startObject("span_first")
    builder.rawField("match", QueryBuilderFn(q.query))
    builder.field("end", q.end)
    q.boost.foreach(builder.field("boost", _))
    q.queryName.foreach(builder.field("_name", _))
    builder.endObject()
    builder.endObject()
  }
}
