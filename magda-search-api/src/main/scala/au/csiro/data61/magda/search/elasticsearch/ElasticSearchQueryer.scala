package au.csiro.data61.magda.search.elasticsearch

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext
import scala.concurrent.Future
import org.elasticsearch.search.aggregations.Aggregation
import com.sksamuel.elastic4s.searches.aggs.AggregationApi
import org.elasticsearch.search.aggregations.bucket.filter.InternalFilter
import com.sksamuel.elastic4s.searches.sort.SortOrder
import com.sksamuel.elastic4s._
import com.sksamuel.elastic4s.http.ElasticDsl
import com.sksamuel.elastic4s.http.ElasticDsl._
import com.sksamuel.elastic4s.searches.SearchDefinition
import com.sksamuel.elastic4s.searches.aggs.AggregationDefinition
import com.sksamuel.elastic4s.searches.aggs.FilterAggregationDefinition
import com.sksamuel.elastic4s.searches.queries.{
  InnerHitDefinition,
  QueryDefinition,
  QueryStringQueryDefinition,
  SimpleStringQueryDefinition
}
import com.typesafe.config.Config
import spray.json._
import akka.actor.ActorSystem
import akka.stream.Materializer
import au.csiro.data61.magda.api.FilterValue
import au.csiro.data61.magda.api.Query
import au.csiro.data61.magda.api.Specified
import au.csiro.data61.magda.api.Unspecified
import au.csiro.data61.magda.api.model.{
  OrganisationsSearchResult,
  RegionSearchResult,
  SearchResult
}
import au.csiro.data61.magda.model.Temporal.{ ApiDate, PeriodOfTime }
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
import com.sksamuel.elastic4s.analyzers.CustomAnalyzerDefinition
import com.sksamuel.elastic4s.searches.ScoreMode
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.Instant

import com.sksamuel.elastic4s.searches.collapse.CollapseDefinition
import au.csiro.data61.magda.model.Temporal
import au.csiro.data61.magda.search.elasticsearch.Exceptions.ESGenericException
import com.sksamuel.elastic4s.http.HttpClient
import au.csiro.data61.magda.search.elasticsearch.Exceptions.IllegalArgumentException
import com.sksamuel.elastic4s.http.search.{
  Aggregations,
  FilterAggregationResult,
  SearchResponse
}

class ElasticSearchQueryer(indices: Indices = DefaultIndices)(
  implicit
  val config: Config,
  implicit val system: ActorSystem,
  implicit val ec: ExecutionContext,
  implicit val materializer: Materializer,
  implicit val clientProvider: ClientProvider)
  extends SearchQueryer {
  private val logger = system.log

  val clientFuture: Future[HttpClient] = clientProvider.getClient.recover {
    case t: Throwable =>
      logger.error(
        t,
        "Could not connect to elasticsearch - this is a fatal error, so I'm dying now.")
      System.exit(1)
      throw t
  }

  val DATASETS_LANGUAGE_FIELDS = Seq(
    ("title", 50f),
    ("description", 2f),
    "publisher.name",
    ("keywords", 10f),
    "themes")
  val NON_LANGUAGE_FIELDS = Seq(
    "_id",
    "catalog",
    "accrualPeriodicity",
    "contactPoint.name",
    "publisher.acronym")

  override def search(
    inputQuery: Query,
    start: Long,
    limit: Int,
    requestedFacetSize: Int) = {
    val inputRegionsList = inputQuery.regions.toList

    clientFuture.flatMap { implicit client =>
      val fullRegionsFutures = inputRegionsList.map(resolveFullRegion)
      val fullRegionsFuture = Future.sequence(fullRegionsFutures)
      val query = buildQueryWithAggregations(
        inputQuery,
        start,
        limit,
        MatchAll,
        requestedFacetSize)

      Future.sequence(
        Seq(
          fullRegionsFuture,
          client.execute(query).flatMap {
            case Right(results) =>
              if (results.result.totalHits > 0)
                Future.successful((results.result, MatchAll))
              else
                client
                  .execute(
                    buildQueryWithAggregations(
                      inputQuery,
                      start,
                      limit,
                      MatchPart,
                      requestedFacetSize))
                  .map {
                    case Right(results) => (results.result, MatchPart)
                    case Left(IllegalArgumentException(e)) => throw e
                    case Left(ESGenericException(e)) => throw e
                  }
            case Left(IllegalArgumentException(e)) => throw e
            case Left(ESGenericException(e)) => throw e
          }))
    } map {
      case Seq(fullRegions: List[Option[Region]],
        (response: SearchResponse, strategy: SearchStrategy)) =>
        val newQueryRegions =
          inputRegionsList
            .zip(fullRegions)
            .filter(_._2.isDefined)
            .map(_._2.get)
            .map(Specified.apply)
            .toSet ++ inputQuery.regions.filter(_.isEmpty)

        val outputQuery = inputQuery.copy(regions = newQueryRegions)

        buildSearchResult(outputQuery, response, strategy, requestedFacetSize)
    } recover {
      case RootCause(illegalArgument: IllegalArgumentException) =>
        logger.error(illegalArgument, "Exception when searching")
        failureSearchResult(
          inputQuery,
          "Bad argument: " + illegalArgument.getMessage)
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
  private def idealFacetSize(
    facetType: FacetType,
    query: Query,
    requestedFacetSize: Int) = {
    val queryFacetSize =
      FacetDefinition.facetDefForType(facetType).exactMatchQueries(query).size

    Math.max(queryFacetSize, requestedFacetSize)
  }

  /**
   * Turns an ES response into a magda SearchResult.
   */
  def buildSearchResult(
    query: Query,
    response: SearchResponse,
    strategy: SearchStrategy,
    facetSize: Int): SearchResult = {
    val aggs = response.aggregations

    def getDateAggResult(
      agg: Option[Map[String, Any]]): Option[Temporal.ApiDate] = agg match {
      case None => None
      case Some(aggData) =>
        val minDateEpoch =
          aggData.get("value").filter(_ != null).map(_.toString.toDouble.toLong)
        if (minDateEpoch.isEmpty ||
          aggData.get("value_as_string").isEmpty ||
          minDateEpoch.exists(_ == Long.MinValue) ||
          minDateEpoch.exists(_ == Long.MaxValue) ||
          minDateEpoch.exists(_ == NullFieldValue)) {
          None
        } else {
          Some(
            ApiDate(
              Some(OffsetDateTime.parse(agg.get("value_as_string").toString)),
              ""))
        }
    }

    new SearchResult(
      strategy = Some(strategy),
      query = query,
      hitCount = response.totalHits,
      dataSets = response.to[DataSet].map(_.copy(years = None)).toList,
      temporal = Some(
        PeriodOfTime(
          start = getDateAggResult(
            aggs.data.get("minDate").asInstanceOf[Option[Map[String, Any]]]), //        end = ApiDate.parse(aggs.getAs[InternalAggregation]("maxDate").getProperty("value").toString, None, false))
          end = getDateAggResult(
            aggs.data.get("maxDate").asInstanceOf[Option[Map[String, Any]]]))),
      facets = Some(FacetType.all.map { facetType =>
        val definition = facetDefForType(facetType)

        new Facet(
          id = facetType.id,
          options = {
            // Filtered options are the ones that partly match the user's input... e.g. "Ballarat Council" for input "Ballarat"
            val filteredOptions =
              (aggs.contains(facetType.id + "-filter") match {
                case true =>
                  definition.extractFacetOptions(
                    aggs
                      .filter(facetType.id + "-filter")
                      .getAgg(facetType.id))
                case false => Nil
              }).filter(definition.isFilterOptionRelevant(query))
                .map(_.copy(matched = true))

            // filteredExact aggregations are those that exactly match a filter (e.g. "Ballarat Council" exactly) but are also filtered by
            // the rest of the query - we use this to filter the exact options below and make sure we don't show 0 results for a filtered
            // aggregation that does actually have results.
            val filteredExact = definition
              .exactMatchQueries(query)
              .map {
                case (name, query) =>
                  (
                    name,
                    aggs.filter(facetType.id + "-exact-" + name + "-filter"))
              }
              .map {
                case (name, agg: FilterAggregationResult) => name -> agg
              }
              .toMap

            // Exact options are for when a user types a correct facet name exactly but we have no hits for it, so we still want to
            // display it to them to show them that it does *exist* but not for this query
            val exactOptions =
              definition
                .exactMatchQueries(query)
                .map {
                  case (name, query) =>
                    val value = facetType.id + "-exact-" + name
                    (name, aggs.global(facetType.id + "-global").filter(value))
                }
                .flatMap {
                  case (name, agg) =>
                    if (agg.docCount > 0 && filteredExact
                      .get(name)
                      .map(_.docCount)
                      .getOrElse(0l) == 0l) {
                      Some(FacetOption(
                        identifier =
                          if (!agg.contains("topHits")) None
                          else {
                            agg
                              .tophits("topHits")
                              .hits
                              .headOption
                              .flatMap(
                                _.to[DataSet].publisher.flatMap(_.identifier))
                          },
                        value = name.getOrElse(
                          config.getString("strings.unspecifiedWord")),
                        hitCount = 0,
                        matched = true))
                    } else None
                }
                .toSeq

            val alternativeOptions =
              definition.extractFacetOptions(
                aggs
                  .getAgg(facetType.id + "-global")
                  .flatMap(_.getAgg("filter").flatMap(_.getAgg(facetType.id))))
            definition.truncateFacets(
              query,
              filteredOptions,
              exactOptions,
              alternativeOptions,
              facetSize)
          })
      }.toSeq))
  }

  /** Converts from a general search strategy to the actual elastic4s method that will combine a number of queries using that strategy.*/
  def strategyToCombiner(
    strat: SearchStrategy): Iterable[QueryDefinition] => QueryDefinition =
    strat match {
      case MatchAll => must
      //    case MatchPart => x => dismax(x).tieBreaker(0.3)
      case MatchPart =>
        x =>
          should(x).minimumShouldMatch("-49%")
    }

  /** Builds an elastic search query out of the passed general magda Query */
  def buildQuery(
    query: Query,
    start: Long,
    limit: Int,
    strategy: SearchStrategy) = {
    ElasticDsl
      .search(indices.getIndex(config, Indices.DataSetsIndex))
      .limit(limit)
      .start(start.toInt)
      .query(buildEsQuery(query, strategy))
  }

  /** Same as {@link #buildQuery} but also adds aggregations */
  def buildQueryWithAggregations(
    query: Query,
    start: Long,
    limit: Int,
    strategy: SearchStrategy,
    facetSize: Int) =
    addAggregations(
      buildQuery(query, start, limit, strategy),
      query,
      strategy,
      facetSize)

  /** Builds an empty dummy searchresult that conveys some kind of error message to the user. */
  def failureSearchResult(query: Query, message: String) =
    new SearchResult(
      query = query,
      hitCount = 0,
      dataSets = Nil,
      errorMessage = Some(message))

  /** Adds standard aggregations to an elasticsearch query */
  def addAggregations(
    searchDef: SearchDefinition,
    query: Query,
    strategy: SearchStrategy,
    facetSize: Int) = {
    val facetAggregations: List[AggregationDefinition] =
      FacetType.all
        .flatMap(
          facetType =>
            aggsForFacetType(
              query,
              facetType,
              strategy,
              idealFacetSize(facetType, query, facetSize)))
        .toList

    val minDateAgg = minAggregation("minDate").field("temporal.start.date")
    val maxDateAgg = maxAggregation("maxDate").field("temporal.end.date")

    searchDef.aggregations(facetAggregations ++ List(minDateAgg, maxDateAgg))
  }

  /** Gets all applicable ES aggregations for the passed FacetType, given a Query */
  def aggsForFacetType(
    query: Query,
    facetType: FacetType,
    strategy: SearchStrategy,
    facetSize: Int): List[AggregationDefinition] = {
    val facetDef = facetDefForType(facetType)

    // Sub-aggregations of "global" aggregate on all datasets independently of the query passed in.
    val globalAgg =
      globalAggregation(facetType.id + "-global")
        .subAggregations(alternativesAggregation(
          query,
          facetDef,
          strategy,
          facetSize) :: exactMatchAggregations(
          query,
          facetType,
          facetDef,
          strategy))
        .asInstanceOf[AggregationDefinition]

    val partialMatchesAggs =
      if (facetDef.isRelevantToQuery(query))
        exactMatchAggregations(query, facetType, facetDef, strategy, "-filter") :+
          // If there's details in the query that relate to this facet
          // then create an aggregation that shows all results for this facet that partially match the details
          // in the query... this is useful if say the user types in "Ballarat", we can suggest "Ballarat Council"
          filterAggregation(facetType.id + "-filter")
          .query(facetDef.filterAggregationQuery(query))
          .subAggregations(facetDef.aggregationDefinition(facetSize))
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
  def exactMatchAggregations(
    query: Query,
    facetType: FacetType,
    facetDef: FacetDefinition,
    strategy: SearchStrategy,
    suffix: String = ""): List[FilterAggregationDefinition] =
    facetDef
      .exactMatchQueries(query)
      .map {
        case (name, query) =>
          filterAggregation(facetType.id + "-exact-" + name + suffix)
            .query(query)
            .subAggregations(topHitsAggregation("topHits")
              .size(1)
              .sortBy(fieldSort("identifier")))
      }
      .toList

  /**
   * The alternatives aggregation shows what other choices are available if the user wasn't
   * filtering on this facet - e.g. if I was searching for datasets from a certain publisher,
   * this shows me other publishers I could search on instead
   */
  def alternativesAggregation(
    query: Query,
    facetDef: FacetDefinition,
    strategy: SearchStrategy,
    facetSize: Int) =
    filterAggregation("filter")
      .query(queryToQueryDef(facetDef.removeFromQuery(query), strategy, true))
      .subAggregations(facetDef.aggregationDefinition(facetSize))

  /**
   * Accepts a seq - if the seq is not empty, runs the passed fn over it and returns the result as Some, otherwise returns None.
   */
  private def setToOption[X, Y](seq: Set[X])(fn: Set[X] => Y): Option[Y] =
    seq match {
      case SetExtractor() => None
      case x => Some(fn(x))
    }
  private def buildEsQuery(
    query: Query,
    strategy: SearchStrategy): QueryDefinition = {
    functionScoreQuery()
      .query(queryToQueryDef(query, strategy))
      .scorers(fieldFactorScore("quality").missing(0))
  }

  /** Processes a general magda Query into a specific ES QueryDefinition */
  private def queryToQueryDef(
    query: Query,
    strategy: SearchStrategy,
    isForAggregation: Boolean = false): QueryDefinition = {
    val operator = strategy match {
      case MatchAll => "and"
      case MatchPart => "or"
    }

    val clauses: Seq[Traversable[QueryDefinition]] = Seq(
      query.freeText flatMap { inputText =>
        val text = if (inputText.trim.length == 0) "*" else inputText
        val queryString = new SimpleStringQueryDefinition(text)
          .defaultOperator(operator)
          .quoteFieldSuffix(".quote")

        def foldFields(query: SimpleStringQueryDefinition, fields: Seq[Any]) =
          fields.foldRight(query) {
            case ((fieldName: String, boost: Float), queryDef) =>
              queryDef.field(fieldName, boost)
            case (field: String, queryDef) => queryDef.field(field, 0)
          }

        // Surprise! english analysis doesn't work on nested objects unless you have a nested query, even though
        // other analysis does. So we do this silliness
        val distributionsEnglishQueries = nestedQuery("distributions")
          .query(
            // If this was AND then a single distribution would have to match the entire query, this way you can
            // have multiple dists partially match
            queryString
              .field("distributions.title")
              .field("distributions.description")
              .field("distributions.format.keyword_lowercase")
              .defaultOperator("or"))
          .scoreMode(ScoreMode.Max)

        val queries =
          Seq(
            foldFields(
            queryString,
            NON_LANGUAGE_FIELDS ++ DATASETS_LANGUAGE_FIELDS),
            distributionsEnglishQueries)

        Some(dismax(queries).tieBreaker(0.2))
      },
      setToOption(query.publishers)(seq =>
        should(seq.map(publisherQuery(strategy))).boost(2)),
      setToOption(query.formats)(seq =>
        should(seq.map(formatQuery(strategy))).boost(2)),
      dateQueries(query.dateFrom, query.dateTo).map(_.boost(2)),
      setToOption(query.regions)(seq =>
        should(seq.map(region => regionIdQuery(region, indices))).boost(2)))

    strategyToCombiner(strategy)(clauses.flatten)
  }

  override def searchFacets(
    facetType: FacetType,
    facetQuery: Option[String],
    generalQuery: Query,
    start: Int,
    limit: Int): Future[FacetSearchResult] = {
    val facetDef = facetDefForType(facetType)

    clientFuture.flatMap { client =>
      // First do a normal query search on the type we created for values in this facet
      client
        .execute(
          ElasticDsl
            .search(indices.indexForFacet(facetType))
            .query(dismax(
              Seq(
                matchPhrasePrefixQuery("value", facetQuery.getOrElse("")),
                matchPhrasePrefixQuery("acronym", facetQuery.getOrElse(""))))
              .tieBreaker(0))
            .limit(limit))
        .flatMap {
          case Left(ESGenericException(e)) => throw e
          case Right(results) =>
            results.result.totalHits match {
              case 0 =>
                Future(FacetSearchResult(0, Nil)) // If there's no hits, no need to do anything more
              case _ =>
                val hits: Seq[(String, Option[String])] =
                  results.result.hits.hits.map { hit =>
                    val map = hit.sourceAsMap
                    (
                      map("value").toString,
                      map.get("identifier").map(_.toString))
                  }

                // Create a dataset filter aggregation for each hit in the initial query
                val filters = hits.map {
                  case (name, identifier) =>
                    filterAggregation(name).query(
                      facetDef.exactMatchQuery(Specified(name)))
                }

                // Do a datasets query WITHOUT filtering for this facet and  with an aggregation for each of the hits we
                // got back on our keyword - this allows us to get an accurate count of dataset hits for each result
                client.execute {
                  buildQuery(
                    facetDef.removeFromQuery(generalQuery),
                    0,
                    0,
                    MatchAll).aggs(filters)
                } map {
                  case Left(ESGenericException(e)) => throw e
                  case Right(results) =>
                    val aggregations = results.result.aggregations.data.map {
                      case (name: String, value: Map[String, Any]) =>
                        (name,
                          new FacetOption(
                            identifier = None,
                            value = name,
                            hitCount = value
                              .get("doc_count")
                              .map(_.toString.toLong)
                              .getOrElse(0l)))
                    }

                    val options = (hits
                      .map {
                        case (hitName, identifier) =>
                          aggregations(hitName).copy(identifier = identifier)
                      })
                      .sortBy(-_.hitCount)
                      .drop(start)
                      .take(limit)

                    FacetSearchResult(
                      hitCount = results.result.totalHits,
                      options = options)
                }
            }
        }
    }
  }

  override def searchRegions(
    query: Option[String],
    start: Long,
    limit: Int): Future[RegionSearchResult] = {
    clientFuture.flatMap { client =>
      client
        .execute(
          ElasticDsl.search(indices.getIndex(config, Indices.RegionsIndex))
            query {
              boolQuery().should(
                matchPhrasePrefixQuery(
                "regionShortName",
                query.getOrElse("*")).boost(2),
                matchPhrasePrefixQuery(
                  "regionName",
                  query.getOrElse("*")))
            }
            start start.toInt
            limit limit
            sortBy (fieldSort("order") order SortOrder.ASC,
              scoreSort order SortOrder.DESC)
              sourceExclude "geometry")
        .flatMap {
          case Left(ESGenericException(e)) => throw e
          case Right(results) =>
            results.result.totalHits match {
              case 0 =>
                Future(RegionSearchResult(query, 0, List())) // If there's no hits, no need to do anything more
              case _ =>
                Future(
                  RegionSearchResult(
                    query,
                    results.result.totalHits,
                    results.result.to[Region].toList))
            }
        }
    }
  }

  override def searchOrganisations(
    queryString: Option[String],
    start: Int,
    limit: Int): Future[OrganisationsSearchResult] = {

    clientFuture.flatMap { client =>
      val queryStringContent = queryString.getOrElse("*").trim
      val query = ElasticDsl
        .search(indices.getIndex(config, Indices.DataSetsIndex))
        .start(start)
        .limit(limit)
        .query {
          simpleStringQuery(queryStringContent)
            .field("publisher.name^20")
            .field("publisher.acronym^20")
            .field("publisher.description")
            .field("publisher.addrStreet")
            .field("publisher.addrSuburb")
            .field("publisher.addrState")
        }
        .aggs(cardinalityAgg("totalCount", "publisher.identifier"))
        .collapse(new CollapseDefinition(
          "publisher.identifier",
          Some(new InnerHitDefinition("datasetCount", Some(1)))))
      client
        .execute(
          if (queryStringContent == "*") {
            query.sortByFieldAsc("publisher.name.keyword")
          } else {
            query
          })
        .flatMap {
          case Right(r) =>
            val orgs = r.result.hits.hits
              .flatMap(h => {
                val d = h.to[DataSet]
                val innerHit = h.innerHits.get("datasetCount")
                d.publisher.map(o =>
                  o.copy(datasetCount = innerHit.map(h => {
                    h.total
                  })))
              })
              .toList

            val totalCount =
              r.result.aggregations.cardinality("totalCount").value
            Future(
              OrganisationsSearchResult(queryString, totalCount.toLong, orgs))
          case Left(ESGenericException(e)) => throw e
        }
        .recover {
          case RootCause(illegalArgument: IllegalArgumentException) =>
            logger.error(illegalArgument, "Exception when searching")
            OrganisationsSearchResult(
              queryString,
              0,
              List(),
              Some("Bad argument: " + illegalArgument.getMessage))
          case e: Throwable =>
            logger.error(e, "Exception when searching")
            OrganisationsSearchResult(
              queryString,
              0,
              List(),
              Some("Error: " + e.getMessage))
        }
    }

  }

  def resolveFullRegion(queryRegionFV: FilterValue[Region])(
    implicit
    client: HttpClient): Future[Option[Region]] = {
    queryRegionFV match {
      case Specified(region) =>
        client
          .execute(
            ElasticDsl.search(indices.getIndex(config, Indices.RegionsIndex))
              query {
                idsQuery(
                  (region.queryRegion.regionType + "/" + region.queryRegion.regionId).toLowerCase)
              } start 0 limit 1 sourceExclude "geometry")
          .flatMap {
            case Left(ESGenericException(e)) => throw e
            case Right(results) =>
              results.result.totalHits match {
                case 0 => Future(None)
                case _ => Future(results.result.to[Region].headOption)
              }
          }
      case Unspecified() => Future(None)
    }

  }
}

object ElasticSearchQueryer {
  def apply(implicit
    config: Config,
    system: ActorSystem,
    ec: ExecutionContext,
    materializer: Materializer,
    clientProvider: ClientProvider) = new ElasticSearchQueryer()
}
