package au.csiro.data61.magda.search.elasticsearch

import akka.actor.ActorSystem
import akka.stream.Materializer
import au.csiro.data61.magda.api.Query
import au.csiro.data61.magda.api.model.{RegionSearchResult, SearchResult}
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.search.elasticsearch.FacetDefinition.facetDefForType
import au.csiro.data61.magda.search.elasticsearch.Indices._
import au.csiro.data61.magda.search.elasticsearch.Queries._
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import au.csiro.data61.magda.search.{MatchAll, MatchPart, SearchQueryer, SearchStrategy}
import au.csiro.data61.magda.util.ErrorHandling.CausedBy
import au.csiro.data61.magda.util.SetExtractor
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s._
import org.elasticsearch.search.aggregations.Aggregation
import org.elasticsearch.search.aggregations.bucket.filter.InternalFilter
import org.elasticsearch.search.sort.SortOrder

import scala.collection.JavaConverters._
import scala.concurrent.{ExecutionContext, Future}
import com.typesafe.config.Config

class ElasticSearchQueryer(indices: Indices = DefaultIndices)(
  implicit
  val config: Config,
  implicit val system: ActorSystem,
  implicit val ec: ExecutionContext,
  implicit val materializer: Materializer,
  implicit val clientProvider: ClientProvider
) extends SearchQueryer {
  private val logger = system.log

  lazy val clientFuture: Future[ElasticClientTrait] = clientProvider.getClient(system.scheduler, logger, ec)

  override def search(query: Query, start: Long, limit: Int, requestedFacetSize: Int) = {
    Future.sequence(query.regions.map(region => findRegion(region.regionType, region.regionId))).flatMap { regions =>
      val queryWithResolvedRegions = query.copy(regions = regions)

      val facetSize = idealFacetSize(query, requestedFacetSize)

      clientFuture.flatMap { client =>
        client.execute(buildQueryWithAggregations(queryWithResolvedRegions, start, limit, MatchAll, facetSize)).flatMap(response =>
          if (response.totalHits > 0)
            Future.successful((response, MatchAll))
          else
            client.execute(buildQueryWithAggregations(queryWithResolvedRegions, start, limit, MatchPart, facetSize)).map((_, MatchPart)))
      } map {
        case (response, strategy) => buildSearchResult(queryWithResolvedRegions, response, strategy, requestedFacetSize)
      } recover {
        case CausedBy(CausedBy(CausedBy(illegalArgument: IllegalArgumentException))) =>
          logger.error(illegalArgument, "Exception when searching")
          failureSearchResult(query, "Bad argument: " + illegalArgument.getMessage)
        case e: Throwable =>
          logger.error(e, "Exception when searching")
          failureSearchResult(query, "Unknown error")
      }
    }
  }

  /**
    * Calculate the ideal facet size for this query - we have to take the facet exact match queries into account because
    * if we always passed through the requested facetSize, we might end up in a situation where requested facet size
    * was 1 but the query had 3 exact match queries for publishers in it - we'd only know the hitCount for the first
    * exact match because we only asked for 1 facet from ES.
    */
  private def idealFacetSize(query: Query, requestedFacetSize: Int) = {
    val queryFacetSize = FacetType.all.map(FacetDefinition.facetDefForType(_).exactMatchQueries(query).size).max
    Math.max(queryFacetSize, requestedFacetSize)
  }

  /**
   * Turns an ES response into a magda SearchResult.
   */
  def buildSearchResult(query: Query, response: RichSearchResponse, strategy: SearchStrategy, facetSize: Int): SearchResult = {
    val aggsMap = response.aggregations.asMap().asScala
    new SearchResult(
      strategy = Some(strategy),
      query = query,
      hitCount = response.getHits.totalHits().toInt,
      dataSets = response.as[DataSet].toList,
      facets = Some(FacetType.all.map { facetType =>
        val definition = facetDefForType(facetType)

        new Facet(
          id = facetType.id,
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
                  aggsMap(facetType.id + "-global").getProperty(facetType.id + "-exact-" + name)
                )
              }
              .flatMap {
                case (name, agg: InternalFilter) => if (agg.getDocCount > 0 && !filteredOptions.exists(_.value == name)) Some(FacetOption(name, 0)) else None
              }
              .toSeq

          val alternativeOptions =
            definition.extractFacetOptions(
              aggsMap(facetType.id + "-global")
              .getProperty("filter").asInstanceOf[Aggregation]
              .getProperty(facetType.id).asInstanceOf[Aggregation]
            )

          definition.truncateFacets(query, filteredOptions, exactOptions, alternativeOptions, facetSize)
        }
        )
      }.toSeq)
    )
  }

  /** Converts from a general search strategy to the actual elastic4s method that will combine a number of queries using that strategy.*/
  implicit def strategyToCombiner(strat: SearchStrategy): Iterable[QueryDefinition] => QueryDefinition = strat match {
    case MatchAll  => must
    case MatchPart => should
  }

  /** Builds an elastic search query out of the passed general magda Query */
  def buildQuery(query: Query, start: Long, limit: Int, strategy: SearchStrategy) = {
    ElasticDsl.search.in(indices.getIndex(config, Indices.DataSetsIndex) / indices.getType(Indices.DataSetsIndexType))
      .limit(limit)
      .start(start.toInt)
      .query(queryToQueryDef(query, strategy))
  }

  /** Same as {@link #buildQuery} but also adds aggregations */
  def buildQueryWithAggregations(query: Query, start: Long, limit: Int, strategy: SearchStrategy, facetSize: Int) = addAggregations(buildQuery(query, start, limit, strategy), query, strategy, facetSize)

  /** Builds an empty dummy searchresult that conveys some kind of error message to the user. */
  def failureSearchResult(query: Query, message: String) = new SearchResult(
    query = query,
    hitCount = 0,
    dataSets = Nil,
    errorMessage = Some(message)
  )

  /** Adds standard aggregations to an elasticsearch query */
  def addAggregations(searchDef: SearchDefinition, query: Query, strategy: SearchStrategy, facetSize: Int) = {
    val aggregations: List[AbstractAggregationDefinition] =
      FacetType.all.flatMap(facetType =>
        aggsForFacetType(query, facetType, strategy, facetSize)).toList

    searchDef.aggregations(aggregations)
  }

  /** Gets all applicable ES aggregations for the passed FacetType, given a Query */
  def aggsForFacetType(query: Query, facetType: FacetType, strategy: SearchStrategy, facetSize: Int): List[AbstractAggregationDefinition] = {
    val facetDef = facetDefForType(facetType)

    // Sub-aggregations of "global" aggregate on all datasets independently of the query passed in.
    val globalAgg =
      aggregation
        .global(facetType.id + "-global")
        .aggs(alternativesAggregation(query, facetDef, strategy, facetSize) :: exactMatchAggregations(query, facetType, facetDef, strategy))
        .asInstanceOf[AbstractAggregationDefinition]

    val partialMatchesAgg =
      if (facetDef.isRelevantToQuery(query)) // If there's details in the query that relate to this facet...
        // Then create an aggregation that shows all results for this facet that partially match the details
        // in the query... this is useful if say the user types in "Ballarat", we can suggest "Ballarat Council"
        Some(
          aggregation
          .filter(facetType.id + "-filter")
          .filter(facetDef.filterAggregationQuery(query)).aggs(facetDef.aggregationDefinition(facetSize))
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
  def alternativesAggregation(query: Query, facetDef: FacetDefinition, strategy: SearchStrategy, facetSize: Int) =
    aggregation
      .filter("filter")
      .filter(queryToQueryDef(facetDef.removeFromQuery(query), strategy))
      .aggs(facetDef.aggregationDefinition(facetSize))

  /**
   * Accepts a seq - if the seq is not empty, runs the passed fn over it and returns the result as Some, otherwise returns None.
   */
  private def setToOption[X, Y](seq: Set[X])(fn: Set[X] => Y): Option[Y] = seq match {
    case SetExtractor() => None
    case x              => Some(fn(x))
  }

  /** Processes a general magda Query into a specific ES QueryDefinition */
  private def queryToQueryDef(query: Query, strategy: SearchStrategy): QueryDefinition = {
    val processedQuote = query.quotes.map(quote => s"""${quote}""") match {
      case SetExtractor() => None
      case xs             => Some(xs.reduce(_ + " " + _))
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

    val clauses: Seq[Option[QueryDefinition]] = Seq(
      stringQuery.map(innerQuery => new QueryStringQueryDefinition(innerQuery).operator(operator).boost(2)),
      setToOption(query.publishers)(seq => should(seq.map(publisherQuery))),
      setToOption(query.formats)(seq => should(seq.map(formatQuery))),
      query.dateFrom.map(dateFromQuery),
      query.dateTo.map(dateToQuery),
      setToOption(query.regions)(seq => should(seq.map(regionIdQuery(_, indices))))
    )

    strategy(clauses.flatten)
  }

  override def searchFacets(facetType: FacetType, facetQuery: String, generalQuery: Query, start: Long, limit: Int): Future[FacetSearchResult] = {
    val facetDef = facetDefForType(facetType)

    clientFuture.flatMap { client =>
      // First do a normal query search on the type we created for values in this facet
      client.execute(ElasticDsl.search in indices.getIndex(config, Indices.DataSetsIndex) / indices.getType(indices.typeForFacet(facetType)) query facetQuery start start.toInt limit limit)
        .flatMap { response =>
          response.totalHits match {
            case 0 => Future(FacetSearchResult(0, Nil)) // If there's no hits, no need to do anything more
            case _ =>
              val hitNames: Seq[String] = response.getHits.asScala.map(hit => hit.getSource.get("value").toString).toSeq

              // Create a dataset filter aggregation for each hit in the initial query
              val filters = hitNames.map(name =>
                aggregation.filter(name).filter(facetDef.exactMatchQuery(name)))

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
                  options = hitNames.map { hitName => aggregations(hitName) }
                )
              }
          }
        }
    }
  }

  override def searchRegions(query: String, start: Long, limit: Int): Future[RegionSearchResult] = {
    clientFuture.flatMap { client =>
      client.execute(
        ElasticDsl.search in indices.getIndex(config, Indices.RegionsIndex) / indices.getType(Indices.RegionsIndexType)
          query { matchPhrasePrefixQuery("name", query) }
          start start.toInt
          limit limit
          sort (
            field sort "order" order SortOrder.ASC,
            field sort "_score" order SortOrder.DESC
          )
            sourceExclude "geometry"
      ).flatMap { response =>
          response.totalHits match {
            case 0 => Future(RegionSearchResult(query, 0, List())) // If there's no hits, no need to do anything more
            case _ => Future(RegionSearchResult(query, response.totalHits, response.as[Region].toList))
          }
        }
    }
  }

  def findRegion(regionType: String, regionId: String): Future[Region] = {
    clientFuture.flatMap { client =>
      client.execute(ElasticDsl.search in indices.getIndex(config, Indices.RegionsIndex) / indices.getType(Indices.RegionsIndexType)
        query { idsQuery((regionType + "/" + regionId).toLowerCase) } start 0 limit 1 sourceExclude "geometry")
        .flatMap { response =>
          response.totalHits match {
            case 0 => Future(Region(regionType, regionId, "[Unknown]", None))
            case _ => Future(response.as[Region].head)
          }
        }
    }
  }
}

object ElasticSearchQueryer {
  def apply(implicit config: Config, system: ActorSystem, ec: ExecutionContext, materializer: Materializer, clientProvider: ClientProvider) = new ElasticSearchQueryer()
}