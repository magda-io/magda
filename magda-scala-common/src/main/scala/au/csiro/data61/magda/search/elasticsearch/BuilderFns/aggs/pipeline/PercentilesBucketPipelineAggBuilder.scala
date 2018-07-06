package au.csiro.data61.magda.search.elasticsearch.BuilderFns.aggs.pipeline

import au.csiro.data61.magda.search.elasticsearch.BuilderFns.aggs.AggMetaDataFn
import com.sksamuel.elastic4s.json.{XContentBuilder, XContentFactory}
import com.sksamuel.elastic4s.searches.aggs.pipeline.PercentilesBucketDefinition

object PercentilesBucketPipelineAggBuilder {
  def apply(agg: PercentilesBucketDefinition): XContentBuilder = {
    val builder = XContentFactory.jsonBuilder()
    builder.startObject("percentiles_bucket")
    builder.field("buckets_path", agg.bucketsPath)
    agg.gapPolicy.foreach(policy => builder.field("gap_policy", policy.toString.toLowerCase))
    agg.format.foreach(f => builder.field("format", f))
    if (agg.percents.nonEmpty) {
      builder.array("percents", agg.percents.toArray)
    }
    builder.endObject()
    AggMetaDataFn(agg, builder)
    builder.endObject()
  }
}
