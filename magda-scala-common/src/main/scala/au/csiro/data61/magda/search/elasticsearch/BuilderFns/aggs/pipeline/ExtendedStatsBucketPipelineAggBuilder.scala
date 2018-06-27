package au.csiro.data61.magda.search.elasticsearch.BuilderFns.aggs.pipeline

import au.csiro.data61.magda.search.elasticsearch.BuilderFns.aggs.AggMetaDataFn
import com.sksamuel.elastic4s.json.{XContentBuilder, XContentFactory}
import com.sksamuel.elastic4s.searches.aggs.pipeline.ExtendedStatsBucketDefinition

object ExtendedStatsBucketPipelineAggBuilder {
  def apply(agg: ExtendedStatsBucketDefinition): XContentBuilder = {
    val builder = XContentFactory.jsonBuilder()
    builder.startObject("extended_stats_bucket")
    builder.field("buckets_path", agg.bucketsPath)
    agg.gapPolicy.foreach(policy => builder.field("gap_policy", policy.toString.toLowerCase))
    agg.format.foreach(f => builder.field("format", f))
    builder.endObject()
    AggMetaDataFn(agg, builder)
    builder.endObject()
  }
}
