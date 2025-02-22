package au.csiro.data61.magda.search.elasticsearch

import au.csiro.data61.magda.model.misc.{
  Agent,
  BoundingBox,
  DataSet,
  Distribution,
  FacetOption,
  Protocols,
  QueryRegion,
  Region
}
import com.sksamuel.elastic4s.requests.searches.SearchHit
import spray.json._

import scala.util.Try
import collection.JavaConverters._
import com.sksamuel.elastic4s.{
  AggReader,
  Hit,
  HitReader,
  Indexable,
  JacksonSupport
}
import com.sksamuel.elastic4s.requests.searches.aggs.responses.HasAggregations

object ElasticSearchImplicits extends Protocols {

  implicit object SprayJsonIndexable extends Indexable[JsValue] {
    override def json(t: JsValue): String = t.toString(CompactPrinter)
  }

  implicit object SprayJsonHitAs extends HitReader[JsValue] {
    override def read(hit: Hit): Try[JsValue] =
      Try(hit.sourceAsString.parseJson)
  }

  implicit object DataSetHitAs extends HitReader[DataSet] {
    override def read(hit: Hit): Try[DataSet] = Try {

      /**
        * retrieve distributions from inner hits.
        * The inner hit data structure is like:
        * "inner_hits": {
          "distributions": {
            "hits": {
              "total": {
                "value": 76,
                "relation": "eq"
              },
              "max_score": 0.0000035340713,
              "hits": [
                {
                  "_index": "datasetsxx",
                  "_id": "ds-xx-xxxxxxxxxxx",
                  "_nested": {
                    "field": "distributions",
                    "offset": 0
                  },
                  "_score": 0.0000035340713,
                  "_source": {
                    "identifier": "dist-sa-71f9ff52-24e0-4cd7-9b43-5ef9c44b7a1b",
                    ...
                    "issued": "2018-06-15T01:50:51Z",
                    "publishingState": "published"
                  }
                }
              ]
            }
          }
        */
      val datasetSource = hit.sourceAsString.parseJson.asJsObject
      val distributions =
        hit
          .asInstanceOf[SearchHit]
          .innerHits
          .get("distributions")
          .toVector
          .flatMap { hitData =>
            hitData.hits.map { hit =>
              val distObj = JacksonSupport.mapper
                .writeValueAsString(hit.source)
                .parseJson
                .asJsObject
              JsObject(
                distObj.fields + ("score" -> JsNumber(
                  hit.score.getOrElse(0.toDouble)
                ))
              )
            }
          }
      // create a new dataset JsObject with `distributions` key and convertTo Dataset
      JsObject(
        datasetSource.fields + ("distributions" -> JsArray(distributions))
      ).convertTo[DataSet].copy(score = Some(hit.score))
    }
  }

  implicit object DataSetHitAggAs extends AggReader[DataSet] {
    override def read(json: String): Try[DataSet] = {
      Try(json.parseJson.convertTo[DataSet])
    }
  }

  implicit object RegionHitAs extends HitReader[Region] {
    override def read(hit: Hit): Try[Region] = {
      Try(hit.to[JsValue].asJsObject.convertTo[Region](esRegionFormat))
    }
  }

  def aggregationsToFacetOptions(
      aggregation: Option[HasAggregations]
  ): Seq[FacetOption] = aggregation match {
    case None => Nil
    case Some(agg) =>
      val buckets = if (agg.contains("buckets")) {
        agg.dataAsMap.get("buckets")
      } else {
        agg.dataAsMap
          .get("nested")
          .flatMap(_.asInstanceOf[Map[String, Any]].get("buckets"))
      }

      buckets.toSeq.flatMap(
        _.asInstanceOf[Seq[Map[String, Any]]]
          .map(
            m =>
              new FacetOption(
                identifier = None,
                value = m("key").toString,
                hitCount = m("doc_count").toString.toLong
              )
          )
      )
  }
}
