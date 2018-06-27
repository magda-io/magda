package au.csiro.data61.magda.search.elasticsearch.BuilderFns.aggs

import com.sksamuel.elastic4s.json.XContentBuilder
import com.sksamuel.elastic4s.json.XContentFactory
import com.sksamuel.elastic4s.searches.aggs.ReverseNestedAggregationDefinition

object ReverseNestedAggregationBuilder {
  def apply(agg: ReverseNestedAggregationDefinition): XContentBuilder = {
    val builder = XContentFactory.obj().startObject("reverse_nested")
    agg.path.foreach(builder.field("path", _))
    builder.endObject()
    SubAggsBuilderFn(agg, builder)
    AggMetaDataFn(agg, builder)
    builder.endObject()
  }
}
