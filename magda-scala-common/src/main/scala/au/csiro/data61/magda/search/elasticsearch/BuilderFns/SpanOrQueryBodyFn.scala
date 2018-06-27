package au.csiro.data61.magda.search.elasticsearch.BuilderFns

import com.sksamuel.elastic4s.json.{XContentBuilder, XContentFactory}
import com.sksamuel.elastic4s.searches.queries.span.SpanOrQueryDefinition

object SpanOrQueryBodyFn {
  def apply(q: SpanOrQueryDefinition): XContentBuilder = {
    val builder = XContentFactory.jsonBuilder()
    builder.startObject("span_or")
    builder.startArray("clauses")
    q.clauses.foreach { clause =>
      builder.rawValue(QueryBuilderFn(clause))
    }
    builder.endArray()

    q.boost.foreach(builder.field("boost", _))
    q.queryName.foreach(builder.field("_name", _))

    builder.endObject()
    builder.endObject()
  }
}
