package au.csiro.data61.magda.search.elasticsearch

import java.time.OffsetDateTime
import akka.actor.ActorSystem
import akka.stream.Materializer
import au.csiro.data61.magda.api.model.{
  AutoCompleteQueryResult,
  OrganisationsSearchResult,
  RegionSearchResult,
  SearchResult
}
import au.csiro.data61.magda.api.{FilterValue, Query, Specified, Unspecified}
import au.csiro.data61.magda.client.EmbeddingApiClient
import au.csiro.data61.magda.model.Auth.AuthDecision
import au.csiro.data61.magda.model.Temporal
import au.csiro.data61.magda.model.Temporal.{ApiDate, PeriodOfTime}
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.model.TenantId._
import au.csiro.data61.magda.search.SearchStrategy._
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import au.csiro.data61.magda.search.elasticsearch.Exceptions.{
  ESGenericException,
  IllegalArgumentException
}
import au.csiro.data61.magda.search.elasticsearch.FacetDefinition.facetDefForType
import au.csiro.data61.magda.search.elasticsearch.Queries._
import au.csiro.data61.magda.search.elasticsearch.queries.{
  HybridQuery,
  KnnQuery
}
import au.csiro.data61.magda.search.{SearchQueryer, SearchStrategy}
import au.csiro.data61.magda.util.ErrorHandling.RootCause
import au.csiro.data61.magda.util.SetExtractor
import com.sksamuel.elastic4s._
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.searches.SearchResponse
import com.sksamuel.elastic4s.{ElasticClient, ElasticDsl, RequestSuccess}
import com.sksamuel.elastic4s.requests.searches.aggs.responses.Aggregations
import com.sksamuel.elastic4s.requests.searches.aggs.{
  FilterAggregation,
  Aggregation => AggregationDefinition
}
import com.sksamuel.elastic4s.requests.searches.collapse.CollapseRequest
import com.sksamuel.elastic4s.requests.searches.queries.funcscorer.{
  ScoreFunction => ScoreFunctionDefinition
}
import com.sksamuel.elastic4s.requests.searches.term.TermQuery
import com.sksamuel.elastic4s.requests.searches.queries.{
  NestedQuery,
  InnerHit => InnerHitDefinition,
  Query => QueryDefinition,
  SimpleStringQuery => SimpleStringQueryDefinition
}
import com.sksamuel.elastic4s.requests.searches.sort.SortOrder
import com.sksamuel.elastic4s.requests.searches.{ScoreMode, SearchRequest}
import com.sksamuel.elastic4s.requests.searches.queries.matches.{
  MatchAllQuery,
  MatchNoneQuery
}
import com.typesafe.config.Config

import scala.concurrent.{ExecutionContext, Future}

class ElasticSearchQueryer(indices: Indices = DefaultIndices)(
    implicit val config: Config,
    implicit val system: ActorSystem,
    implicit val ec: ExecutionContext,
    implicit val materializer: Materializer,
    implicit val clientProvider: ClientProvider,
    implicit val embeddingClient: EmbeddingApiClient
) extends SearchQueryer {
  private val logger = system.log

  val datasetInnerHitsSize = config.getInt(
    "elasticSearch.indices.datasets.innerHitsSize"
  )

  val debugMode =
    if (config.hasPath("searchApi.debug"))
      config.getBoolean(
        "searchApi.debug"
      )
    else false

  val clientFuture: Future[ElasticClient] = clientProvider.getClient.recover {
    case t: Throwable =>
      logger.error(
        t,
        "Could not connect to elasticsearch - this is a fatal error, so I'm dying now."
      )
      System.exit(1)
      throw t
  }

  val DATASETS_LANGUAGE_FIELDS = Seq(
    ("title", 50f),
    ("description", 2f),
    "publisher.name",
    ("keywords", 10f),
    "themes"
  )

  val NON_LANGUAGE_FIELDS = Seq(
    "identifier",
    "catalog",
    "accrualPeriodicity",
    "contactPoint.identifier",
    "publisher.acronym"
  )

  val ALLOWED_AUTO_COMPLETE_FIELDS = Seq(
    "accessNotes.location"
  )

  def augmentWithHybridSearch(
      inputQuery: Query
  ): Future[Query] = {
    val freeText = inputQuery.freeText.getOrElse("").trim
    if (!HybridSearchConfig.enabled || freeText.isEmpty || freeText == "*") {
      Future(inputQuery)
    } else {
      embeddingClient
        .get(freeText)
        .map(
          v => inputQuery.copy(hybridSearch = true, freeTextVector = Some(v))
        )
    }
  }

  def augmentWithBoostRegions(
      query: Query
  )(implicit client: ElasticClient): Future[Query] = {
    val regionsFuture = query.freeText
      .filter(_.length > 0)
      .map(
        freeText => {
          val searchReq = (
            ElasticDsl.search(indices.getIndex(config, Indices.RegionsIndex))
              query (matchQuery("regionSearchId", freeText).operator("or"))
              limit 50
          )
          if (debugMode) {
            logger.info(client.show(searchReq).query)
          }
          client
            .execute(searchReq)
            .map {
              case ESGenericException(e) => throw e
              case results: RequestSuccess[SearchResponse] => {
                results.result.totalHits match {
                  case 0 =>
                    Set[Region]() // If there's no hits, no need to do anything more
                  case _ => results.result.to[Region].toSet
                }
              }
            }
        }
      )
      .getOrElse(Future(Set[Region]()))
    regionsFuture.map(regions => query.copy(boostRegions = regions))
  }

  /**
    * Convert Seq[Future[Query]] to Future[Seq[Query]] and merge Seq[Query] into Query (later item will overwrite the proceeding one).
    * Eventually will return Future[Query]
    * @param queryList
    * @return
    */
  def mergeAugmentedInputQuery(queryList: Seq[Future[Query]]): Future[Query] = {
    Future
      .sequence(queryList)
      .map(
        list =>
          list
            .foldLeft(None: Option[Query])((initVal, item) => {
              initVal.map(
                iv =>
                  iv.copy(
                    freeText = item.freeText,
                    freeTextVector = item.freeTextVector,
                    hybridSearch = item.hybridSearch,
                    publishers = item.publishers,
                    dateFrom = item.dateFrom,
                    dateTo = item.dateTo,
                    regions = item.regions,
                    boostRegions = item.boostRegions,
                    formats = item.formats,
                    publishingState = item.publishingState
                  )
              )
            })
            .get
      )
  }

  override def search(
      inputQuery: Query,
      start: Long,
      limit: Int,
      requestedFacetSize: Int
  ) = {
    val inputRegionsList = inputQuery.regions.toList

    clientFuture
      .flatMap { implicit client =>
        val fullRegionsFutures = inputRegionsList.map(resolveFullRegion)
        val fullRegionsFuture = Future.sequence(fullRegionsFutures)

        mergeAugmentedInputQuery(
          Seq(
            augmentWithBoostRegions(inputQuery),
            augmentWithHybridSearch(inputQuery)
          )
        ).flatMap {
          case queryWithBoostRegions =>
            val query = buildQueryWithAggregations(
              queryWithBoostRegions,
              start,
              limit,
              MatchAll,
              requestedFacetSize
            )
            if (debugMode) {
              logger.info(client.show(query).query)
            }
            Future
              .sequence(
                Seq(
                  fullRegionsFuture,
                  client.execute(query.trackTotalHits(true)).flatMap {
                    case results: RequestSuccess[SearchResponse] =>
                      Future.successful((results.result, MatchAll))
                    case IllegalArgumentException(e) => throw e
                    case ESGenericException(e)       => throw e
                  }
                )
              )
              .map {
                case Seq(
                    fullRegions: List[Option[Region]],
                    (response: SearchResponse, strategy: SearchStrategy)
                    ) =>
                  val newQueryRegions =
                    inputRegionsList
                      .zip(fullRegions)
                      .filter(_._2.isDefined)
                      .map(_._2.get)
                      .map(Specified.apply)
                      .toSet ++ inputQuery.regions.filter(_.isEmpty)

                  val outputQuery =
                    queryWithBoostRegions.copy(regions = newQueryRegions)
                  buildSearchResult(
                    outputQuery,
                    response,
                    strategy,
                    requestedFacetSize
                  )
              }
        }
      } recover {
      case RootCause(illegalArgument: IllegalArgumentException) =>
        logger.error(illegalArgument, "Exception when searching")
        failureSearchResult(
          inputQuery,
          "Bad argument: " + illegalArgument.getMessage
        )
      case e: Throwable =>
        logger.error(e, "Exception when searching")
        failureSearchResult(inputQuery, "Unknown error")
    }
  }

  override def autoCompleteQuery(
      authDecision: AuthDecision,
      field: String,
      input: Option[String],
      size: Option[Int],
      tenantId: TenantId
  ): Future[AutoCompleteQueryResult] = {

    val authQuery = authDecision.toEsDsl().getOrElse(MatchAllQuery())

    val inputString: String = input.getOrElse("").trim

    if (inputString == "")
      Future.successful(AutoCompleteQueryResult(inputString, List()))
    else if (!ALLOWED_AUTO_COMPLETE_FIELDS.contains(field))
      Future.successful(
        AutoCompleteQueryResult(
          inputString,
          List(),
          Some("Unrecognised auto-complete field")
        )
      )
    else {

      val sizeLimit: Int =
        if (size.isEmpty) 10
        else if (size.get < 1) 1
        else if (size.get > 100) 100
        else size.get

      clientFuture.flatMap { implicit client =>
        val filterQuery = boolQuery().must(
          Seq(
            tenantId.getEsQuery(),
            authQuery,
            matchQuery(s"${field}.autoComplete", inputString)
          )
        )

        val aggs = termsAgg("suggestions", s"${field}.keyword")
          .size(sizeLimit)

        val query = ElasticDsl
          .search(indices.getIndex(config, Indices.DataSetsIndex))
          .size(0) // --- disable hits data from response as we only need aggregation
          .query(filterQuery)
          .aggregations(aggs)

        client
          .execute(query)
          .flatMap {
            case results: RequestSuccess[SearchResponse] =>
              Future.successful(results.result)
            case IllegalArgumentException(e) => throw e
            case ESGenericException(e)       => throw e
          }
          .map { result =>
            val aggs = result.aggregations
            val items = aggs.dataAsMap
              .get("suggestions")
              .flatMap(AggUtils.toAgg(_))
              .toSeq
              .flatMap(_.dataAsMap.get("buckets").toSeq)
              .flatMap(_.asInstanceOf[Seq[Map[String, Any]]].map { m =>
                val agg = Aggregations(m)
                agg.data("key").toString
              })

            AutoCompleteQueryResult(inputString, items)
          }
      } recover {
        case RootCause(illegalArgument: IllegalArgumentException) =>
          logger.error(illegalArgument, "Exception when searching")
          AutoCompleteQueryResult(
            inputString,
            List(),
            Some("Bad argument: " + illegalArgument.getMessage)
          )
        case e: Throwable =>
          logger.error(e, "Exception when searching")
          AutoCompleteQueryResult(inputString, List(), Some("Unknown error"))
      }

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
      requestedFacetSize: Int
  ) = {
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
      facetSize: Int
  ): SearchResult = {
    val aggs = response.aggregations

    def getDateAggResult(
        agg: Option[Map[String, Any]]
    ): Option[Temporal.ApiDate] = agg match {
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
              ""
            )
          )
        }
    }

    SearchResult(
      strategy = Some(strategy),
      query = query,
      hitCount = response.totalHits,
      dataSets = response.to[DataSet].map(_.copy(years = None)).toList,
      temporal = Some(
        PeriodOfTime(
          start = getDateAggResult(
            aggs.data.get("minDate").asInstanceOf[Option[Map[String, Any]]]
          ), //        end = ApiDate.parse(aggs.getAs[InternalAggregation]("maxDate").getProperty("value").toString, None, false))
          end = getDateAggResult(
            aggs.data.get("maxDate").asInstanceOf[Option[Map[String, Any]]]
          )
        )
      ),
      facets = Some(FacetType.all.map { facetType =>
        val definition = facetDefForType(facetType)

        Facet(
          id = facetType.id,
          options = {

            val inputFacetOptions = definition.getInputFacetOptions(query)

            val alternativeOptions =
              definition.extractFacetOptions(
                aggs.dataAsMap
                  .get(facetType.id + "-global")
                  .flatMap(AggUtils.toAgg(_))
                  .flatMap(_.dataAsMap.get("filter").flatMap(AggUtils.toAgg(_)))
              )

            val notMatchedInputFacetOptions = inputFacetOptions
              .filter(
                optionStr =>
                  !alternativeOptions
                    .exists(_.value.toLowerCase == optionStr.toLowerCase)
              )
              .map(FacetOption(None, _, 0L, None, None, true))

            val allOptions = alternativeOptions ++ notMatchedInputFacetOptions

            val nonInputOptions =
              allOptions.filter(!_.matched).sortBy(_.hitCount).reverse
            val inputOptions =
              allOptions.filter(_.matched).sortBy(_.hitCount).reverse

            if (facetSize <= inputOptions.size) {
              inputOptions.take(facetSize)
            } else {
              inputOptions ++ nonInputOptions.take(
                facetSize - inputOptions.size
              )
            }
          }
        )
      })
    )
  }

  /** Converts from a general search strategy to the actual elastic4s method that will combine a number of queries using that strategy.*/
  def strategyToCombiner(
      strat: SearchStrategy
  ): Iterable[QueryDefinition] => QueryDefinition =
    strat match {
      case MatchAll => must
      //    case MatchPart => x => dismax(x).tieBreaker(0.3)
      case MatchPart =>
        x => should(x).minimumShouldMatch("-49%")
    }

  /** Builds an elastic search query out of the passed general magda Query */
  def buildQuery(
      query: Query,
      start: Long,
      limit: Int,
      strategy: SearchStrategy
  ) = {
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
      facetSize: Int
  ) =
    addAggregations(
      buildQuery(
        query,
        start,
        limit,
        strategy
      ),
      query,
      strategy,
      facetSize
    ).sourceExclude(
      // --- do not include accessControl metadata and vectors
      "accessControl",
      "queryContextVector",
      "distributions.accessControl",
      "distributions.queryContextVector"
    )

  /** Builds an empty dummy searchresult that conveys some kind of error message to the user. */
  def failureSearchResult(query: Query, message: String) =
    new SearchResult(
      query = query,
      hitCount = 0,
      dataSets = Nil,
      errorMessage = Some(message)
    )

  /** Adds standard aggregations to an elasticsearch query */
  def addAggregations(
      searchDef: SearchRequest,
      query: Query,
      strategy: SearchStrategy,
      facetSize: Int
  ) = {
    val facetAggregations: List[AggregationDefinition] =
      FacetType.all
        .flatMap(
          facetType =>
            aggsForFacetType(
              query,
              facetType,
              strategy,
              idealFacetSize(facetType, query, facetSize)
            )
        )
        .toList

    val minDateAgg = minAgg("minDate", "temporal.start.date")
    val maxDateAgg = minAgg("maxDate", "temporal.end.date")

    searchDef.aggregations(facetAggregations ++ List(minDateAgg, maxDateAgg))
  }

  /** Gets all applicable ES aggregations for the passed FacetType, given a Query */
  def aggsForFacetType(
      query: Query,
      facetType: FacetType,
      strategy: SearchStrategy,
      facetSize: Int
  ): List[AggregationDefinition] = {
    val facetDef = facetDefForType(facetType)

    // Sub-aggregations of "global" aggregate on all datasets independently of the query passed in.
    val globalAgg =
      globalAggregation(facetType.id + "-global")
        .subAggregations(
          alternativesAggregation(
            query,
            facetDef,
            strategy,
            facetSize
          )
        )
        .asInstanceOf[AggregationDefinition]

    globalAgg :: Nil
  }

  /**
    * The alternatives aggregation shows what other choices are available if the user wasn't
    * filtering on this facet - e.g. if I was searching for datasets from a certain publisher,
    * this shows me other publishers I could search on instead
    */
  def alternativesAggregation(
      query: Query,
      facetDef: FacetDefinition,
      strategy: SearchStrategy,
      facetSize: Int
  ) = {
    filterAgg(
      "filter",
      query = must(
        queryToQueryDef(facetDef.removeFromQuery(query), strategy)
      )
    ).subAggregations(facetDef.aggregationDefinition(query, facetSize))
  }

  /**
    * Accepts a seq - if the seq is not empty, runs the passed fn over it and returns the result as Some, otherwise returns None.
    */
  private def setToOption[X, Y](seq: Set[X])(fn: Set[X] => Y): Option[Y] =
    seq match {
      case SetExtractor() => None
      case x              => Some(fn(x))
    }

  private def buildEsQuery(
      query: Query,
      strategy: SearchStrategy
  ): QueryDefinition = {
    val geomScorerQuery = setToOption(query.boostRegions)(
      seq => should(seq.map(region => regionToGeoShapeQuery(region, indices)))
    )
    val geomScorer: Option[ScoreFunctionDefinition] =
      geomScorerQuery.map(weightScore(1).filter(_))
    val qualityScorers = Seq(
      fieldFactorScore("quality")
        .filter(termQuery("hasQuality", true))
        .missing(1)
    )

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

    functionScoreQuery()
      .query(
        must(
          queryToQueryDef(query, strategy)
        )
      )
      .functions(allScorers)
      .scoreMode("sum")
  }

  private def createInputTextQuery(
      inputText: String,
      inputTextVector: Option[Array[Double]],
      datasetFilterQuery: QueryDefinition,
      distributionFilterQuery: QueryDefinition
  ): QueryDefinition = {
    // `*` means match everything, no need to do vector search
    val hybridSearchEnabled = inputText != "*" && HybridSearchConfig.enabled && inputTextVector.nonEmpty
    val queryString = SimpleStringQueryDefinition(inputText)
      .defaultOperator("and")
      .quoteFieldSuffix(".quote")

    def foldFields(query: SimpleStringQueryDefinition, fields: Seq[Any]) =
      fields.foldRight(query) {
        case ((fieldName: String, boost: Float), queryDef) =>
          queryDef.field(fieldName, boost)
        case (field: String, queryDef) => queryDef.field(field, 0)
      }

    val distributionsEnglishQueries = nestedQuery(
      "distributions",
      queryString
        .field("distributions.title")
        .field("distributions.description")
        .field("distributions.format")
        .defaultOperator("and")
    ).scoreMode(ScoreMode.Max)

    /**
      * Unfortunately, when default operator is AND, we can't put NON_LANGUAGE_FIELDS & DATASETS_LANGUAGE_FIELDS
      * into one SimpleStringQuery as they have different searchAnalylzer
      * It will result a term like +(catalog:at | _id:at) will will never be matched
      * We need to fix on our side as elasticsearch won't know our intention for this case
      * */
    val datasetsTextQuery = should(
      foldFields(
        queryString,
        DATASETS_LANGUAGE_FIELDS
      ),
      foldFields(
        queryString,
        NON_LANGUAGE_FIELDS
      )
    ).minimumShouldMatch(1)

    val queries =
      Seq(
        datasetsTextQuery,
        distributionsEnglishQueries
      )

    if (!hybridSearchEnabled) {
      dismax(queries).tieBreaker(0.2)
    } else {
      dismax(
        Seq(
          HybridQuery(
            Seq(
              datasetsTextQuery,
              KnnQuery(
                field = HybridSearchConfig.queryContextVectorFieldName,
                k = HybridSearchConfig.k,
                vector = inputTextVector.get,
                filter = Some(datasetFilterQuery)
              )
            )
          ),
          HybridQuery(
            Seq(
              distributionsEnglishQueries,
              NestedQuery(
                "distributions",
                KnnQuery(
                  field =
                    s"""distributions.${HybridSearchConfig.queryContextVectorFieldName}""",
                  k = HybridSearchConfig.k,
                  vector = inputTextVector.get,
                  filter = Some(distributionFilterQuery)
                )
              )
            )
          )
        )
      ).tieBreaker(0.2)
    }
  }

  /** Processes a general magda Query into a specific ES QueryDefinition */
  private def queryToQueryDef(
      query: Query,
      strategy: SearchStrategy
  ): QueryDefinition = {

    val datasetAuthQuery = query.authDecision.get.getDatasetDecisionQuery
    val distributionAuthQuery =
      query.authDecision.get.getDistributionDecisionQuery

    val datasetTenantIdQuery = query.tenantId
      .map(
        _.getEsQuery()
      )
      .getOrElse(MatchAllQuery())

    val distributionTenantIdQuery = query.tenantId
      .map(
        _.getEsQuery(
          isDistributionQuery = true
        )
      )
      .getOrElse(MatchAllQuery())

    val filterClauses: List[QueryDefinition] = List(
      setToOption(query.publishers)(
        seq => should(seq.map(publisherQuery(strategy))).boost(2)
      ).toList,
      setToOption(query.formats)(
        seq => should(seq.map(formatQuery(strategy))).boost(2)
      ).toList,
      dateQueries(query.dateFrom, query.dateTo).map(_.boost(2)).toList,
      setToOption(query.regions)(
        seq =>
          should(seq.map(region => regionIdQuery(region, indices))).boost(2)
      ).toList
    ).flatten

    val datasetFilterClauses = datasetTenantIdQuery :: datasetAuthQuery :: publishingStateQuery(
      query.publishingState
    ).getOrElse(MatchAllQuery()) :: filterClauses

    val distributionFilterClauses = distributionTenantIdQuery :: distributionAuthQuery :: publishingStateQuery(
      query.publishingState,
      isDistributionQuery = true
    ).getOrElse(MatchAllQuery()) :: filterClauses

    val datasetFilterQuery =
      if (datasetFilterClauses.isEmpty) boolQuery().must(datasetFilterClauses)
      else matchAllQuery()

    val distributionFilterQuery =
      if (distributionFilterClauses.isEmpty)
        boolQuery().must(distributionFilterClauses)
      else matchAllQuery()

    val textQueryClause = query.freeText flatMap { inputText =>
      val text = if (inputText.trim.length == 0) "*" else inputText
      val textQuery = createInputTextQuery(
        text,
        query.freeTextVector,
        datasetFilterQuery,
        distributionFilterQuery
      )
      if (query.boostRegions.isEmpty) Some(textQuery)
      else {
        // --- make sure replace the longer region name string first to avoid missing anyone
        val regionNames = query.boostRegions.toList
          .flatMap { region =>
            // --- Please note: regionShortName should also be taken care
            region.regionName.toList ++ region.regionShortName.toList
          }
          .map(_.toLowerCase)
          .sortWith(_.length > _.length)
        val altText = regionNames
          .foldLeft(text.toLowerCase)(
            (str, regionName) => str.replace(regionName, "")
          )
          .trim
        val inputTextQuery =
          if (altText.length == 0)
            createInputTextQuery(
              "*",
              query.freeTextVector,
              datasetFilterQuery,
              distributionFilterQuery
            )
          else
            createInputTextQuery(
              altText,
              query.freeTextVector,
              datasetFilterQuery,
              distributionFilterQuery
            )
        val geomScorerQuery = setToOption(query.boostRegions)(
          seq =>
            should(seq.map(region => regionToGeoShapeQuery(region, indices)))
        )
        val queryDef = boolQuery()
          .should(
            textQuery :: boolQuery()
              .must(inputTextQuery :: geomScorerQuery.toList) :: Nil
          )
          .minimumShouldMatch(1)
        Some(queryDef)
      }
    }

    /**
      * Create auth & tenantId filtered distribution list for each dataset as inner hits
      * This query should always match (as "min. should match" = 1 & MatchAllQuery was added)
      * However, its presence will generate filtered distribution list for each dataset as inner hits
      * We only need to filter distribution by auth & tenantId as all distributions of the dataset should be included
      * unless not accessible to users due to auth or tenantId
      */
    val distributionAuthInnerHitsQuery = boolQuery()
      .should(
        nestedQuery(
          "distributions",
          boolQuery().must(
            distributionTenantIdQuery :: List(distributionAuthQuery)
          )
        ).scoreMode(ScoreMode.None)
          .inner(
            InnerHitDefinition(
              "distributions",
              from = Some(0),
              size = Some(datasetInnerHitsSize)
            )
          ) :: List(MatchAllQuery())
      )
      .minimumShouldMatch(1)

    boolQuery()
      .must(textQueryClause)
      .filter(distributionAuthInnerHitsQuery :: datasetFilterClauses)
  }

  /**
    * Encode AggName into a string only contains [a-z0-9_-], because anything else will break ElasticSearch
    * @param name name string
    * @return encoded string
    */
  def encodeAggName(name: String): String = {
    val base64Result = new String(
      java.util.Base64.getEncoder.encode(name.getBytes("utf-8")),
      "utf-8"
    )
    base64Result.replace("=", "_")
  }

  /**
    * Decode encoded string into original string
    * @param encodedName
    * @return
    */
  def decodeAggName(encodedName: String): String = {
    val base64String = encodedName.replace("_", "=")
    new String(
      java.util.Base64.getDecoder.decode(base64String.getBytes("utf-8")),
      "utf-8"
    )
  }

  override def searchFacets(
      facetType: FacetType,
      facetQuery: Option[String],
      generalQuery: Query,
      start: Int,
      limit: Int
  ): Future[FacetSearchResult] = {
    val facetDef = facetDefForType(facetType)
    //val authQuery = authDecision.toEsDsl().getOrElse(MatchAllQuery())

    clientFuture.flatMap { client =>
      // First do a normal query search on the type we created for values in this facet
      client
        .execute(
          ElasticDsl
            .search(indices.indexForFacet(facetType))
            .query(
              dismax(
                Seq(
                  matchPhrasePrefixQuery("value", facetQuery.getOrElse("")),
                  matchPhrasePrefixQuery("acronym", facetQuery.getOrElse(""))
                )
              ).tieBreaker(0)
            )
            .limit(limit)
        )
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
                      map.get("identifier").map(_.toString)
                    )
                  }

                // Create a dataset filter aggregation for each hit in the initial query
                val filters = hits.map {
                  case (name, identifier) =>
                    filterAggregation(encodeAggName(name))
                      .query(facetDef.exactMatchQuery(Specified(name)))
                }

                // Do a datasets query WITHOUT filtering for this facet and  with an aggregation for each of the hits we
                // got back on our keyword - this allows us to get an accurate count of dataset hits for each result
                client.execute {
                  buildQuery(
                    facetDef.removeFromQuery(generalQuery),
                    0,
                    0,
                    MatchAll
                  ).aggs(filters)
                } map {
                  case ESGenericException(e) => throw e
                  case results: RequestSuccess[SearchResponse] =>
                    val aggregations = results.result.aggregations.data.map {
                      case (name: String, value: Map[String, Any]) =>
                        val decodedName = decodeAggName(name)
                        (
                          decodedName,
                          new FacetOption(
                            identifier = None,
                            value = decodedName,
                            hitCount = value
                              .get("doc_count")
                              .map(_.toString.toLong)
                              .getOrElse(0L)
                          )
                        )
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
                      options = options
                    )
                }

            }
        }
    }
  }

  override def searchRegions(
      query: Option[String],
      regionId: Option[String],
      regionType: Option[String],
      lv1Id: Option[String],
      lv2Id: Option[String],
      lv3Id: Option[String],
      lv4Id: Option[String],
      lv5Id: Option[String],
      start: Long,
      limit: Int,
      tenantId: TenantId
  ): Future[RegionSearchResult] = {

    val otherFilters = (regionType.map(matchQuery("regionType", _)).toList ++
      regionId.map(matchQuery("regionId", _)).toList ++
      lv1Id.map(matchQuery("lv1Id", _)).toList ++
      lv2Id.map(matchQuery("lv2Id", _)).toList ++
      lv3Id.map(matchQuery("lv3Id", _)).toList ++
      lv4Id.map(matchQuery("lv4Id", _)).toList ++
      lv5Id.map(matchQuery("lv5Id", _)).toList)

    val queryConditions: Seq[QueryDefinition] = query match {
      case Some(queryString) =>
        boolQuery().should(
          matchPhrasePrefixQuery("regionShortName", queryString).boost(2),
          matchPhrasePrefixQuery("regionName", queryString)
        ) :: otherFilters
      case None =>
        if (otherFilters.size != 0) otherFilters else List(MatchAllQuery())
    }

    val maxLimit = 1000

    clientFuture.flatMap { client =>
      client
        .execute(
          ElasticDsl.search(indices.getIndex(config, Indices.RegionsIndex))
            query {
              boolQuery().must(queryConditions)
            }
            start start.toInt
            limit (if (limit > maxLimit) maxLimit else limit)
            sortBy (fieldSort("order") order SortOrder.ASC,
            scoreSort order SortOrder.DESC)
            sourceExclude "geometry"
        )
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
                    results.result.to[Region].toList
                  )
                )
            }
        }
    }
  }

  override def searchOrganisations(
      queryString: Option[String],
      start: Int,
      limit: Int,
      tenantId: TenantId
  ): Future[OrganisationsSearchResult] = {

    clientFuture.flatMap { client =>
      val queryStringContent = queryString.getOrElse("*").trim
      val tenantTermQuery = tenantId.getEsQuery()
      val query = ElasticDsl
        .search(indices.getIndex(config, Indices.DataSetsIndex))
        .start(start)
        .limit(limit)
        .query {
          must(
            tenantTermQuery,
            simpleStringQuery(queryStringContent)
              .field("publisher.name^20")
              .field("publisher.acronym^20")
              .field("publisher.description")
              .field("publisher.addrStreet")
              .field("publisher.addrSuburb")
              .field("publisher.addrState")
          )
        }
        .aggs(cardinalityAgg("totalCount", "publisher.identifier"))
        .collapse(
          new CollapseRequest(
            "publisher.aggKeywords.keyword",
            Some(new InnerHitDefinition("datasetCount", Some(1)))
          )
        )
      client
        .execute(if (queryStringContent == "*") {
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
                d.publisher.map(
                  o =>
                    o.copy(datasetCount = innerHit.map(h => {
                      h.total.value
                    }))
                )
              })
              .toList

            val totalCount =
              r.result.aggregations.cardinality("totalCount").value
            Future(
              OrganisationsSearchResult(queryString, totalCount.toLong, orgs)
            )
          case ESGenericException(e) => throw e
        }
        .recover {
          case RootCause(illegalArgument: IllegalArgumentException) =>
            logger.error(illegalArgument, "Exception when searching")
            OrganisationsSearchResult(
              queryString,
              0,
              List(),
              Some("Bad argument: " + illegalArgument.getMessage)
            )
          case e: Throwable =>
            logger.error(e, "Exception when searching")
            OrganisationsSearchResult(
              queryString,
              0,
              List(),
              Some("Error: " + e.getMessage)
            )
        }
    }

  }

  def resolveFullRegion(queryRegionFV: FilterValue[Region])(
      implicit
      client: ElasticClient
  ): Future[Option[Region]] = {
    queryRegionFV match {
      case Specified(region) =>
        client
          .execute(
            ElasticDsl.search(indices.getIndex(config, Indices.RegionsIndex))
              query {
                idsQuery(
                  (region.queryRegion.regionType + "/" + region.queryRegion.regionId).toLowerCase
                )
              } start 0 limit 1 sourceExclude "geometry"
          )
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

  def apply(
      implicit
      config: Config,
      system: ActorSystem,
      ec: ExecutionContext,
      materializer: Materializer,
      clientProvider: ClientProvider,
      embeddingApiClient: EmbeddingApiClient
  ) = new ElasticSearchQueryer()
}
