package au.csiro.data61.magda.search.elasticsearch

import au.csiro.data61.magda.model.misc.{BoundingBox, DataSet, FacetOption, Region}
import au.csiro.data61.magda.model.misc.Protocols
import com.sksamuel.elastic4s.source.Indexable
import com.sksamuel.elastic4s.{HitAs, RichSearchHit}
import org.elasticsearch.search.aggregations.Aggregation
import org.elasticsearch.search.aggregations.bucket.MultiBucketsAggregation
import spray.json._
import collection.JavaConverters._

object ElasticSearchImplicits extends Protocols {

  implicit object SprayJsonIndexable extends Indexable[JsValue] {
    override def json(t: JsValue): String = t.toString(CompactPrinter)
  }

  implicit object SprayJsonHitAs extends HitAs[JsValue] {
    override def as(hit: RichSearchHit): JsValue = hit.sourceAsString.parseJson
  }

  implicit object DataSetHitAs extends HitAs[DataSet] {
    override def as(hit: RichSearchHit): DataSet = {
      hit.sourceAsString.parseJson.convertTo[DataSet]
    }
  }

  implicit object RegionHitAs extends HitAs[Region] {
    override def as(hit: RichSearchHit): Region = {
      val source = hit.as[JsValue].asJsObject

      val rectangle = source.fields("rectangle") match {
        case JsObject(fields) => (fields("type"), fields("coordinates")) match {
          case (JsString("envelope"), JsArray(Vector(
            JsArray(Vector(JsNumber(west), JsNumber(north))),
            JsArray(Vector(JsNumber(east), JsNumber(south)))
          ))) => Some(BoundingBox(west, south, east, north))
          case _ => None
        }
        case _ => None
      }

      Region(
        source.fields("type").convertTo[String],
        source.fields("id").convertTo[String],
        source.fields("name").convertTo[String],
        rectangle
      )
    }
  }

  implicit def aggregationsToFacetOptions(aggregation: Aggregation): Seq[FacetOption] = aggregation match {
    case (st: MultiBucketsAggregation) => st.getBuckets.asScala.map(bucket =>
      new FacetOption(
        value = bucket.getKeyAsString,
        hitCount = bucket.getDocCount
      )
    )
    case (_) => Seq()
  }

}