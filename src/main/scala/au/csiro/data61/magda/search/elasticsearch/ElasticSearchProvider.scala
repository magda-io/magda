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
import org.elasticsearch.action.ActionRequestValidationException
import org.elasticsearch.index.IndexNotFoundException
import org.elasticsearch.client.transport.NoNodeAvailableException
import org.elasticsearch.transport.RemoteTransportException
import org.elasticsearch.search.aggregations.bucket.terms.Terms.Order
import org.elasticsearch.search.aggregations.InvalidAggregationPathException
import au.csiro.data61.magda.search.SearchProvider
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import au.csiro.data61.magda.model.misc
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.model.misc.Protocols._
import au.csiro.data61.magda.util.FutureRetry.retry
import au.csiro.data61.magda.api.Query
import au.csiro.data61.magda.search.elasticsearch.IndexedGeoShapeQueryDefinition._
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
import com.rockymadden.stringmetric.similarity.WeightedLevenshteinMetric
import jawn.ast.JValue
import java.time._
import java.io.File
import java.nio.file.Paths

import au.csiro.data61.magda.spatial.RegionSource
import org.elasticsearch.common.geo.ShapeRelation
import au.csiro.data61.magda.Config
import akka.stream.scaladsl.Merge

class ElasticSearchProvider(implicit val system: ActorSystem, implicit val ec: ExecutionContext, implicit val materializer: Materializer) extends SearchProvider {
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
          query.publishers.map(publisherQuery(_))).minimumShouldMatch(1)),

    misc.Year -> FacetDefinition(
      aggDef = (limit) => aggregation.terms(misc.Year.id).field("years").order(Order.term(false)).size(limit),
      needsFilterAgg = query => query.dateFrom.isDefined || query.dateTo.isDefined,
      filterAggDef = (limit, query) => must {
        val fromQuery = query.dateFrom.map(dateFromQuery(_))
        val toQuery = query.dateTo.map(dateToQuery(_))

        Seq(fromQuery, toQuery).filter(_.isDefined).map(_.get)
      }),

    Format -> FacetDefinition(
      aggDef = (limit) => aggregation nested Format.id path "distributions" aggregations {
        aggregation terms "abc" field "distributions.format.untokenized" size limit
      },
      getFacetDetails = aggregation => aggregation.getProperty("abc").asInstanceOf[Aggregation],
      needsFilterAgg = query => !query.formats.isEmpty,
      filterAggDef = (limit, query) =>
        should(
          query.formats.map(formatQuery(_))).minimumShouldMatch(1),
      filterAggFilter = query => filterOption => query.formats.exists(
        format => WeightedLevenshteinMetric(10, 0.1, 1).compare(format.toLowerCase, filterOption.value.toLowerCase) match {
          case Some(distance) => distance < 1.5
          case None           => false
        })))

  case class IndexDefinition(val name: String, val version: Int, val definition: CreateIndexDefinition, val create: ElasticClient => Unit = client => Unit)
  val indexes = Seq(new IndexDefinition(
    name = "datasets",
    version = 4,
    definition =
      create.index("datasets").mappings(
        mapping("datasets").fields(
          field("temporal").inner(
            field("start").inner(
              field("text").typed(StringType)),
            field("end").inner(
              field("text").typed(StringType))),
          field("publisher").inner(
            field("name").typed(StringType).fields(
              field("untouched").typed(StringType).index("not_analyzed"))),
          field("distributions").nested(
            field("format").typed(StringType).fields(
              field("untokenized").typed(StringType).analyzer("untokenized"))),
          field("spatial").inner(
            field("geoJson").typed(GeoShapeType))),
        mapping(Format.id),
        mapping(misc.Year.id),
        mapping(Publisher.id))
        .analysis(CustomAnalyzerDefinition("untokenized", KeywordTokenizer, LowercaseTokenFilter))),
    new IndexDefinition(
      name = "regions",
      version = 5,
      definition =
        create.index("regions").mappings(mapping("regions").fields(
          field("geometry").typed(GeoShapeType))),
      create = setupRegions))
  /**
   * Returns an initialised {@link ElasticClient} on completion. Using this to get the client rather than just keeping a reference to an initialised client
   *  ensures that all queries will only complete after the client is initialised.
   */
  private val setupFuture = setup()

  /** Initialises an {@link ElasticClient}, handling initial connection to the ElasticSearch server and creation of the index */
  private def setup(): Future[ElasticClient] = {
    implicit val scheduler = system.scheduler

    // Connect to the ES client - quite often the API will actually start before ES starts accepting connections, so keep retrying until it lets us in.
    def onRetry = (retriesLeft: Int) => logger.warning("Failed to make initial contact with ES server, {} retries left", retriesLeft)
    retry(Future {
      val uri = ElasticsearchClientUri("elasticsearch://search:9300")
      ElasticClient.transport(uri)
    }.flatMap { client =>
      val getIndexesQueries = indexes.map(indexDef =>
        client.execute(get id "indexversion" from indexDef.name / "config")
          .map(x => if (x.isSourceEmpty || !x.isExists) 0 else x.source.get("version").asInstanceOf[Int])
          .recover {
            // If the index wasn't found that's fine, we'll just recreate it. Otherwise log an error - every subsequent request to the provider will fail with this exception.
            case outer: RemoteTransportException => outer.getCause match {
              case (inner: IndexNotFoundException) => {
                logger.warning("{} index was not present, if this is the first boot with a new index version this is fine: {}", indexDef.name, outer.getMessage)
                0
              }
            }
          })

      val combinedIndicesFuture = Future.sequence(getIndexesQueries)

      combinedIndicesFuture.map(versions => versions.zip(indexes))
        .map(versionPairs => (client, versionPairs))
    }, 10 seconds, 10, onRetry)
      .flatMap {
        case (client, versionPairs) =>
          logger.debug("Successfully connected to ES client")

          Future.sequence(createIndices(client, versionPairs)).map { x =>
            // If we've got to here everything has gone swimmingly - the index is all ready to have data loaded, so return the client for other methods to play with :)
            client
          }
      }
  }

  def setupRegions(client: ElasticClient) = // Create ABS regions but don't wait for it to finish.
    RegionSource.loadFromConfig(Config.conf.getConfig("regionSources")).map(regionSource =>
      RegionLoader.loadABSRegions(regionSource).map(j =>
        ElasticDsl.index
          .into("regions" / "regions")
          .id(s"${regionSource.name}/${j.getFields("properties").head.asJsObject.getFields(regionSource.id).head.asInstanceOf[JsString].value}")
          .source(j.toJson)
      ))
      .reduce((x, y) => Source.combine(x, y)(Merge(_)))
      // This creates a buffer of 50mb (roughly) of indexed regions that will be bulk-indexed in the next ES request 
      .batchWeighted(50000000L, defin => defin.build.source().length(), Seq(_))(_ :+ _)
      // This ensures that only one indexing request is executed at a time - while the index request is in flight, the entire stream backpressures
      // right up to reading from the file, so that new bytes will only be read from the file, parsed, turned into IndexDefinitions etc if ES is
      // available to index them right away
      .mapAsync(1) { values =>
        logger.debug("Indexing {} regions", values.length)
        client.execute(bulk(values))
      }
      .runWith(Sink.seq)
      .onComplete {
        case Success(results) =>
          val failures = results.filter(_.hasFailures)

          if (failures.size > 0) {
            logger.error("Failures when indexing regions, this means spatial search won't work:\n{}" + failures.foldLeft("")(_ + "\n" + _.failureMessage))
          } else {
            logger.info("Successfully indexed {} regions", results.foldLeft(0)((a, b: BulkResult) => a + b.successes.length))
          }
        case Failure(e) => logger.error(e, "Oops")
      }

  private def createIndices(client: ElasticClient, versionPairs: Seq[(Int, IndexDefinition)]) =
    versionPairs.map {
      case (indexVersion, definition) =>
        logger.info("{} index version is {}", definition.name, indexVersion)

        val deleteIndex = if (indexVersion != 0)
          client.execute {
            delete index definition.name
          }
        else
          Future.successful(Unit)

        // If the index version on ES is lower than the code's version, wipe it all and start again.
        if (indexVersion != definition.version) {
          deleteIndex flatMap { _ =>
            client.execute(definition.definition)
          } recover {
            case e: Throwable =>
              logger.error(e, "Failed to set up the index")
              throw e
          } flatMap { _ =>
            logger.info("Index {} version {} created", definition.name, definition.version)

            definition.create(client)

            // Now we've created the index, record the version of it so we can look at it next time we boot up.
            logger.info("Recording index version")

            client.execute {
              ElasticDsl.index into definition.name / "config" id "indexversion" source Map("version" -> definition.version).toJson
            }
          }
        } else Future.successful(Right(Unit))
    }

  // Only do give one operation to elasticsearch at a time, otherwise we risk overflowing its op queue. Operations that build up
  // while a previous one in progress will be batched together and bulk-executed when the previous one completes, up to 10... anything
  // more than that will keep backpressuring right up to the file reader.

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

  override def needsReindexing() = {
    setupFuture.flatMap(client =>
      client.execute {
        ElasticDsl.search in "datasets" / "datasets" limit 0
      } map { result =>
        logger.debug("Reindex check hit count: {}", result.getHits.getTotalHits)
        result.getHits.getTotalHits == 0
      })
  }

  override def index(source: String, dataSets: List[DataSet]) = {
    setupFuture.flatMap(client =>
      client.execute {
        bulk(
          dataSets.map { dataSet =>
            val indexDataSet = ElasticDsl.index into "datasets" / "datasets" id dataSet.uniqueId source (
              dataSet.copy(
                years = getYears(dataSet.temporal.flatMap(_.start.flatMap(_.date)), dataSet.temporal.flatMap(_.end.flatMap(_.date))) match {
                  case Nil  => None
                  case list => Some(list)
                }).toJson)

            val indexPublisher = dataSet.publisher.flatMap(_.name.map(publisherName =>
              ElasticDsl.index into "datasets" / Publisher.id
                id publisherName.toLowerCase
                source Map("value" -> publisherName).toJson))

            val indexYears = getYears(
              dataSet.temporal.flatMap(_.start.flatMap(_.date)),
              dataSet.temporal.flatMap(_.end.flatMap(_.date))).map(year => ElasticDsl.index into "datasets" / misc.Year.id id year source Map("value" -> year).toJson)

            val indexFormats = dataSet.distributions.map(_.filter(_.format.isDefined).map { distribution =>
              val format = distribution.format.get

              ElasticDsl.index into "datasets" / Format.id id format.toLowerCase source Map("value" -> format).toJson
            }).getOrElse(Nil)

            indexDataSet :: indexYears ++ indexPublisher.toList ++ indexFormats
          }.flatten)
      })
  }

  override def search(query: Query, limit: Int) = {
    setupFuture.flatMap(client =>
      client.execute {
        addAggregations(addQuery(ElasticDsl.search in "datasets" / "datasets" limit limit, query), query)
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
              })
          }.toSeq))
      })
  }

  def addAggregations(searchDef: SearchDefinition, query: Query) = {
    searchDef aggregations (
      facetAggregations.flatMap {
        case (facetType, facetAgg) => {
          val aggregations = List(
            aggregation.filter(facetType.id).filter(getFilterQueryDef(facetType, query)).aggs(facetAgg.aggDef(10)))

          if (facetAgg.needsFilterAgg(query)) {
            val filterAggregation = aggregation.filter(facetType.id + "-filter")
              .filter(
                facetAgg.filterAggDef(10, query)).aggs(facetAgg.aggDef(10))

            filterAggregation :: aggregations
          } else aggregations
        }
      })
  }

  def getFilterQueryDef(facetType: FacetType, query: Query): BoolQueryDefinition = queryToQueryDef(
    facetType match {
      case misc.Year => query.copy(dateFrom = None, dateTo = None)
      case Format    => query.copy(formats = Nil)
      case Publisher => query.copy(publishers = Nil)
    })

  /**
   * Accepts a seq - if the seq is not empty, runs the passed fn over it and returns the result as Some, otherwise returns None.
   */
  def seqToOption[X, Y](seq: Seq[X])(fn: Seq[X] => Y): Option[Y] = seq match {
    case Nil => None
    case x   => Some(fn(x))
  }

  private def publisherQuery(publisher: String) = matchPhraseQuery("publisher.name", publisher)
  private def formatQuery(format: String) = nestedQuery("distributions").query(
    matchQuery("distributions.format", format))
  private def regionIdQuery(regionId: String) = indexedGeoShapeQuery("spatial.geoJson", regionId, "regions")
    .relation(ShapeRelation.INTERSECTS)
    .shapeIndex("regions")
    .shapePath("geometry")
  private def dateFromQuery(dateFrom: Instant) = filter(should(
    rangeQuery("temporal.end.date").gte(dateFrom.toString),
    rangeQuery("temporal.start.date").gte(dateFrom.toString)).minimumShouldMatch(1))
  private def dateToQuery(dateTo: Instant) = filter(should(
    rangeQuery("temporal.end.date").lte(dateTo.toString),
    rangeQuery("temporal.start.date").lte(dateTo.toString)).minimumShouldMatch(1))

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
      stringQuery.map(innerQuery => new QueryStringQueryDefinition(innerQuery).boost(2)),
      seqToOption(query.publishers)(seq => should(seq.map(publisherQuery))),
      seqToOption(query.formats)(seq => should(seq.map(formatQuery))),
      query.dateFrom.map(dateFromQuery),
      query.dateTo.map(dateToQuery),
      seqToOption(query.regions)(seq => should(seq.map(regionIdQuery))))

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
            value = hit.getSource.get("value").toString)))
      })
  }
}