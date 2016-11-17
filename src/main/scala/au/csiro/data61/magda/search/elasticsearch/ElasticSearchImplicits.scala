package au.csiro.data61.magda.search.elasticsearch

import au.csiro.data61.magda.api.Region

import scala.collection.JavaConverters._
import com.sksamuel.elastic4s._
import com.sksamuel.elastic4s.source.Indexable
import spray.json._
import org.elasticsearch.search.aggregations.Aggregation
import org.elasticsearch.search.aggregations.bucket.MultiBucketsAggregation
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.model.misc.Protocols._

object ElasticSearchImplicits {
  implicit object SprayJsonIndexable extends Indexable[JsValue] {
    override def json(t: JsValue): String = t.toString(CompactPrinter)
  }

  implicit object DataSetHitAs extends HitAs[DataSet] {
    override def as(hit: RichSearchHit): DataSet = {
      hit.sourceAsString.parseJson.convertTo[DataSet]
    }
  }

  implicit object RegionHitAs extends HitAs[Region] {
    override def as(hit: RichSearchHit): Region = {
      val parts = hit.id.split('/')
      Region(parts(0), parts(1))
    }
  }

  implicit def aggregationsToFacetOptions(aggregation: Aggregation): Seq[FacetOption] = aggregation match {
    case (st: MultiBucketsAggregation) => st.getBuckets.asScala.map(bucket =>
      new FacetOption(
        value = bucket.getKeyAsString,
        hitCount = Some(bucket.getDocCount)
      )
    )
    case (_) => Seq()
  }

}