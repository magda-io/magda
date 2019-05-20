package au.csiro.data61.magda.search.elasticsearch

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext
import scala.concurrent.Future
import com.sksamuel.elastic4s.searches.sort.SortOrder
import com.sksamuel.elastic4s._
import com.sksamuel.elastic4s.http.{ElasticClient, ElasticDsl, RequestSuccess}
import com.sksamuel.elastic4s.http.ElasticDsl._
import com.sksamuel.elastic4s.searches.SearchRequest
import com.sksamuel.elastic4s.searches.aggs.{Aggregation => AggregationDefinition}
import com.sksamuel.elastic4s.searches.aggs.{FilterAggregation => FilterAggregationDefinition}
import com.sksamuel.elastic4s.searches.queries.{BoolQuery, CommonTermsQuery, InnerHit => InnerHitDefinition, Query => QueryDefinition, QueryStringQuery => QueryStringQueryDefinition, SimpleStringQuery => SimpleStringQueryDefinition}
import com.typesafe.config.Config
import spray.json._
import akka.actor.ActorSystem
import akka.stream.Materializer
import au.csiro.data61.magda.api.FilterValue
import au.csiro.data61.magda.api.Query
import au.csiro.data61.magda.api.Specified
import au.csiro.data61.magda.api.Unspecified
import au.csiro.data61.magda.api.model.{OrganisationsSearchResult, RegionSearchResult, SearchResult}
import au.csiro.data61.magda.model.Temporal.{ApiDate, PeriodOfTime}
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

import au.csiro.data61.magda.model.Registry.MAGDA_ADMIN_PORTAL_ID
import com.sksamuel.elastic4s.searches.collapse.CollapseRequest
import au.csiro.data61.magda.model.Temporal
import au.csiro.data61.magda.search.elasticsearch.Exceptions.ESGenericException
import au.csiro.data61.magda.search.elasticsearch.Exceptions.IllegalArgumentException
import com.sksamuel.elastic4s.http.search.{Aggregations, FilterAggregationResult, SearchResponse}
import com.sksamuel.elastic4s.searches.queries.funcscorer.{ScoreFunction => ScoreFunctionDefinition}
import com.sksamuel.elastic4s.searches.queries.term.TermQuery

class ElasticSearchQueryer(indices: Indices = DefaultIndices)(
  implicit
  val config: Config,
  implicit val system: ActorSystem,
  implicit val ec: ExecutionContext,
  implicit val materializer: Materializer,
  implicit val clientProvider: ClientProvider)
  extends SearchQueryer {
  private val logger = system.log

  val clientFuture: Future[ElasticClient] = clientProvider.getClient.recover {
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
    "contactPoint.identifier",
    "publisher.acronym")

  override def search(
    inputQuery: Query,
    start: Long,
    limit: Int,
    requestedFacetSize: Int,
    tenantId: String) = {
    val inputRegionsList = inputQuery.regions.toList

    clientFuture.flatMap { implicit client =>
      val fullRegionsFutures = inputRegionsList.map(resolveFullRegion)
      val fullRegionsFuture = Future.sequence(fullRegionsFutures)
      augmentWithBoostRegions(inputQuery).flatMap { queryWithBoostRegions =>
        val query: SearchRequest = buildQueryWithAggregations(tenantId, queryWithBoostRegions, start, limit, MatchAll, requestedFacetSize)
        Future.sequence(Seq(fullRegionsFuture, client.execute(query).flatMap {
          case results: RequestSuccess[SearchResponse] => Future.successful((results.result, MatchAll))
          case IllegalArgumentException(e) => throw e
          case ESGenericException(e) => throw e
        })).map {
          case Seq(fullRegions: List[Option[Region]], (response: SearchResponse, strategy: SearchStrategy)) =>
            val newQueryRegions =
              inputRegionsList
                .zip(fullRegions)
                .filter(_._2.isDefined)
                .map(_._2.get)
                .map(Specified.apply)
                .toSet ++ inputQuery.regions.filter(_.isEmpty)

            val outputQuery = queryWithBoostRegions.copy(regions = newQueryRegions)
            buildSearchResult(outputQuery, response, strategy, requestedFacetSize)
        }
      }
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

  def augmentWithBoostRegions(query: Query)(implicit client: ElasticClient): Future[Query] = {
    val regionsFuture = query.freeText.filter(_.length > 0).map(freeText => client.execute(
      ElasticDsl.search(indices.getIndex(config, Indices.RegionsIndex))
        query(matchQuery("regionSearchId", freeText).operator("or"))
        limit 50
      ).map {
        case ESGenericException(e) => throw e
        case results: RequestSuccess[SearchResponse] => {
          results.result.totalHits match {
            case 0 => Set[Region]() // If there's no hits, no need to do anything more
            case _ => results.result.to[Region].toSet
          }
        }
      }
    ).getOrElse(Future(Set[Region]()))
    regionsFuture.map(regions => query.copy(boostRegions = regions))
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

            val inputFacetOptions = definition.getInputFacetOptions(query)

            val alternativeOptions =
              definition.extractFacetOptions(
                aggs
                  .dataAsMap.get(facetType.id + "-global").flatMap(AggUtils.toAgg(_))
                  .flatMap(_.dataAsMap.get("filter").flatMap(AggUtils.toAgg(_)))
              )

            val notMatchedInputFacetOptions = inputFacetOptions
              .filter(optionStr => !alternativeOptions.exists(_.value == optionStr))
              .map(FacetOption(None, _, 0l, None, None, true))

            val allOptions = alternativeOptions ++ notMatchedInputFacetOptions

            val nonInputOptions = allOptions.filter(!_.matched).sortBy(_.hitCount).reverse
            val inputOptions = allOptions.filter(_.matched).sortBy(_.hitCount).reverse

            if ( facetSize <= inputOptions.size ) {
              inputOptions.take(facetSize)
            } else {
              inputOptions ++ nonInputOptions.take(facetSize - inputOptions.size)
            }
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
                  tenantId: String,
                  query: Query,
                  start: Long,
                  limit: Int,
                  strategy: SearchStrategy) = {
    ElasticDsl
      .search(indices.getIndex(config, Indices.DataSetsIndex))
      .limit(limit)
      .start(start.toInt)
      .query(buildEsQuery(tenantId, query, strategy))
  }

  /** Same as {@link #buildQuery} but also adds aggregations */
  def buildQueryWithAggregations(
                                  tenantId: String,
                                  query: Query,
                                  start: Long,
                                  limit: Int,
                                  strategy: SearchStrategy,
                                  facetSize: Int) =
    addAggregations(
      tenantId,
      buildQuery(tenantId, query, start, limit, strategy),
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
                       tenantId: String,
                       searchDef: SearchRequest,
                       query: Query,
                       strategy: SearchStrategy,
                       facetSize: Int) = {
    val facetAggregations: List[AggregationDefinition] =
      FacetType.all
        .flatMap(
          facetType =>
            aggsForFacetType(
              tenantId,
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
                        tenantId: String,
                        query: Query,
                        facetType: FacetType,
                        strategy: SearchStrategy,
                        facetSize: Int): List[AggregationDefinition] = {
    val facetDef = facetDefForType(facetType)

    // Sub-aggregations of "global" aggregate on all datasets independently of the query passed in.
    val globalAgg =
      globalAggregation(facetType.id + "-global")
        .subAggregations(alternativesAggregation(
          tenantId,
          query,
          facetDef,
          strategy,
          facetSize))
        .asInstanceOf[AggregationDefinition]

    globalAgg :: Nil
  }

  /**
    * The alternatives aggregation shows what other choices are available if the user wasn't
    * filtering on this facet - e.g. if I was searching for datasets from a certain publisher,
    * this shows me other publishers I could search on instead
    */
  def alternativesAggregation(
                               tenantId: String,
                               query: Query,
                               facetDef: FacetDefinition,
                               strategy: SearchStrategy,
                               facetSize: Int) = {
    val tenantIdTermQuery = termQuery("tenantId", tenantId)
    filterAggregation("filter")
      .query(must(
        Seq(queryToQueryDef(facetDef.removeFromQuery(query), strategy, true),
          tenantIdTermQuery
        )))
      .subAggregations(facetDef.aggregationDefinition(query, facetSize))
    }

  /**
   * Accepts a seq - if the seq is not empty, runs the passed fn over it and returns the result as Some, otherwise returns None.
   */
  private def setToOption[X, Y](seq: Set[X])(fn: Set[X] => Y): Option[Y] =
    seq match {
      case SetExtractor() => None
      case x => Some(fn(x))
    }

  private def buildEsQuery(tenantId: String, query: Query, strategy: SearchStrategy) : QueryDefinition = {
    val geomScorerQuery = setToOption(query.boostRegions)(seq => should(seq.map(region => regionToGeoShapeQuery(region, indices))))
    val geomScorer: Option[ScoreFunctionDefinition] = geomScorerQuery.map(weightScore(1).filter(_))
    val qualityScorers = Seq(fieldFactorScore("quality")
                        .filter(termQuery("hasQuality", true))
                        .missing(1))
    /**
      * The overall score method is:
      * [Document Score] x SUM(1, [possible quality scorer result (range from 0~1) when hasQuality = true], [possible region scorer result (0 or 1) when boostRegions have been found])
      * This will guarantee the overall score never be 0 even when quality scorer or / and region scorer is missing
      * If both `quality` & `region` scorer are missing, overall score will be [Document Score] x 1
      *
      * The overall score method was:
      * [Document Score] x [possible quality scorer result (range from 0~1)]
      * When quality is 0 or missing, the overall score will be 0
      */
    val allScorers = Seq(weightScore(1)) ++ qualityScorers ++ geomScorer.toSeq

    val tenantTermQuery: TermQuery = termQuery("tenantId", tenantId)
    val q: QueryDefinition = queryToQueryDef(query, strategy)
    functionScoreQuery()
      .query(must(Seq(tenantTermQuery, queryToQueryDef(query, strategy))))
      .functions(allScorers).scoreMode("sum")
  }

  private def createInputTextQuery(inputText: String):QueryDefinition = {
    val queryString = SimpleStringQueryDefinition(inputText)
      .defaultOperator("and")
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
        queryString
          .field("distributions.title")
          .field("distributions.description")
          .field("distributions.format")
          .defaultOperator("and"))
      .scoreMode(ScoreMode.Max)

    /**
      * Unfortunately, when default operator is AND, we can't put NON_LANGUAGE_FIELDS & DATASETS_LANGUAGE_FIELDS
      * into one SimpleStringQuery as they have different searchAnalylzer
      * It will result a term like +(catalog:at | _id:at) will will never be matched
      * We need to fix on our side as elasticsearch won't know our intention for this case
      * */
    val queries =
      Seq(
        should(
          foldFields(
            queryString,
            DATASETS_LANGUAGE_FIELDS
          ),
          foldFields(
            queryString,
            NON_LANGUAGE_FIELDS
          )
        ).minimumShouldMatch(1),
        distributionsEnglishQueries)

    dismax(queries).tieBreaker(0.2)
  }

  /** Processes a general magda Query into a specific ES QueryDefinition */
  private def queryToQueryDef(
    query: Query,
    strategy: SearchStrategy,
    isForAggregation: Boolean = false): QueryDefinition = {

    val clauses: Seq[Traversable[QueryDefinition]] = Seq(
      query.freeText flatMap { inputText =>
        val text = if (inputText.trim.length == 0) "*" else inputText
        val textQuery = createInputTextQuery(text)
        if(query.boostRegions.isEmpty) Some(textQuery)
        else {
          // --- make sure replace the longer region name string first to avoid missing anyone
          val regionNames = query.boostRegions.toList.flatMap{ region =>
            // --- Please note: regionShortName should also be taken care
            region.regionName.toList ++ region.regionShortName.toList
          }.map(_.toLowerCase).sortWith(_.length > _.length)
          val altText = regionNames.foldLeft(text.toLowerCase)((str, regionName) => str.replace(regionName, "")).trim
          val inputTextQuery = if (altText.length == 0) createInputTextQuery("*") else createInputTextQuery(altText)
          val geomScorerQuery = setToOption(query.boostRegions)(seq => should(seq.map(region => regionToGeoShapeQuery(region, indices))))
          val queryDef = boolQuery().should(textQuery :: boolQuery().must(inputTextQuery :: geomScorerQuery.toList) :: Nil).minimumShouldMatch(1)
          Some(queryDef)
        }
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
    limit: Int,
    tenantId: String): Future[FacetSearchResult] = {
    val facetDef = facetDefForType(facetType)

    clientFuture.flatMap { client =>
      val tenantTermQuery: TermQuery = termQuery("tenantId", tenantId)
      // First do a normal query search on the type we created for values in this facet
      client
        .execute(
          ElasticDsl
            .search(indices.indexForFacet(facetType))
            .query( must(
              tenantTermQuery,
              dismax(
                Seq(
                  matchPhrasePrefixQuery("value", facetQuery.getOrElse("")),
                  matchPhrasePrefixQuery("acronym", facetQuery.getOrElse(""))))
                .tieBreaker(0))
            )
            .limit(limit))
        .flatMap {
          case ESGenericException(e) => throw e
          case results: RequestSuccess[SearchResponse] =>
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
                    tenantId,
                    facetDef.removeFromQuery(generalQuery),
                    0,
                    0,
                    MatchAll).aggs(filters)
                } map {
                  case ESGenericException(e) => throw e
                  case results: RequestSuccess[SearchResponse] =>
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
    limit: Int,
    tenantId: String): Future[RegionSearchResult] = {
    clientFuture.flatMap { client =>
      val tenantTermQuery: TermQuery = termQuery("tenantId", tenantId)
      client
        .execute(
          ElasticDsl.search(indices.getIndex(config, Indices.RegionsIndex))
            query {must(
              tenantTermQuery,
              boolQuery().should(
                matchPhrasePrefixQuery(
                "regionShortName",
                query.getOrElse("*")).boost(2),
                matchPhrasePrefixQuery(
                  "regionName",
                  query.getOrElse("*")))
            )}
            start start.toInt
            limit limit
            sortBy (fieldSort("order") order SortOrder.ASC,
              scoreSort order SortOrder.DESC)
              sourceExclude "geometry")
        .flatMap {
          case ESGenericException(e) => throw e
          case results: RequestSuccess[SearchResponse] =>
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
    limit: Int,
    tenantId: String): Future[OrganisationsSearchResult] = {

    clientFuture.flatMap { client =>
      val queryStringContent = queryString.getOrElse("*").trim
      val tenantTermQuery: TermQuery = termQuery("tenantId", tenantId)
      val query = ElasticDsl
        .search(indices.getIndex(config, Indices.DataSetsIndex))
        .start(start)
        .limit(limit)
        .query { must(
          tenantTermQuery,
          simpleStringQuery(queryStringContent)
            .field("publisher.name^20")
            .field("publisher.acronym^20")
            .field("publisher.description")
            .field("publisher.addrStreet")
            .field("publisher.addrSuburb")
            .field("publisher.addrState")
        )}
        .aggs(cardinalityAgg("totalCount", "publisher.identifier"))
        .collapse(new CollapseRequest(
          "publisher.aggKeywords.keyword",
          Some(new InnerHitDefinition("datasetCount", Some(1)))))
      client
        .execute(
          if (queryStringContent == "*") {
            query.sortByFieldAsc("publisher.name.keyword")
          } else {
            query
          })
        .flatMap {
          case r: RequestSuccess[SearchResponse] =>
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
          case ESGenericException(e) => throw e
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
    client: ElasticClient): Future[Option[Region]] = {
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
            case ESGenericException(e) => throw e
            case results: RequestSuccess[SearchResponse] =>
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
