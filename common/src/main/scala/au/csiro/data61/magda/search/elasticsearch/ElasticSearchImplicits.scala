package au.csiro.data61.magda.search.elasticsearch

import au.csiro.data61.magda.model.misc.{ BoundingBox, DataSet, FacetOption, Region, QueryRegion }
import au.csiro.data61.magda.model.misc.Protocols
import org.elasticsearch.search.aggregations.Aggregation
import org.elasticsearch.search.aggregations.bucket.MultiBucketsAggregation
import spray.json._
import collection.JavaConverters._
import com.sksamuel.elastic4s.Indexable
import com.sksamuel.elastic4s.searches.RichSearchHit
import com.sksamuel.elastic4s.HitReader
import com.sksamuel.elastic4s.Hit


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
      val source = hit.to[JsValue].asJsObject

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

      Right(Region(
        QueryRegion(
          source.fields("type").convertTo[String],
          source.fields("id").convertTo[String]
        ),
        source.fields("name").convertTo[String],
        rectangle
      ))
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