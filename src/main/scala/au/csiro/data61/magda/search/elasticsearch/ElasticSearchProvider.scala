package au.csiro.data61.magda.search.elasticsearch

import spray.json._

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext
import scala.concurrent.Future

import com.sksamuel.elastic4s._
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.mappings.FieldType._
import com.sksamuel.elastic4s.source.Indexable
import com.sksamuel.elastic4s.AbstractAggregationDefinition
import com.sksamuel.elastic4s.IndexAndTypes.apply
import com.sksamuel.elastic4s.IndexesAndTypes.apply

import org.elasticsearch.search.aggregations.bucket.histogram.DateHistogramInterval
import org.elasticsearch.search.aggregations.bucket.terms._
import org.elasticsearch.search.aggregations.Aggregation
import org.elasticsearch.search.aggregations.bucket.MultiBucketsAggregation

import au.csiro.data61.magda.search.SearchProvider
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import au.csiro.data61.magda.model.temporal._
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.model.misc.Protocols._
import scala.collection.mutable.Buffer
import com.sksamuel.elastic4s.analyzers.KeywordAnalyzer
import com.sksamuel.elastic4s.analyzers.LowercaseTokenFilter
import com.sksamuel.elastic4s.analyzers.CustomAnalyzerDefinition
import com.sksamuel.elastic4s.analyzers.KeywordTokenizer

class ElasticSearchProvider(implicit val ec: ExecutionContext) extends SearchProvider {

  val uri = ElasticsearchClientUri("elasticsearch://search:9300")
  val client = ElasticClient.transport(uri)

  case class FacetDefinition(
    queryModifier: (String, SearchDefinition) => SearchDefinition,
    generalAggDef: Int => AbstractAggregationDefinition,
    searchAggDef: (String, Int) => AbstractAggregationDefinition,
    getOptionsGeneral: (FacetType, Map[String, Seq[Aggregation]]) => Seq[FacetOption] = (facetType, aggsMap) => aggsMap.get(facetType.id).get.head,
    getOptionsSearch: (FacetType, Map[String, Seq[Aggregation]]) => Seq[FacetOption] = (facetType, aggsMap) => aggsMap.get(facetType.id).get.head)

  val facetAggregations = Map[FacetType, FacetDefinition](
    FacetType.Publisher ->
      FacetDefinition(
        queryModifier = (queryText: String, searchDef) => if (queryText.length > 0) searchDef query { matchQuery("publisher.name", queryText) } else searchDef,
        generalAggDef = (limit: Int) => aggregation.terms(FacetType.Publisher.id).field("publisher.name.untouched").size(limit),
        searchAggDef = (query, limit) => aggregation
          .terms("publisher").field("publisher.name.untouched").size(limit).order(Terms.Order.aggregation("avg_score", false))
          .aggregations(
            aggregation.avg("avg_score").script(script("_score").lang("expression"))
          )),

    FacetType.Year ->
      FacetDefinition(
        queryModifier = (queryText, searchDef) => searchDef,
        generalAggDef = (limit: Int) => aggregation datehistogram FacetType.Year.id field "issued" interval DateHistogramInterval.YEAR format "yyyy",
        searchAggDef = (queryText, limit) => aggregation.datehistogram(FacetType.Year.id).field("issued").interval(DateHistogramInterval.YEAR).format("yyyy"),
        getOptionsSearch = (facetType, aggsMap) => aggsMap.get("filter").get.head.getProperty("year").asInstanceOf[Aggregation])
  ) //,
  //    FacetType.Format -> FacetDefinition(
  //      //      queryModifier = (queryText, searchDef) => searchDef query { nestedQuery("distributions") query { matchQuery("distributions.format", queryText) } },
  //      generalAggDef = (limit: Int) => aggregation nested "distributions" path "distributions" aggregations { aggregation terms "format" field "distributions.format.untokenized" size limit },
  //      getOptions = (facetType, aggsMap) => aggsMap.get("distributions").get.head.getProperty("format").asInstanceOf[Aggregation]
  //    )

  val setupFuture = setup()

  def setup(): Future[Any] = {
    client.execute {
      delete index "magda"
    } recover { case cause => println(cause) } map { a =>
      client.execute {
        create.index("magda").mappings(
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
            ),
            field("distributions").nested(
              field("format").typed(StringType).fields(
                field("untokenized").typed(StringType).analyzer("untokenized")
              )
            )
          )
        ).analysis(CustomAnalyzerDefinition("untokenized", KeywordTokenizer, LowercaseTokenFilter))
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

  override def search(queryText: String, limit: Int) =
    setupFuture.flatMap(a =>
      client.execute {
        ElasticDsl.search in "magda" / "datasets" query queryText limit limit aggregations facetAggregations.values.map(_.generalAggDef(10))
      } map { response =>
        val aggs = response.aggregations.asList().asScala.toSeq.groupBy { agg => agg.getName }

        new SearchResult(
          hitCount = response.getHits.totalHits().toInt,
          dataSets = response.as[DataSet].toList,
          facets = Some(facetAggregations.map {
            case (facetType, definition) => new Facet(
              id = facetType,
              options = definition.getOptionsGeneral(facetType, aggs)
            )
          }.toSeq)
        )
      }
    )

  override def searchFacets(facetType: FacetType, queryText: String, limit: Int): Future[Option[Seq[FacetOption]]] = {
    val facetDef: FacetDefinition = facetAggregations.get(facetType).get
    setupFuture.flatMap(a =>
      client.execute {
        facetDef.queryModifier(queryText, ElasticDsl.search in "magda" / "datasets" limit 0 aggregations facetDef.searchAggDef(queryText, limit))
      } map { response =>
        println(response)
        val aggs = response.aggregations.asList().asScala.toSeq.groupBy { agg => agg.getName }
        Some(facetDef.getOptionsSearch(facetType, aggs))
      }
    )
  }
}