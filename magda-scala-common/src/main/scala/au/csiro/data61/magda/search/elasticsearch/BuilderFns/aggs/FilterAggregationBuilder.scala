package au.csiro.data61.magda.search.elasticsearch.BuilderFns.aggs

import au.csiro.data61.magda.search.elasticsearch.BuilderFns.QueryBuilderFn
import com.sksamuel.elastic4s.json.{XContentBuilder, XContentFactory}
import com.sksamuel.elastic4s.searches.aggs.FilterAggregationDefinition

object FilterAggregationBuilder {
  def apply(agg: FilterAggregationDefinition): XContentBuilder = {

    val builder = XContentFactory.jsonBuilder()

    builder.rawField("filter", QueryBuilderFn(agg.query))

    SubAggsBuilderFn(agg, builder)
    AggMetaDataFn(agg, builder)

    builder
  }
}
