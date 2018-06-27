package au.csiro.data61.magda.search.elasticsearch.BuilderFns.aggs

import com.sksamuel.elastic4s.json.{XContentBuilder, XContentFactory}
import com.sksamuel.elastic4s.searches.aggs.ChildrenAggregationDefinition

object ChildrenAggregationBuilder {
  def apply(agg: ChildrenAggregationDefinition): XContentBuilder = {

    val builder = XContentFactory.jsonBuilder().startObject("children")

    builder.field("type", agg.childType)
    builder.endObject()

    SubAggsBuilderFn(agg, builder)

    builder
  }
}
