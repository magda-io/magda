package au.csiro.data61.magda.search.elasticsearch

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

  implicit object MatchingRegionHitAs extends HitAs[MatchingRegion] {
    override def as(hit: RichSearchHit): MatchingRegion = {
      val source = hit.sourceAsMap
      println(source)
      MatchingRegion(
        source("type").asInstanceOf[String],
        source("id").asInstanceOf[String],
        source("name").asInstanceOf[String]
      )
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