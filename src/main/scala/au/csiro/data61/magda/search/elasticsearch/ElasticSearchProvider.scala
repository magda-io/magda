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
import org.elasticsearch.search.aggregations.InvalidAggregationPathException
import com.rockymadden.stringmetric.similarity.WeightedLevenshteinMetric

class ElasticSearchProvider(implicit val system: ActorSystem, implicit val ec: ExecutionContext) extends SearchProvider {
  val logger = Logging(system, getClass)

  case class FacetDefinition(
    aggDef: (Int) => AbstractAggregationDefinition,
    needsFilterAgg: Query => Boolean,
    filterAggDef: (Int, Query) => QueryDefinition,
    filterAggFilter: Query => FacetOption => Boolean = _ => _ => true,
    getFacetDetails: Aggregation => Seq[FacetOption] = aggregation => aggregation)

  val facetAggregations: Map[FacetType, FacetDefinition] = Map(
    Publisher -> FacetDefinition(
      aggDef = (limit) => {
        aggregation.terms(Publisher.id).field("publisher.name.untouched").size(limit)
      },
      needsFilterAgg = query => !query.publishers.isEmpty,
      filterAggDef = (limit, query) =>
        should(
          query.publishers.map(publisherQuery(_))
        ).minimumShouldMatch(1)
    ),

    misc.Year -> FacetDefinition(
      aggDef = (limit) => aggregation.terms(misc.Year.id).field("years").order(Order.term(false)).size(limit),
      needsFilterAgg = query => query.dateFrom.isDefined || query.dateTo.isDefined,
      filterAggDef = (limit, query) => must {
        val fromQuery = query.dateFrom.map(dateFromQuery(_))
        val toQuery = query.dateTo.map(dateToQuery(_))

        Seq(fromQuery, toQuery).filter(_.isDefined).map(_.get)
      }
    ),

    Format -> FacetDefinition(
      aggDef = (limit) => aggregation nested Format.id path "distributions" aggregations {
        aggregation terms "abc" field "distributions.format.untokenized" size limit
      },
      getFacetDetails = aggregation => aggregation.getProperty("abc").asInstanceOf[Aggregation],
      needsFilterAgg = query => !query.formats.isEmpty,
      filterAggDef = (limit, query) =>
        should(
          query.formats.map(formatQuery(_))
        ).minimumShouldMatch(1),
      filterAggFilter = query => filterOption => query.formats.exists(
        format => WeightedLevenshteinMetric(10, 0.1, 1).compare(format.toLowerCase, filterOption.value.toLowerCase) match {
          case Some(distance) => distance < 1.5
          case None           => false
        }
      )
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
            val indexDataSet = ElasticDsl.index into "magda" / "datasets" id dataSet.uniqueId source (
              dataSet.copy(
                years = getYears(dataSet.temporal.flatMap(_.start.flatMap(_.date)), dataSet.temporal.flatMap(_.end.flatMap(_.date))) match {
                  case Nil  => None
                  case list => Some(list)
                }
              ).toJson
            )

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
        val aggsMap = response.aggregations.asMap().asScala

        new SearchResult(
          query = query,
          hitCount = response.getHits.totalHits().toInt,
          dataSets = response.as[DataSet].toList,
          facets = Some(facetAggregations.map {
            case (facetType, definition) => new Facet(
              id = facetType,
              options = {
                val filteredOptions = (aggsMap.get(facetType.id + "-filter") match {
                  case Some(filterAgg) => definition.getFacetDetails(filterAgg.getProperty(facetType.id).asInstanceOf[Aggregation])
                  case None            => Nil
                })
                  .filter(definition.filterAggFilter(query))
                  .map(_.copy(matched = Some(true)))

                val generalOptions = definition.getFacetDetails(aggsMap.get(facetType.id).get.getProperty(facetType.id).asInstanceOf[Aggregation])

                val combined = (filteredOptions ++ generalOptions)
                val lookup = combined.groupBy(_.value)

                combined.map(_.value)
                  .distinct
                  .map(lookup.get(_).get.head)
                  .take(10)
              }
            )
          }.toSeq)
        )
      }
    )
  }

  def addAggregations(searchDef: SearchDefinition, query: Query) = {
    searchDef aggregations (
      facetAggregations.flatMap {
        case (facetType, facetAgg) => {
          val aggregations = List(
            aggregation.filter(facetType.id).filter(getFilterQueryDef(facetType, query)).aggs(facetAgg.aggDef(10))
          )

          if (facetAgg.needsFilterAgg(query)) {
            val filterAggregation = aggregation.filter(facetType.id + "-filter")
              .filter(
                facetAgg.filterAggDef(10, query)
              ).aggs(facetAgg.aggDef(10))

            filterAggregation :: aggregations
          } else aggregations
        }
      }
    )
  }

  def getFilterQueryDef(facetType: FacetType, query: Query): BoolQueryDefinition = queryToQueryDef(
    facetType match {
      case misc.Year => query.copy(dateFrom = None, dateTo = None)
      case Format    => query.copy(formats = Nil)
      case Publisher => query.copy(publishers = Nil)
    }
  )

  /**
   * Accepts a seq - if the seq is not empty, runs the passed fn over it and returns the result as Some, otherwise returns None.
   */
  def seqToOption[X, Y](seq: Seq[X])(fn: Seq[X] => Y): Option[Y] = seq match {
    case Nil => None
    case x   => Some(fn(x))
  }

  private def publisherQuery(publisher: String) = matchPhraseQuery("publisher.name", publisher)
  private def formatQuery(format: String) = nestedQuery("distributions").query(
    matchQuery("distributions.format", format)
  )
  private def dateFromQuery(dateFrom: Instant) = filter(should(
    rangeQuery("temporal.end.date").gte(dateFrom.toString),
    rangeQuery("temporal.start.date").gte(dateFrom.toString)
  ).minimumShouldMatch(1))
  private def dateToQuery(dateTo: Instant) = filter(should(
    rangeQuery("temporal.end.date").lte(dateTo.toString),
    rangeQuery("temporal.start.date").lte(dateTo.toString)
  ).minimumShouldMatch(1))

  def queryToQueryDef(query: Query): BoolQueryDefinition = {
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

    val shouldClauses: Seq[Option[QueryDefinition]] = Seq(
      Some(new QueryStringQueryDefinition(stringQuery.getOrElse("*")).boost(2)),
      seqToOption(query.publishers)(seq => should(seq.map(publisherQuery))),
      seqToOption(query.formats)(seq => should(seq.map(formatQuery))),
      query.dateFrom.map(dateFromQuery),
      query.dateTo.map(dateToQuery)
    )

    should(shouldClauses.filter(_.isDefined).map(_.get))
  }

  def addQuery(searchDef: SearchDefinition, query: Query): SearchDefinition = {
    searchDef.query(queryToQueryDef(query))
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