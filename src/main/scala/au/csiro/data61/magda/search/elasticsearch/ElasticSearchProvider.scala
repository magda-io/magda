package au.csiro.data61.magda.search.elasticsearch

import spray.json._

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext
import scala.concurrent.Future
import scala.collection.mutable.Buffer
import scala.util.control.Exception._

import com.sksamuel.elastic4s._
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.mappings.FieldType._
import com.sksamuel.elastic4s.source.Indexable
import com.sksamuel.elastic4s.AbstractAggregationDefinition
import com.sksamuel.elastic4s.IndexAndTypes.apply
import com.sksamuel.elastic4s.IndexesAndTypes.apply
import com.sksamuel.elastic4s.analyzers._

import org.elasticsearch.search.aggregations.bucket.histogram.DateHistogramInterval
import org.elasticsearch.search.aggregations.bucket.terms._
import org.elasticsearch.search.aggregations.Aggregation
import org.elasticsearch.search.aggregations.bucket.MultiBucketsAggregation

import au.csiro.data61.magda.search.SearchProvider
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import au.csiro.data61.magda.model.temporal._
import au.csiro.data61.magda.model.misc
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.model.misc.Protocols._
import au.csiro.data61.magda.util.FutureRetry.retry

import akka.actor.ActorSystem
import akka.event.Logging

import java.time._
import scala.concurrent.duration._
import org.elasticsearch.action.ActionRequestValidationException
import org.elasticsearch.index.IndexNotFoundException
import org.elasticsearch.client.transport.NoNodeAvailableException
import org.elasticsearch.transport.RemoteTransportException
import au.csiro.data61.magda.api.Query
import org.elasticsearch.search.aggregations.bucket.terms.Terms.Order

class ElasticSearchProvider(implicit val system: ActorSystem, implicit val ec: ExecutionContext) extends SearchProvider {
  val logger = Logging(system, getClass)

  case class FacetDefinition(
    generalAggDef: (Query, Int) => AbstractAggregationDefinition,
    getOptionsGeneral: (FacetType, String => Aggregation) => Seq[FacetOption] = (facetType, getAgg) => getAgg(facetType.id))

  val facetAggregations: Map[FacetType, FacetDefinition] = Map(
    Publisher -> FacetDefinition(
      generalAggDef = (query: Query, limit) => {
        aggregation.terms(Publisher.id).field("publisher.name.untouched").size(limit)
      }),

    misc.Year -> FacetDefinition(
      generalAggDef = (query, limit) => aggregation.terms(misc.Year.id).field("years").order(Order.term(false)).size(limit)),

    Format -> FacetDefinition(
      generalAggDef = (query, limit) => aggregation nested "distributions" path "distributions" aggregations {
        aggregation terms "format" field "distributions.format.untokenized" size limit
      },
      getOptionsGeneral = (facetType, getAgg) => getAgg("distributions").getProperty("format").asInstanceOf[Aggregation]
    )
  )

  /**
   * Returns an initialised {@link ElasticClient} on completion. Using this to get the client rather than just keeping a reference to an initialised client
   *  ensures that all queries will only complete after the client is initialised.
   */
  private val setupFuture = setup()

  /** Initialises an {@link ElasticClient}, handling initial connection to the ElasticSearch server and creation of the index */
  private def setup(): Future[ElasticClient] = {
    implicit val scheduler = system.scheduler

    def onRetry = (retriesLeft: Int) => logger.warning("Failed to make initial contact with ES server, {} retries left", retriesLeft)

    retry(Future {
      val uri = ElasticsearchClientUri("elasticsearch://search:9300")
      val client = ElasticClient.transport(uri)
      client.execute(get cluster health).map(_ => client)
    }.flatMap(a => a), 10 seconds, 10, onRetry)
      .flatMap { client =>
        client.execute {
          delete index "magda"
        } recover {
          // No magda index, this is probably first boot.
          case (outer: RemoteTransportException) => outer.getCause match {
            case (inner: IndexNotFoundException) => logger.error(outer, "Could not delete existing magda index, this is probably fine")
          }
        } map { a =>
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
              mapping(Format.id),
              mapping(misc.Year.id),
              mapping(Format.id)
            ).analysis(CustomAnalyzerDefinition("untokenized", KeywordTokenizer, LowercaseTokenFilter))
          }
        } map { _ => client }
      }
  }

  def getYears(from: Option[Instant], to: Option[Instant]): List[String] = {
    def getYearsInner(from: LocalDate, to: LocalDate): List[String] =
      if (from.isAfter(to)) {
        Nil
      } else {
        from.getYear.toString :: getYearsInner(from.plusYears(1), to)
      }

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
    setupFuture.flatMap(client =>
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
              ElasticDsl.index into "magda" / Publisher.id
                id publisherName.toLowerCase
                source Map("value" -> publisherName).toJson
            ))

            val indexYears = getYears(
              dataSet.temporal.flatMap(_.start.flatMap(_.date)),
              dataSet.temporal.flatMap(_.end.flatMap(_.date))
            ).map(year => ElasticDsl.index into "magda" / misc.Year.id id year source Map("value" -> year).toJson)

            val indexFormats = dataSet.distributions.map(_.filter(_.format.isDefined).map { distribution =>
              val format = distribution.format.get

              ElasticDsl.index into "magda" / Format.id id format.toLowerCase source Map("value" -> format).toJson
            }).getOrElse(Nil)

            indexDataSet :: indexYears ++ indexPublisher.toList ++ indexFormats
          }.flatten
        )
      }
    )
  }

  override def search(query: Query, limit: Int) = {
    setupFuture.flatMap(client =>
      client.execute {
        addAggregations(addQuery(ElasticDsl.search in "magda" / "datasets" limit limit, query), query)
      } map { response =>
        val aggs = response.aggregations.asMap().asScala
        val filter = aggs.get("filter").get
        def getAgg(key: String) : Aggregation = aggs.getOrElse(key, filter.getProperty(key).asInstanceOf[Aggregation])

        new SearchResult(
          query = query,
          hitCount = response.getHits.totalHits().toInt,
          dataSets = response.as[DataSet].toList,
          facets = Some(facetAggregations.map {
            case (facetType, definition) => new Facet(
              id = facetType,
              options = definition.getOptionsGeneral(facetType, getAgg)
            )
          }.toSeq)
        )
      }
    )
  }

  def addAggregations(searchDef: SearchDefinition, query: Query) = {
    searchDef aggregations (
      facetAggregations.filter(_._1 match {
        // Only include facets in the filtered aggregation if they're not themselves being filtered
        case misc.Year => query.dateFrom.isDefined || query.dateTo.isDefined
        case Format    => !query.formats.isEmpty
        case Publisher => !query.publishers.isEmpty
      }).map(_._2.generalAggDef(query, 10)).toList :+

      aggregation.filter("filter").filter(
        should(Seq(
          query.publishers.map(publisher => matchQuery("publisher.name", publisher)),
          query.formats.map(format => nestedQuery("distributions").query(
            matchQuery("distributions.format", format)
          )),
          query.dateFrom.map(dateFrom => rangeQuery("temporal.end.date").gte(dateFrom.toString)).map(Seq(_)).getOrElse(Nil),
          query.dateTo.map(dateTo => rangeQuery("temporal.start.date").lte(dateTo.toString)).map(Seq(_)).getOrElse(Nil)
        ).flatten)
      ).aggs(facetAggregations.filter(_._1 match {
          // Only include facets in the filtered aggregation if they're not themselves being filtered
          case misc.Year => !query.dateFrom.isDefined && !query.dateTo.isDefined
          case Format    => query.formats.isEmpty
          case Publisher => query.publishers.isEmpty
        }).map(_._2.generalAggDef(query, 10)))
    )
  }

  def addQuery(searchDef: SearchDefinition, query: Query): SearchDefinition = {
    val processedQuote = query.quotes.map(quote => s"""${quote}""") match {
      case Nil => None
      case xs  => Some(xs.reduce(_ + " " + _))
    }

    val stringQuery: Option[String] = (query.freeText, processedQuote) match {
      case (None, None)       => None
      case (None, some)       => some
      case (some, None)       => some
      case (freeText, quotes) => Some(freeText + " " + quotes)
    }

    searchDef.query(stringQuery.getOrElse("*")).postFilter {
      should(Seq(
        query.formats.map(format =>
          nestedQuery("distributions").query(
            matchQuery("distributions.format", format)
          )
        ),
        query.publishers.map(matchPhraseQuery("publisher.name", _)),
        query.dateFrom.map(dateFrom => Seq(
          rangeQuery("temporal.end.date").gte(dateFrom.toString)
        )).getOrElse(Nil),
        query.dateTo.map(dateTo => Seq(
          rangeQuery("temporal.start.date").lte(dateTo.toString)
        )).getOrElse(Nil)
      ).flatten)
    }
  }

  override def searchFacets(facetType: FacetType, queryText: String, limit: Int): Future[FacetSearchResult] = {
    setupFuture.flatMap(client =>
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