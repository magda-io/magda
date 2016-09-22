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
import com.sksamuel.elastic4s.analyzers._
import java.time._

class ElasticSearchProvider(implicit val ec: ExecutionContext) extends SearchProvider {

  val uri = ElasticsearchClientUri("elasticsearch://search:9300")
  val client = ElasticClient.transport(uri)

  case class FacetDefinition(
    generalAggDef: Int => AbstractAggregationDefinition,
    getOptionsGeneral: (FacetType, Map[String, Seq[Aggregation]]) => Seq[FacetOption] = (facetType, aggsMap) => aggsMap.get(facetType.id).get.head)

  val facetAggregations: Map[FacetType, FacetDefinition] = Map(
    FacetType.Publisher -> FacetDefinition(
      generalAggDef = (limit: Int) => aggregation.terms(FacetType.Publisher.id).field("publisher.name.untouched").size(limit)),

    FacetType.Year -> FacetDefinition(
      generalAggDef = (limit: Int) => aggregation.terms(FacetType.Year.id).field("years").size(limit)),

    FacetType.Format -> FacetDefinition(
      generalAggDef = (limit: Int) => aggregation nested "distributions" path "distributions" aggregations { aggregation terms "format" field "distributions.format.untokenized" size limit },
      getOptionsGeneral = (facetType, aggsMap) => aggsMap.get("distributions").get.head.getProperty("format").asInstanceOf[Aggregation]
    )
  )

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
          ),
          mapping(FacetType.Format.id),
          mapping(FacetType.Year.id),
          mapping(FacetType.Format.id)
        ).analysis(CustomAnalyzerDefinition("untokenized", KeywordTokenizer, LowercaseTokenFilter))
      }
    }
  }

  def getYears(from: Option[Instant], to: Option[Instant]): List[String] = {
    def getYearsInner(from: LocalDate, to: LocalDate): List[String] =
      from.getYear.toString :: (if (from.isBefore(to)) getYearsInner(from.plusYears(1), to) else Nil)

    (from, to) match {
      case (None, None) => Nil
      case _ => {
        val newFrom = from.getOrElse(to.get).atZone(ZoneId.systemDefault).toLocalDate
        val newTo = to.getOrElse(from.get).atZone(ZoneId.systemDefault).toLocalDate

        getYearsInner(newFrom, newTo)
      }
    }
  }

  override def index(source: String, dataSets: List[DataSet]) = {
    setupFuture.flatMap(a =>
      client.execute {
        bulk(
          dataSets.map { dataSet =>
            val indexDataSet = ElasticDsl.index into "magda" / "datasets" id dataSet.uniqueId source dataSet.copy(
              years = getYears(dataSet.temporal.flatMap(_.start.flatMap(_.date)), dataSet.temporal.flatMap(_.end.flatMap(_.date))) match {
                case Nil  => None
                case list => Some(list)
              }
            ).toJson

            val indexPublisher = dataSet.publisher.flatMap(_.name.map(publisherName =>
              ElasticDsl.index into "magda" / FacetType.Publisher.id
                id publisherName.toLowerCase
                source Map("value" -> publisherName).toJson
            ))

            val indexYears = getYears(
              dataSet.temporal.flatMap(_.start.flatMap(_.date)),
              dataSet.temporal.flatMap(_.end.flatMap(_.date))
            ).map(year => ElasticDsl.index into "magda" / FacetType.Year.id id year source Map("value" -> year).toJson)

            val indexFormats = dataSet.distributions.map(_.filter(_.format.isDefined).map { distribution =>
              val format = distribution.format.get

              ElasticDsl.index into "magda" / FacetType.Format.id id format.toLowerCase source Map("value" -> format).toJson
            }).getOrElse(Nil)

            indexDataSet :: indexYears ++ indexPublisher.toList ++ indexFormats
          }.reduce(_ ++ _)
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

  override def searchFacets(facetType: FacetType, queryText: String, limit: Int): Future[FacetSearchResult] = {
    setupFuture.flatMap(a =>
      client.execute {
        ElasticDsl.search in "magda" / facetType.id query queryText limit limit
      } map { response =>
        new FacetSearchResult(
          hitCount = response.getHits.totalHits.toInt,
          // TODO: Maybe return more meaningful data?
          options = response.hits.toList.map(hit => new FacetOption(
            value = hit.getSource.get("value").toString
          ))
        )
      }
    )
  }
}