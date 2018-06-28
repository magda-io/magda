package au.csiro.data61.magda.search.elasticsearch

import au.csiro.data61.magda.model.misc.{Agent, BoundingBox, DataSet, FacetOption, QueryRegion, Region}
import au.csiro.data61.magda.model.misc.Protocols
import spray.json._

import collection.JavaConverters._
import com.sksamuel.elastic4s.Indexable
import com.sksamuel.elastic4s.HitReader
import com.sksamuel.elastic4s.Hit

import au.csiro.data61.magda.search.elasticsearch.AggregationResults.Aggregations

object ElasticSearchImplicits extends Protocols {

  implicit object SprayJsonIndexable extends Indexable[JsValue] {
    override def json(t: JsValue): String = t.toString(CompactPrinter)
  }

  implicit object SprayJsonHitAs extends HitReader[JsValue] {
    override def read(hit: Hit): Either[Throwable, JsValue] = Right(hit.sourceAsString.parseJson)
  }

  implicit object DataSetHitAs extends HitReader[DataSet] {
    override def read(hit: Hit): Either[Throwable, DataSet] = {
      Right(hit.sourceAsString.parseJson.convertTo[DataSet])
    }
  }

  implicit object RegionHitAs extends HitReader[Region] {
    override def read(hit: Hit): Either[Throwable, Region] = {
      Right(hit.to[JsValue].asJsObject.convertTo[Region](esRegionFormat))
    }
  }

  def aggregationsToFacetOptions(aggregation: Option[Aggregations]): Seq[FacetOption] = aggregation match {
    case None => Nil
    case Some(agg) =>
      val buckets = if (agg.contains("buckets")){
        Some(agg.data("buckets"))
      }else{
        agg.data.get("nested").flatMap(_.asInstanceOf[Map[String, Any]].get("buckets"))
      }

      buckets.toSeq.flatMap(_.asInstanceOf[Seq[Map[String, Any]]]
        .map(m => new FacetOption(
          identifier = None,
          value = m("key").toString,
          hitCount = m("doc_count").toString.toLong
        ))
      )
  }
}
