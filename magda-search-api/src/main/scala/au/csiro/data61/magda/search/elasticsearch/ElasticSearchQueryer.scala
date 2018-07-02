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

import spray.json._
import akka.actor.ActorSystem
import akka.stream.Materializer
import au.csiro.data61.magda.api.FilterValue
import au.csiro.data61.magda.api.Query
import au.csiro.data61.magda.api.Specified
import au.csiro.data61.magda.api.Unspecified
import au.csiro.data61.magda.api.model.RegionSearchResult
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.Temporal.{ PeriodOfTime, ApiDate }
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
import org.apache.lucene.search.join.ScoreMode
import com.sksamuel.elastic4s.searches.queries.BoolQueryDefinition
import org.elasticsearch.index.query.MultiMatchQueryBuilder
import org.elasticsearch.search.aggregations.bucket.MultiBucketsAggregation
import org.elasticsearch.search.aggregations.bucket.global.GlobalAggregator
import org.elasticsearch.search.aggregations.metrics.tophits.InternalTopHits
import java.time.ZoneOffset
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.Instant
import org.elasticsearch.search.aggregations.metrics.min.InternalMin
import org.elasticsearch.search.aggregations.metrics.NumericMetricsAggregation.SingleValue

class ElasticSearchQueryer(indices: Indices = DefaultIndices)(
    implicit val config: Config,
    implicit val system: ActorSystem,
    implicit val ec: ExecutionContext,
    implicit val materializer: Materializer,
    implicit val clientProvider: ClientProvider) extends SearchQueryer {
  private val logger = system.log

  val clientFuture: Future[TcpClient] = clientProvider.getClient(system.scheduler, logger, ec).recover {
    case t: Throwable =>
      logger.error(t, "Could not connect to elasticsearch - this is a fatal error, so I'm dying now.")
      System.exit(1)
      throw t
  }

  val DATASETS_LANGUAGE_FIELDS = Seq(("title", 20f), ("description", 5f), "publisher.name", ("keywords", 5f), "themes")
  val NON_LANGUAGE_FIELDS = Seq("_id", "catalog", "accrualPeriodicity", "contactPoint.name", "publisher.acronym")

  override def search(inputQuery: Query, start: Long, limit: Int, requestedFacetSize: Int) = {
    val inputRegionsList = inputQuery.regions.toList

    clientFuture.flatMap { implicit client =>
      val fullRegionsFutures = inputRegionsList.map(resolveFullRegion)
      val fullRegionsFuture = Future.sequence(fullRegionsFutures)
      val query = buildQueryWithAggregations(inputQuery, start, limit, MatchAll, requestedFacetSize).explain(true)

      Future.sequence(Seq(fullRegionsFuture, client.execute(query).flatMap(response =>
        if (response.totalHits > 0)
          Future.successful((response, MatchAll))
        else
          client.execute(buildQueryWithAggregations(inputQuery, start, limit, MatchPart, requestedFacetSize)).map((_, MatchPart)))))
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
    val aggs = response.aggregations

    def getDateAggResult(agg: SingleValue) = {
      val minDateEpoch = agg.value().toLong
      if (minDateEpoch == Long.MaxValue || minDateEpoch == Long.MinValue) {
        None
      } else {
        Some(ApiDate(Some(OffsetDateTime.parse(agg.getValueAsString)), ""))
      }
    }

    new SearchResult(
      strategy = Some(strategy),
      query = query,
      hitCount = response.getHits.totalHits().toInt,
      dataSets = response.to[DataSet].map(_.copy(years = None)).toList,
      temporal = Some(PeriodOfTime(
        start = getDateAggResult(aggs.getAs[SingleValue]("minDate")), //        end = ApiDate.parse(aggs.getAs[InternalAggregation]("maxDate").getProperty("value").toString, None, false))
        end = getDateAggResult(aggs.getAs[SingleValue]("maxDate")))),
      facets = Some(FacetType.all.map { facetType =>
        val definition = facetDefForType(facetType)

        new Facet(
          id = facetType.id,
          options = {
            // Filtered options are the ones that partly match the user's input... e.g. "Ballarat Council" for input "Ballarat"
            val filteredOptions =
              (Option(aggs.getAs[InternalAggregation](facetType.id + "-filter")) match {
                case Some(filterAgg) => definition.extractFacetOptions(filterAgg.getProperty(facetType.id).asInstanceOf[InternalAggregation])
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
                  aggs.getAs[InternalAggregation](facetType.id + "-exact-" + name + "-filter"))
              }
              .map {
                case (name, agg: InternalFilter) => name -> agg
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
                      aggs.getAs[InternalAggregation](facetType.id + "-global").getProperty(aggProp))
                }
                .flatMap {
                  case (name, agg: InternalFilter) =>
                    if (agg.getDocCount > 0 && filteredExact.get(name).map(_.getDocCount).getOrElse(0l) == 0l) {
                      Some(
                        FacetOption(
                          identifier = agg.getAggregations.asMap().asScala.get("topHits").flatMap {
                            case hit: InternalTopHits =>
                              val dataSet = hit.getHits.getAt(0).getSourceAsString().parseJson.convertTo[DataSet]

                              dataSet.publisher.flatMap(_.identifier)
                          },
                          value = name.getOrElse(config.getString("strings.unspecifiedWord")),
                          hitCount = 0,
                          matched = true))
                    } else None
                }
                .toSeq

            val alternativeOptions =
              definition.extractFacetOptions(
                aggs.getAs[InternalAggregation](facetType.id + "-global")
                  .getProperty("filter").asInstanceOf[InternalAggregation]
                  .getProperty(facetType.id).asInstanceOf[InternalAggregation])

            definition.truncateFacets(query, filteredOptions, exactOptions, alternativeOptions, facetSize)
          })
      }.toSeq))
  }

  /** Converts from a general search strategy to the actual elastic4s method that will combine a number of queries using that strategy.*/
  def strategyToCombiner(strat: SearchStrategy): Iterable[QueryDefinition] => QueryDefinition = strat match {
    case MatchAll  => must
    //    case MatchPart => x => dismax(x).tieBreaker(0.3)
    case MatchPart => x => should(x).minimumShouldMatch("-49%")
  }

  /** Builds an elastic search query out of the passed general magda Query */
  def buildQuery(query: Query, start: Long, limit: Int, strategy: SearchStrategy) = {
    ElasticDsl.search(indices.getIndex(config, Indices.DataSetsIndex) / indices.getType(Indices.DataSetsIndexType))
      .limit(limit)
      .start(start.toInt)
      .query(buildEsQuery(query, strategy))
  }

  /** Same as {@link #buildQuery} but also adds aggregations */
  def buildQueryWithAggregations(query: Query, start: Long, limit: Int, strategy: SearchStrategy, facetSize: Int) =
    addAggregations(buildQuery(query, start, limit, strategy), query, strategy, facetSize)

  /** Builds an empty dummy searchresult that conveys some kind of error message to the user. */
  def failureSearchResult(query: Query, message: String) = new SearchResult(
    query = query,
    hitCount = 0,
    dataSets = Nil,
    errorMessage = Some(message))

  /** Adds standard aggregations to an elasticsearch query */
  def addAggregations(searchDef: SearchDefinition, query: Query, strategy: SearchStrategy, facetSize: Int) = {
    val facetAggregations: List[AggregationDefinition] =
      FacetType.all.flatMap(facetType =>
        aggsForFacetType(query, facetType, strategy, idealFacetSize(facetType, query, facetSize))).toList

    val minDateAgg = minAggregation("minDate").field("temporal.start.date")
    val maxDateAgg = maxAggregation("maxDate").field("temporal.end.date")

    searchDef.aggregations(facetAggregations ++ List(minDateAgg, maxDateAgg))
  }

  /** Gets all applicable ES aggregations for the passed FacetType, given a Query */
  def aggsForFacetType(query: Query, facetType: FacetType, strategy: SearchStrategy, facetSize: Int): List[AggregationDefinition] = {
    val facetDef = facetDefForType(facetType)

    // Sub-aggregations of "global" aggregate on all datasets independently of the query passed in.
    val globalAgg =
      globalAggregation(facetType.id + "-global")
        .subAggregations(alternativesAggregation(query, facetDef, strategy, facetSize) :: exactMatchAggregations(query, facetType, facetDef, strategy))
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
  def exactMatchAggregations(query: Query, facetType: FacetType, facetDef: FacetDefinition, strategy: SearchStrategy, suffix: String = ""): List[FilterAggregationDefinition] =
    facetDef.exactMatchQueries(query).map {
      case (name, query) =>
        filterAggregation(facetType.id + "-exact-" + name + suffix)
          .query(query)
          .subAggregations(
            topHitsAggregation("topHits").size(1).sortBy(fieldSort("identifier")))
    }.toList

  /**
   * The alternatives aggregation shows what other choices are available if the user wasn't
   * filtering on this facet - e.g. if I was searching for datasets from a certain publisher,
   * this shows me other publishers I could search on instead
   */
  def alternativesAggregation(query: Query, facetDef: FacetDefinition, strategy: SearchStrategy, facetSize: Int) =
    filterAggregation("filter")
      .query(queryToQueryDef(facetDef.removeFromQuery(query), strategy, true))
      .subAggregations(facetDef.aggregationDefinition(facetSize))

  /**
   * Accepts a seq - if the seq is not empty, runs the passed fn over it and returns the result as Some, otherwise returns None.
   */
  private def setToOption[X, Y](seq: Set[X])(fn: Set[X] => Y): Option[Y] = seq match {
    case SetExtractor() => None
    case x              => Some(fn(x))
  }
  private def buildEsQuery(query: Query, strategy: SearchStrategy): QueryDefinition = {
    functionScoreQuery().query(queryToQueryDef(query, strategy)).scorers(fieldFactorScore("quality"))
  }

  /** Processes a general magda Query into a specific ES QueryDefinition */
  private def queryToQueryDef(query: Query, strategy: SearchStrategy, isForAggregation: Boolean = false): QueryDefinition = {
    val operator = strategy match {
      case MatchAll  => "and"
      case MatchPart => "or"
    }

    val clauses: Seq[Traversable[QueryDefinition]] = Seq(
      query.freeText flatMap { inputText =>
        val text = if (inputText.trim.length == 0) "*" else inputText
        val queryString = new SimpleStringQueryDefinition(text).defaultOperator(operator).quoteFieldSuffix("keyword")

        // For some reason to make english analysis work properly you need to specifically hit the english fields.
        def foldFieldsEnglish(query: SimpleStringQueryDefinition, fields: Seq[Any]) = fields.foldRight(query) {
          case ((fieldName: String, boost: Float), queryDef) => queryDef.field(fieldName + ".english", boost)
          case (field: String, queryDef)                     => queryDef.field(field + ".english", 0)
        }
        def foldFields(query: SimpleStringQueryDefinition, fields: Seq[Any]) = fields.foldRight(query) {
          case ((fieldName: String, boost: Float), queryDef) => queryDef.field(fieldName, boost)
          case (field: String, queryDef)                     => queryDef.field(field, 0)
        }

        // Surprise! english analysis doesn't work on nested objects unless you have a nested query, even though
        // other analysis does. So we do this silliness
        val distributionsEnglishQueries = nestedQuery("distributions")
          .query(
            // If this was AND then a single distribution would have to match the entire query, this way you can
            // have multiple dists partially match
            queryString.field("distributions.title.english").field("distributions.description.english").field("distributions.format.keyword_lowercase")
              .defaultOperator("or"))
          .scoreMode(ScoreMode.Max)

        val queries = Seq(foldFieldsEnglish(foldFields(queryString, NON_LANGUAGE_FIELDS), DATASETS_LANGUAGE_FIELDS), distributionsEnglishQueries)

        Some(dismax(queries).tieBreaker(0.2))
      },
      setToOption(query.publishers)(seq => should(seq.map(publisherQuery(strategy))).boost(2)),
      setToOption(query.formats)(seq => should(seq.map(formatQuery(strategy))).boost(2)),
      dateQueries(query.dateFrom, query.dateTo).map(_.boost(2)),
      setToOption(query.regions)(seq => should(seq.map(region => regionIdQuery(region, indices))).boost(2)))

    strategyToCombiner(strategy)(clauses.flatten)
  }

  override def searchFacets(facetType: FacetType, facetQuery: Option[String], generalQuery: Query, start: Int, limit: Int): Future[FacetSearchResult] = {
    val facetDef = facetDefForType(facetType)

    clientFuture.flatMap { client =>
      // First do a normal query search on the type we created for values in this facet
      client.execute(ElasticDsl.search(indices.getIndex(config, Indices.DataSetsIndex) / indices.getType(indices.typeForFacet(facetType)))
        .query(dismax(Seq(matchPhrasePrefixQuery("value.english", facetQuery.getOrElse("")), matchPhrasePrefixQuery("acronym", facetQuery.getOrElse("")))).tieBreaker(0))
        .limit(10000))
        .flatMap { response =>
          response.totalHits match {
            case 0 => Future(FacetSearchResult(0, Nil)) // If there's no hits, no need to do anything more
            case _ =>
              val hits: Seq[(String, Option[String])] = response.hits
                .map { hit =>
                  val map = hit.sourceAsMap
                  (
                    map("value")toString,
                    map.get("identifier").map(_.toString))
                }

              // Create a dataset filter aggregation for each hit in the initial query
              val filters = hits.map {
                case (name, identifier) =>
                  aggregation.filter(name).filter(facetDef.exactMatchQuery(Specified(name)))
              }

              // Do a datasets query WITHOUT filtering for this facet and  with an aggregation for each of the hits we
              // got back on our keyword - this allows us to get an accurate count of dataset hits for each result
              client.execute {
                buildQuery(facetDef.removeFromQuery(generalQuery), 0, 0, MatchAll).aggs(filters)
              } map { aggQueryResult =>
                val aggregations = aggQueryResult.aggregations.map.mapValues {
                  case (bucket: InternalFilter) =>
                    new FacetOption(
                      identifier = None,
                      value = bucket.getName,
                      hitCount = bucket.getDocCount)
                }

                val options = (hits.map {
                  case (hitName, identifier) => aggregations(hitName).copy(identifier = identifier)
                }).sortBy(-_.hitCount).drop(start).take(limit)

                FacetSearchResult(
                  hitCount = response.totalHits,
                  options = options)
              }
          }
        }
    }
  }

  override def searchRegions(query: Option[String], start: Long, limit: Int): Future[RegionSearchResult] = {
    clientFuture.flatMap { client =>
      client.execute(
        ElasticDsl.search(indices.getIndex(config, Indices.RegionsIndex) / indices.getType(Indices.RegionsIndexType))
          query { boolQuery().should(matchPhrasePrefixQuery("regionShortName", query.getOrElse("*")).boost(2), matchPhrasePrefixQuery("regionName", query.getOrElse("*"))) }
          start start.toInt
          limit limit
          sortBy (
            fieldSort("order") order SortOrder.ASC,
            scoreSort order SortOrder.DESC)
            sourceExclude "geometry").flatMap { response =>
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
