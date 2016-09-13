package au.csiro.data61.magda.search.elasticsearch

import scala.collection.JavaConverters._
import com.sksamuel.elastic4s._
import com.sksamuel.elastic4s.source.Indexable
import spray.json._
import au.csiro.data61.magda.api.Types.Protocols._
import au.csiro.data61.magda.api.Types._
import org.elasticsearch.search.aggregations.Aggregation
import org.elasticsearch.search.aggregations.bucket.MultiBucketsAggregation

object ElasticSearchImplicits {
  implicit object SprayJsonIndexable extends Indexable[JsValue] {
    override def json(t: JsValue): String = t.toString(CompactPrinter)
  }

  implicit object DataSetHitAs extends HitAs[DataSet] {
    override def as(hit: RichSearchHit): DataSet = {
      hit.sourceAsString.parseJson.convertTo[DataSet]
    }
  }

  implicit def aggregationsToFacetOptions(aggregation: Aggregation): Seq[FacetOption] = aggregation match {
    case (st: MultiBucketsAggregation) => st.getBuckets.asScala.map(bucket =>
      new FacetOption(
        value = bucket.getKeyAsString,
        hitCount = Some(bucket.getDocCount.toInt)
      )
    )
    case (_) => Seq()
  }

}