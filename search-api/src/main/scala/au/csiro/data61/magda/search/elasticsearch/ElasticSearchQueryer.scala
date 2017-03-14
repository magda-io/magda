package au.csiro.data61.magda.search.elasticsearch

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext
import scala.concurrent.Future

import org.elasticsearch.search.aggregations.Aggregation
import org.elasticsearch.search.aggregations.bucket.filter.InternalFilter
import org.elasticsearch.search.sort.SortOrder

import com.sksamuel.elastic4s._
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.searches.RichSearchResponse
import com.sksamuel.elastic4s.searches.SearchDefinition
import com.sksamuel.elastic4s.searches.aggs.AggregationDefinition
import com.sksamuel.elastic4s.searches.aggs.FilterAggregationDefinition
import com.sksamuel.elastic4s.searches.queries.QueryDefinition
import com.sksamuel.elastic4s.searches.queries.QueryStringQueryDefinition
import com.typesafe.config.Config

import akka.actor.ActorSystem
import akka.stream.Materializer
import au.csiro.data61.magda.api.FilterValue
import au.csiro.data61.magda.api.Query
import au.csiro.data61.magda.api.Specified
import au.csiro.data61.magda.api.Unspecified
import au.csiro.data61.magda.api.model.RegionSearchResult
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.search.SearchStrategy._
import au.csiro.data61.magda.search.SearchQueryer
import au.csiro.data61.magda.search.SearchStrategy
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import au.csiro.data61.magda.search.elasticsearch.FacetDefinition.facetDefForType
import au.csiro.data61.magda.search.elasticsearch.Queries._
import au.csiro.data61.magda.util.ErrorHandling.RootCause
import au.csiro.data61.magda.util.SetExtractor
import org.elasticsearch.search.aggregations.support.AggregationPath.PathElement
import scala.collection.JavaConversions._
import org.elasticsearch.search.aggregations.InternalAggregation
import com.sksamuel.elastic4s.searches.queries.SimpleStringQueryDefinition
import com.sksamuel.elastic4s.analyzers.CustomAnalyzerDefinition

class ElasticSearchQueryer(indices: Indices = DefaultIndices)(
    implicit val config: Config,
    implicit val system: ActorSystem,
    implicit val ec: ExecutionContext,
    implicit val materializer: Materializer,
    implicit val clientProvider: ClientProvider) extends SearchQueryer {
  private val logger = system.log

  lazy val clientFuture: Future[TcpClient] = clientProvider.getClient(system.scheduler, logger, ec)

  val ESCAPE_REGEX = "([\\+\\-=!\\(\\)\\{\\}\\[\\]\\^\"~\\?:/\\\\]|&&|\\|\\|)".r
  val REMOVE_REGEX = "(?i)((^|\\s)(AND|OR)(\\s|$)|[<>])".r
  val ESCAPE_AGG_NAME_REGEX = "[\\[\\]\\.]".r

  val DATASETS_LANGUAGE_FIELDS = Seq("title", "description", "publisher.name", "distributions.title", "distributions.description", "keyword", "theme")
  val ASPECT_LANGUAGE_FIELDS = Seq("value")

  override def search(inputQuery: Query, start: Long, limit: Int, requestedFacetSize: Int) = {
    val inputRegionsList = inputQuery.regions.toList

    clientFuture.flatMap { implicit client =>
      val fullRegionsFutures = inputRegionsList.map(resolveFullRegion)
      val fullRegionsFuture = Future.sequence(fullRegionsFutures)

      Future.sequence(Seq(fullRegionsFuture, client.execute(buildQueryWithAggregations(inputQuery, start, limit, MatchAll, requestedFacetSize)).flatMap(response =>
        if (response.totalHits > 0)
          Future.successful((response, MatchAll))
        else
          client.execute(buildQueryWithAggregations(inputQuery, start, limit, MatchPart, requestedFacetSize)).map((_, MatchPart)))
      ))
    } map {
      case Seq(fullRegions: List[Option[Region]], (response: RichSearchResponse, strategy: SearchStrategy)) =>
        val newQueryRegions =
          inputRegionsList
            .zip(fullRegions)
            .filter(_._2.isDefined)
            .map(_._2.get)
            .map(Specified.apply).toSet ++ inputQuery.regions.filter(_.isEmpty)

        val outputQuery = inputQuery.copy(regions = newQueryRegions)

        buildSearchResult(outputQuery, response, strategy, requestedFacetSize)
    } recover {
      case RootCause(illegalArgument: IllegalArgumentException) =>
        logger.error(illegalArgument, "Exception when searching")
        failureSearchResult(inputQuery, "Bad argument: " + illegalArgument.getMessage)
      case e: Throwable =>
        logger.error(e, "Exception when searching")
        failureSearchResult(inputQuery, "Unknown error")
    }
  }

  /**
   * Calculate the ideal facet size for this query - we have to take the facet exact match queries into account because
   * if we always passed through the requested facetSize, we might end up in a situation where requested facet size
   * was 1 but the query had 3 exact match queries for publishers in it - we'd only know the hitCount for the first
   * exact match because we only asked for 1 facet from ES.
   */
  private def idealFacetSize(facetType: FacetType, query: Query, requestedFacetSize: Int) = {
    val queryFacetSize = FacetDefinition.facetDefForType(facetType).exactMatchQueries(query).size

    Math.max(queryFacetSize, requestedFacetSize)
  }

  /**
   * Turns an ES response into a magda SearchResult.
   */
  def buildSearchResult(query: Query, response: RichSearchResponse, strategy: SearchStrategy, facetSize: Int): SearchResult = {
    val aggsMap = response.aggregations.map
    new SearchResult(
      strategy = Some(strategy),
      query = query,
      hitCount = response.getHits.totalHits().toInt,
      dataSets = response.to[DataSet].map(_.copy(years = None)).toList,
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
                .map(_.copy(matched = true))

            // filteredExact aggregations are those that exactly match a filter (e.g. "Ballarat Council" exactly) but are also filtered by
            // the rest of the query - we use this to filter the exact options below and make sure we don't show 0 results for a filtered
            // aggregation that does actually have results.
            val filteredExact = definition.exactMatchQueries(query)
              .map {
                case (name, query) => (
                  name,
                  aggsMap(facetType.id + "-exact-" + name + "-filter")
                )
              }
              .map {
                case (name, agg: InternalFilter) => name -> agg.getDocCount
              }
              .toMap

            // Exact options are for when a user types a correct facet name exactly but we have no hits for it, so we still want to
            // display it to them to show them that it does *exist* but not for this query
            val exactOptions =
              definition.exactMatchQueries(query)
                .map {
                  case (name, query) =>
                    val value = facetType.id + "-exact-" + name
                    val aggProp = List(value).asJava
                    (
                      name,
                      aggsMap(facetType.id + "-global").asInstanceOf[InternalAggregation].getProperty(aggProp)
                    )
                }
                .flatMap {
                  case (name, agg: InternalFilter) =>
                    if (agg.getDocCount > 0 && filteredExact.get(name).getOrElse(0l) == 0l) {
                      Some(FacetOption(name.getOrElse(config.getString("strings.unspecifiedWord")), 0, matched = true))
                    } else None
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
    ElasticDsl.search(indices.getIndex(config, Indices.DataSetsIndex) / indices.getType(Indices.DataSetsIndexType))
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
    val aggregations: List[AggregationDefinition] =
      FacetType.all.flatMap(facetType =>
        aggsForFacetType(query, facetType, strategy, idealFacetSize(facetType, query, facetSize))).toList

    searchDef.aggregations(aggregations)
  }

  /** Gets all applicable ES aggregations for the passed FacetType, given a Query */
  def aggsForFacetType(query: Query, facetType: FacetType, strategy: SearchStrategy, facetSize: Int): List[AggregationDefinition] = {
    val facetDef = facetDefForType(facetType)

    // Sub-aggregations of "global" aggregate on all datasets independently of the query passed in.
    val globalAgg =
      aggregation
        .global(facetType.id + "-global")
        .aggs(alternativesAggregation(query, facetDef, strategy, facetSize) :: exactMatchAggregations(query, facetType, facetDef, strategy))
        .asInstanceOf[AggregationDefinition]

    val partialMatchesAggs =
      if (facetDef.isRelevantToQuery(query))
        exactMatchAggregations(query, facetType, facetDef, strategy, "-filter") :+
          // If there's details in the query that relate to this facet
          // then create an aggregation that shows all results for this facet that partially match the details
          // in the query... this is useful if say the user types in "Ballarat", we can suggest "Ballarat Council"
          aggregation
          .filter(facetType.id + "-filter")
          .filter(facetDef.filterAggregationQuery(query))
          .aggs(facetDef.aggregationDefinition(facetSize))
          .asInstanceOf[AggregationDefinition]
      else
        List()

    partialMatchesAggs :+ globalAgg
  }

  /**
   * The exact match aggs are for situations where the user puts in a free text facet - we want
   * to see whether that exists in the system at all even if it has no hits with their current
   * query, in order to more helpfully correct their search if they mispelled etc.
   */
  def exactMatchAggregations(query: Query, facetType: FacetType, facetDef: FacetDefinition, strategy: SearchStrategy, suffix: String = ""): List[FilterAggregationDefinition] =
    facetDef.exactMatchQueries(query).map {
      case (name, query) =>
        aggregation.filter(facetType.id + "-exact-" + name + suffix).filter(query)
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
    val processedQuote = query.quotes.map(cleanStringForEs).map(quote => s""""${quote}"""") match {
      case SetExtractor() => None
      case xs             => Some(xs.reduce(_ + " " + _))
    }

    val stringQuery: Option[String] = {
      (query.freeText.map(cleanStringForEs), processedQuote) match {
        case (None, None)                   => None
        case (None, some)                   => some
        case (some, None)                   => some
        case (Some(freeText), Some(quotes)) => Some(freeText + " " + quotes)
      }
    }

    val operator = strategy match {
      case MatchAll  => "and"
      case MatchPart => "or"
    }

    val clauses: Seq[Traversable[QueryDefinition]] = Seq(
      stringQuery.map { innerQuery =>
        val queryDef = new SimpleStringQueryDefinition(innerQuery)
          .defaultOperator(operator)
          .quoteFieldSuffix(".quote")
          .analyzeWildcard(true)

        ("_all" +: DATASETS_LANGUAGE_FIELDS).foldRight(queryDef) { (field, queryDef) =>
          queryDef.field(field)
        }
      },
      setToOption(query.publishers)(seq => should(seq.map(publisherQuery(strategy)))),
      setToOption(query.formats)(seq => should(seq.map(formatQuery))),
      dateQueries(query.dateFrom, query.dateTo),
      setToOption(query.regions)(seq => should(seq.map(region => regionIdQuery(region, indices))))
    )

    strategy(clauses.flatten)
  }

  def cleanStringForEs(string: String): String = {
    val cleaned = REMOVE_REGEX.replaceAllIn(ESCAPE_REGEX.replaceAllIn(string, charMatch => s"\\\\\\${charMatch.matched}"), " ")

    if (cleaned.replace("\\", "").equals(string.replace("\\", ""))) {
      cleaned
    } else {
      cleanStringForEs(cleaned)
    }
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
                aggregation.filter(name).filter(facetDef.exactMatchQuery(Specified(name))))

              // Do a datasets query WITHOUT filtering for this facet and  with an aggregation for each of the hits we
              // got back on our keyword - this allows us to get an accurate count of dataset hits for each result
              client.execute {
                buildQuery(facetDef.removeFromQuery(generalQuery), 0, 0, MatchAll).aggs(filters)
              } map { aggQueryResult =>
                val aggregations = aggQueryResult.aggregations.map
                  .mapValues {
                    case bucket: InternalFilter => new FacetOption(
                      value = bucket.getName,
                      hitCount = bucket.getDocCount
                    )
                  }

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
        ElasticDsl.search(indices.getIndex(config, Indices.RegionsIndex) / indices.getType(Indices.RegionsIndexType))
          query { matchPhrasePrefixQuery("regionName", query) }
          start start.toInt
          limit limit
          sortBy (
            fieldSort("order") order SortOrder.ASC,
            scoreSort order SortOrder.DESC
          )
            sourceExclude "geometry"
      ).flatMap { response =>
          response.totalHits match {
            case 0 => Future(RegionSearchResult(query, 0, List())) // If there's no hits, no need to do anything more
            case _ => Future(RegionSearchResult(query, response.totalHits, response.to[Region].toList))
          }
        }
    }
  }

  def resolveFullRegion(queryRegionFV: FilterValue[Region])(implicit client: TcpClient): Future[Option[Region]] = {
    queryRegionFV match {
      case Specified(region) =>
        client.execute(ElasticDsl.search(indices.getIndex(config, Indices.RegionsIndex) / indices.getType(Indices.RegionsIndexType))
          query { idsQuery((region.queryRegion.regionType + "/" + region.queryRegion.regionId).toLowerCase) } start 0 limit 1 sourceExclude "geometry")
          .flatMap { response =>
            response.totalHits match {
              case 0 => Future(None)
              case _ => Future(response.to[Region].headOption)
            }
          }
      case Unspecified() => Future(None)
    }

  }
}

object ElasticSearchQueryer {
  def apply(implicit config: Config, system: ActorSystem, ec: ExecutionContext, materializer: Materializer, clientProvider: ClientProvider) = new ElasticSearchQueryer()
}