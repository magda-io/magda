package au.csiro.data61.magda.search

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext
import scala.concurrent.Future

import org.elasticsearch.search.aggregations.Aggregation
import org.elasticsearch.search.aggregations.bucket.histogram.DateHistogramInterval
import org.elasticsearch.search.aggregations.bucket.histogram.InternalHistogram
import org.elasticsearch.search.aggregations.bucket.terms._

import com.sksamuel.elastic4s.ElasticClient
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.ElasticsearchClientUri
import com.sksamuel.elastic4s.HitAs
import com.sksamuel.elastic4s.RichSearchHit
import com.sksamuel.elastic4s.mappings.FieldType._
import com.sksamuel.elastic4s.source.Indexable

import au.csiro.data61.magda.api.Types._
import au.csiro.data61.magda.api.Types.Protocols._
import spray.json._
import spray.json.JsValue
import spray.json.RootJsonFormat
import org.elasticsearch.search.aggregations.bucket.histogram.Histogram.Bucket
import org.elasticsearch.search.aggregations.bucket.histogram.Histogram

class ElasticSearchProvider(implicit val ec: ExecutionContext) extends SearchProvider {
  implicit object SprayJsonIndexable extends Indexable[JsValue] {
    override def json(t: JsValue): String = t.toString(CompactPrinter)
  }

  implicit object DataSetHitAs extends HitAs[DataSet] {
    override def as(hit: RichSearchHit): DataSet = {
      hit.sourceAsString.parseJson.convertTo[DataSet]
    }
  }

  val uri = ElasticsearchClientUri("elasticsearch://search:9300")
  val client = ElasticClient.transport(uri)
  val setupFuture = setup()

  def setup(): Future[Any] = {
    client.execute {
      delete index "magda"
    } map { a =>
      client.execute {
        create index "magda" mappings (
          mapping("datasets").fields(
            field("temporal").inner(
              field("start").inner(
                field("text").typed(StringType)
              ),
              field("end").inner(
                field("text").typed(StringType)
              )
            ),
            field("publisher").inner(
              field("name").typed(StringType).fields(
                field("untouched").typed(StringType).index("not_analyzed")
              )
            )
          )
        )
      }
    }
  }

  override def index(source: String, dataSets: List[DataSet]) = {
    setupFuture.flatMap(a =>
      client.execute {
        bulk(
          dataSets.map(dataSet =>
            ElasticDsl.index into "magda" / "datasets" id dataSet.uniqueId source dataSet.toJson
          )
        )
      }
    )
  }

  override def search(queryText: String) =
    setupFuture.flatMap(a =>
      client.execute {
        ElasticDsl.search in "magda" query queryText aggregations (
          aggregation terms "Publisher" field "publisher.name.untouched",
          aggregation datehistogram "Year" field "issued" interval DateHistogramInterval.YEAR format "yyyy"
        )
      } map { response =>
        val aggs = response.aggregations.asList().asScala

        new SearchResult(
          hitCount = response.getHits.totalHits().toInt,
          dataSets = response.as[DataSet].toList,
          facets = Some(aggs.map(agg => agg match {
            case (st: Terms) => new Facet(
              id = agg.getName,
              name = agg.getName,
              options = st.getBuckets.asScala.map { bucket =>
                new FacetOption(
                  id = bucket.getKeyAsString,
                  name = bucket.getKeyAsString,
                  hitCount = Some(bucket.getDocCount.toInt)
                )
              }
            )
            case (histogram: Histogram) => new Facet(
              id = agg.getName,
              name = agg.getName,
              options = histogram.getBuckets.asScala.map { bucket =>
                new FacetOption(
                  id = bucket.getKeyAsString,
                  name = bucket.getKeyAsString,
                  hitCount = Some(bucket.getDocCount.toInt)
                )
              }
            )
            case (st: Any) => {
              println(st)
              ???
            }
          }).toSeq)
        )
      }
    )
}