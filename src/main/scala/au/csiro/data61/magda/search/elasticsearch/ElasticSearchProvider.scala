package au.csiro.data61.magda.search.elasticsearch

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext
import scala.concurrent.Future
import org.elasticsearch.search.aggregations.bucket.histogram.DateHistogramInterval
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
import au.csiro.data61.magda.api.Types.FacetType._
import spray.json._
import org.elasticsearch.search.aggregations.bucket.MultiBucketsAggregation
import com.sksamuel.elastic4s.AbstractAggregationDefinition
import au.csiro.data61.magda.search.SearchProvider
import com.sksamuel.elastic4s.IndexAndTypes.apply
import com.sksamuel.elastic4s.IndexesAndTypes.apply
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._

class ElasticSearchProvider(implicit val ec: ExecutionContext) extends SearchProvider {

  val uri = ElasticsearchClientUri("elasticsearch://search:9300")
  val client = ElasticClient.transport(uri)

  val facetAggregations = Map[FacetType, AbstractAggregationDefinition](
    Publisher -> (aggregation terms Publisher.id field "publisher.name.untouched"),
    Year -> (aggregation datehistogram Year.id field "issued" interval DateHistogramInterval.YEAR format "yyyy")
  )

  val setupFuture = setup()

  def setup(): Future[Any] = {
    client.execute {
      delete index "magda"
    } recover { case cause => println(cause) } map { a =>
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
        ElasticDsl.search in "magda" query queryText aggregations facetAggregations.values
      } map { response =>
        val aggs = response.aggregations.asList().asScala

        new SearchResult(
          hitCount = response.getHits.totalHits().toInt,
          dataSets = response.as[DataSet].toList,
          facets = Some(aggs.map(agg => new Facet(
            id = FacetType.fromId(agg.getName).get,
            options = agg
          )).toSeq)
        )
      }
    )

  override def searchFacets(facetType: FacetType, queryText: String): Future[Option[Seq[FacetOption]]] =
    setupFuture.flatMap(a =>
      client.execute {
        ElasticDsl.search in "magda" query queryText limit 0 aggregations (facetAggregations get facetType)
      } map { response =>
        response.aggregations.asScala.headOption map (a => a)
      }
    )
}