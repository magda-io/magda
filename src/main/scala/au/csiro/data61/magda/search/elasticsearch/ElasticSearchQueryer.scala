package au.csiro.data61.magda.search.elasticsearch

import spray.json._

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext
import scala.concurrent.Future
import scala.collection.mutable.Buffer
import scala.util.control.Exception._
import scala.util.Try
import scala.util.Success
import scala.util.Failure
import scala.concurrent.duration._
import scala.concurrent.Await
import com.sksamuel.elastic4s._
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.source.Indexable
import com.sksamuel.elastic4s.AbstractAggregationDefinition
import com.sksamuel.elastic4s.IndexAndTypes.apply
import com.sksamuel.elastic4s.IndexesAndTypes.apply
import org.elasticsearch.search.aggregations.bucket.histogram.DateHistogramInterval
import org.elasticsearch.search.aggregations.bucket.terms._
import org.elasticsearch.search.aggregations.Aggregation
import org.elasticsearch.search.aggregations.bucket.MultiBucketsAggregation
import org.elasticsearch.action.ActionRequestValidationException
import org.elasticsearch.index.IndexNotFoundException
import org.elasticsearch.client.transport.NoNodeAvailableException
import org.elasticsearch.transport.RemoteTransportException
import org.elasticsearch.search.aggregations.InvalidAggregationPathException
import au.csiro.data61.magda.search.SearchProvider
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import au.csiro.data61.magda.model.misc
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.model.misc.Protocols._
import au.csiro.data61.magda.api.Query
import akka.actor.ActorSystem
import akka.event.Logging
import akka.http.scaladsl.common.EntityStreamingSupport
import akka.stream.scaladsl.Flow
import akka.stream.scaladsl.Sink
import akka.stream.scaladsl.Source
import akka.stream.Materializer
import akka.stream.scaladsl.FileIO
import akka.stream.ThrottleMode
import akka.util.ByteString
import java.time._
import java.io.File
import java.nio.file.Paths

import au.csiro.data61.magda.AppConfig
import akka.stream.scaladsl.Merge
import au.csiro.data61.magda.api.Region
import org.elasticsearch.common.io.stream.NotSerializableExceptionWrapper
import org.elasticsearch.search.SearchParseException
import org.elasticsearch.action.search.SearchPhaseExecutionException
import akka.stream.OverflowStrategy
import org.elasticsearch.search.aggregations.bucket.filter.InternalFilter
import au.csiro.data61.magda.search.SearchStrategy
import au.csiro.data61.magda.search.MatchPart
import au.csiro.data61.magda.search.MatchAll
import au.csiro.data61.magda.util.DateParser._
import au.csiro.data61.magda.search.elasticsearch.Queries._
import au.csiro.data61.magda.search.elasticsearch.FacetDefinition.facetDefForType
import au.csiro.data61.magda.search.elasticsearch.ClientProvider.getClient
import au.csiro.data61.magda.util.SetExtractor


class ElasticSearchQueryer(implicit val system: ActorSystem, implicit val ec: ExecutionContext, implicit val materializer: Materializer) extends SearchProvider {
  val logger = system.log
  val AGGREGATION_SIZE_LIMIT = 10

  lazy val clientFuture: Future[ElasticClient] = getClient(system.scheduler, logger, ec)

  object CausedBy {
    def unapply(e: Throwable): Option[Throwable] = Option(e.getCause)
  }

  override def search(query: Query, start: Long, limit: Int) = {
    Future.sequence(query.regions.map(region => findRegion(region.regionType, region.regionId))).flatMap { regions =>
      val queryWithResolvedRegions = query.copy(regions = regions)

      clientFuture.flatMap { client =>
        client.execute(buildQueryWithAggregations(queryWithResolvedRegions, start, limit, MatchAll)).flatMap(response =>
          if (response.totalHits > 0)
            Future.successful((response, MatchAll))
          else
            client.execute(buildQueryWithAggregations(queryWithResolvedRegions, start, limit, MatchPart)).map((_, MatchPart))
        )
      } map {
        case (response, strategy) => buildSearchResult(queryWithResolvedRegions, response, strategy)
      } recover {
        case CausedBy(CausedBy(CausedBy(illegalArgument: IllegalArgumentException))) => failureSearchResult(query, "Bad argument: " + illegalArgument.getMessage)
        case e: Throwable =>
          logger.error(e, "Exception when searching")
          failureSearchResult(query, "Unknown error")
      }
    }
  }

  /**
   * Turns an ES response into a magda SearchResult.
   */
  def buildSearchResult(query: Query, response: RichSearchResponse, strategy: SearchStrategy): SearchResult = {
    val aggsMap = response.aggregations.asMap().asScala
    new SearchResult(
      strategy = Some(strategy),
      query = query,
      hitCount = response.getHits.totalHits().toInt,
      dataSets = response.as[DataSet].toList,
      facets = Some(FacetType.all.map { facetType =>
        val definition = facetDefForType(facetType)

        new Facet(
          id = facetType,
          options = {
            // Filtered options are the ones that partly match the user's input... e.g. "Ballarat Council" for input "Ballarat"
            val filteredOptions =
              (aggsMap.get(facetType.id + "-filter") match {
                case Some(filterAgg) => definition.extractFacetOptions(filterAgg.getProperty(facetType.id).asInstanceOf[Aggregation])
                case None            => Nil
              }).filter(definition.isFilterOptionRelevant(query))
                .map(_.copy(matched = Some(true)))

            // Exact options are for when a user types a correct facet name exactly but we have no hits for it, so we still want to
            // display it to them to show them that it does *exist* but not for this query
            val exactOptions =
              definition.exactMatchQueries(query)
                .map {
                  case (name, query) => (
                    name,
                    aggsMap
                    .get(facetType.id + "-global")
                    .get
                    .getProperty(facetType.id + "-exact-" + name)
                  )
                }
                .map {
                  case (name, agg: InternalFilter) => if (agg.getDocCount > 0 && !filteredOptions.exists(_.value == name)) Some(FacetOption(name, 0)) else None
                }
                .flatten
                .toSeq

            val alternativeOptions =
              definition.extractFacetOptions(
                aggsMap
                  .get(facetType.id + "-global")
                  .get
                  .getProperty("filter").asInstanceOf[Aggregation]
                  .getProperty(facetType.id).asInstanceOf[Aggregation])

            definition.truncateFacets(filteredOptions, exactOptions, alternativeOptions, AGGREGATION_SIZE_LIMIT)
          })
      }.toSeq))
  }

  /** Converts from a general search strategy to the actual elastic4s method that will combine a number of queries using that strategy.*/
  implicit def strategyToCombiner(strat: SearchStrategy): Iterable[QueryDefinition] => QueryDefinition = strat match {
    case MatchAll  => must
    case MatchPart => should
  }

  /** Builds an elastic search query out of the passed general magda Query */
  def buildQuery(query: Query, start: Long, limit: Int, strategy: SearchStrategy) =
    ElasticDsl.search.in("datasets" / "datasets")
      .limit(limit)
      .start(start.toInt)
      .query(queryToQueryDef(query, strategy))

  /** Same as {@link #buildQuery} but also adds aggregations */
  def buildQueryWithAggregations(query: Query, start: Long, limit: Int, strategy: SearchStrategy) = addAggregations(buildQuery(query, start, limit, strategy), query, strategy)

  /** Builds an empty dummy searchresult that conveys some kind of error message to the user. */
  def failureSearchResult(query: Query, message: String) = new SearchResult(
    query = query,
    hitCount = 0,
    dataSets = Nil,
    errorMessage = Some(message)
  )

  /** Adds standard aggregations to an elasticsearch query */
  def addAggregations(searchDef: SearchDefinition, query: Query, strategy: SearchStrategy) = {
    val aggregations: List[AbstractAggregationDefinition] =
      FacetType.all.flatMap(facetType =>
        aggsForFacetType(query, facetType, strategy)
      ).toList

    searchDef.aggregations(aggregations)
  }

  /** Gets all applicable ES aggregations for the passed FacetType, given a Query */
  def aggsForFacetType(query: Query, facetType: FacetType, strategy: SearchStrategy): List[AbstractAggregationDefinition] = {
    val facetDef = facetDefForType(facetType)

    // Sub-aggregations of "global" aggregate on all datasets independently of the query passed in.
    val globalAgg =
      aggregation
        .global(facetType.id + "-global")
        .aggs(alternativesAggregation(query, facetDef, strategy) :: exactMatchAggregations(query, facetType, facetDef, strategy))
        .asInstanceOf[AbstractAggregationDefinition]

    val partialMatchesAgg =
      if (facetDef.relatedToQuery(query)) // If there's details in the query that relate to this facet...
        // Then create an aggregation that shows all results for this facet that partially match the details
        // in the query... this is useful if say the user types in "Ballarat", we can suggest "Ballarat Council"
        Some(
          aggregation
            .filter(facetType.id + "-filter")
            .filter(facetDef.filterAggregationQuery(query)).aggs(facetDef.aggregationDefinition(AGGREGATION_SIZE_LIMIT))
            .asInstanceOf[AbstractAggregationDefinition]
        )
      else
        None

    List(Some(globalAgg), partialMatchesAgg).flatten
  }

  /**
   * The exact match aggs are for situations where the user puts in a free text facet - we want
   * to see whether that exists in the system at all even if it has no hits with their current
   * query, in order to more helpfully correct their search if they mispelled etc.
   */
  def exactMatchAggregations(query: Query, facetType: FacetType, facetDef: FacetDefinition, strategy: SearchStrategy): List[FilterAggregationDefinition] =
    facetDef.exactMatchQueries(query).map {
      case (name, query) =>
        aggregation.filter(facetType.id + "-exact-" + name).filter(query)
    }.toList

  /**
   * The alternatives aggregation shows what other choices are available if the user wasn't
   * filtering on this facet - e.g. if I was searching for datasets from a certain publisher,
   * this shows me other publishers I could search on instead
   */
  def alternativesAggregation(query: Query, facetDef: FacetDefinition, strategy: SearchStrategy) =
    aggregation
      .filter("filter")
      .filter(queryToQueryDef(facetDef.removeFromQuery(query), strategy))
      .aggs(facetDef.aggregationDefinition(AGGREGATION_SIZE_LIMIT))

  /**
   * Accepts a seq - if the seq is not empty, runs the passed fn over it and returns the result as Some, otherwise returns None.
   */
  private def setToOption[X, Y](seq: Set[X])(fn: Set[X] => Y): Option[Y] = seq match {
    case SetExtractor() => None
    case x   => Some(fn(x))
  }

  /** Processes a general magda Query into a specific ES QueryDefinition */
  private def queryToQueryDef(query: Query, strategy: SearchStrategy): QueryDefinition = {
    val processedQuote = query.quotes.map(quote => s"""${quote}""") match {
      case SetExtractor() => None
      case xs  => Some(xs.reduce(_ + " " + _))
    }

    val stringQuery: Option[String] = (query.freeText, processedQuote) match {
      case (None, None)       => None
      case (None, some)       => some
      case (some, None)       => some
      case (freeText, quotes) => Some(freeText + " " + quotes)
    }

    val operator = strategy match {
      case MatchAll  => "and"
      case MatchPart => "or"
    }

    val shouldClauses: Seq[Option[QueryDefinition]] = Seq(
      stringQuery.map(innerQuery => new QueryStringQueryDefinition(innerQuery).operator(operator).boost(2)),
      setToOption(query.publishers)(seq => should(seq.map(publisherQuery))),
      setToOption(query.formats)(seq => should(seq.map(formatQuery))),
      query.dateFrom.map(dateFromQuery),
      query.dateTo.map(dateToQuery),
      setToOption(query.regions)(seq => should(seq.map(regionIdQuery))))

    strategy(shouldClauses.flatten)
  }

  override def searchFacets(facetType: FacetType, facetQuery: String, generalQuery: Query, start: Long, limit: Int): Future[FacetSearchResult] = {
    val facetDef = facetDefForType(facetType)

    clientFuture.flatMap { client =>
      // First do a normal query search on the type we created for values in this facet
      client.execute(ElasticDsl.search in "datasets" / facetType.id query facetQuery start start.toInt limit limit)
        .flatMap { response =>
          response.totalHits match {
            case 0 => Future(FacetSearchResult(0, Nil)) // If there's no hits, no need to do anything more
            case _ =>
              val hitNames: Seq[String] = response.getHits.asScala.map(hit => hit.getSource.get("value").toString).toSeq

              // Create a dataset filter aggregation for each hit in the initial query
              val filters = hitNames.map(name =>
                aggregation.filter(name).filter(facetDef.exactMatchQuery(name))
              )

              // Do a datasets query WITHOUT filtering for this facet and  with an aggregation for each of the hits we
              // got back on our keyword - this allows us to get an accurate count of dataset hits for each result
              client.execute {
                buildQuery(facetDef.removeFromQuery(generalQuery), 0, 0, MatchAll).aggs(filters)
              } map { aggQueryResult =>
                val aggregations = aggQueryResult.aggregations.asScala
                  .map {
                    case bucket: InternalFilter => new FacetOption(
                      value = bucket.getName,
                      hitCount = bucket.getDocCount
                    )
                  }
                  .groupBy(_.value)
                  .mapValues(_.head)

                FacetSearchResult(
                  hitCount = response.totalHits,
                  options = hitNames.map { hitName => aggregations.get(hitName).get }
                )
              }
          }
        }
    }
  }

  override def searchRegions(query: String, start: Long, limit: Int): Future[RegionSearchResult] = {
    clientFuture.flatMap { client =>
      client.execute(ElasticDsl.search in "regions" / "regions" query { matchPhrasePrefixQuery("name", query) } start start.toInt limit limit sourceExclude ("geometry"))
        .flatMap { response =>
          response.totalHits match {
            case 0 => Future(RegionSearchResult(query, 0, List())) // If there's no hits, no need to do anything more
            case _ => Future(RegionSearchResult(query, response.totalHits, response.as[Region].toList))
          }
        }
    }
  }

  def findRegion(regionType: String, regionId: String): Future[Region] = {
    clientFuture.flatMap { client =>
      client.execute(ElasticDsl.search in "regions" / "regions" query { idsQuery((regionType + "/" + regionId).toLowerCase) } start 0 limit 1 sourceExclude ("geometry"))
        .flatMap { response =>
          response.totalHits match {
            case 0 => Future(Region(regionType, regionId, "[Unknown]", None))
            case _ => Future(response.as[Region].head)
          }
        }
    }
  }
}