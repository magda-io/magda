package au.csiro.data61.magda.search.elasticsearch.BuilderFns.aggs

import au.csiro.data61.magda.search.elasticsearch.BuilderFns.QueryBuilderFn
import com.sksamuel.elastic4s.json.{XContentBuilder, XContentFactory}
import com.sksamuel.elastic4s.searches.aggs.KeyedFiltersAggregationDefinition

object KeyedFiltersAggregationBuilder {
  def apply(agg: KeyedFiltersAggregationDefinition): XContentBuilder = {

    val builder = XContentFactory.jsonBuilder()

    builder.startObject("filters")
    agg.otherBucket.foreach(builder.field("other_bucket", _))
    agg.otherBucketKey.foreach(builder.field("other_bucket_key", _))

    builder.startObject("filters")
    agg.filters.map(map => {
      builder.rawField(map._1, QueryBuilderFn(map._2))
    })
    builder.endObject()

    builder.endObject()

    SubAggsBuilderFn(agg, builder)
    AggMetaDataFn(agg, builder)
    builder
  }
}
