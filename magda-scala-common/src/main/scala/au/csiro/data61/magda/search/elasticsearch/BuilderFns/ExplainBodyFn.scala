package au.csiro.data61.magda.search.elasticsearch.BuilderFns

import com.sksamuel.elastic4s.explain.ExplainDefinition
import com.sksamuel.elastic4s.json.{XContentBuilder, XContentFactory}

object ExplainBodyFn {
  def apply(v: ExplainDefinition): XContentBuilder = {
    val builder = XContentFactory.jsonBuilder()
    builder.rawField("query", QueryBuilderFn(v.query.get))
    builder.endObject()
  }
}
