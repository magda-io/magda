package au.csiro.data61.magda.api

import java.io.File
import java.time.{ Instant, OffsetDateTime }
import java.util.Properties
import java.util.concurrent.ConcurrentHashMap

import akka.actor.{ ActorSystem, Scheduler }
import akka.event.{ Logging, LoggingAdapter }
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.ContentTypes.`application/json`
import akka.http.scaladsl.model.StatusCodes.{ InternalServerError, OK }
import akka.http.scaladsl.server.Route
import akka.http.scaladsl.testkit.{ RouteTestTimeout, ScalatestRouteTest }
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.api.Model.{ Protocols, SearchResult }
import au.csiro.data61.magda.model.misc.{ DataSet, _ }
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import au.csiro.data61.magda.search.elasticsearch._
import au.csiro.data61.magda.test.util.Generators._
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.testkit.ElasticSugar
import com.typesafe.config.{ Config, ConfigFactory }
import org.elasticsearch.common.settings.Settings
import org.scalacheck.Shrink._
import org.scalacheck._
import org.scalactic.anyvals.PosInt
import org.scalatest.{ BeforeAndAfter, Matchers, _ }
import org.scalatest.prop.GeneratorDrivenPropertyChecks
import spray.json._

import scala.collection.JavaConverters._
import scala.concurrent.{ ExecutionContext, Future }
import scala.concurrent.duration.DurationInt
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicInteger
import java.util.function.Consumer

import org.scalacheck.Arbitrary._
import au.csiro.data61.magda.model.temporal.PeriodOfTime
import au.csiro.data61.magda.search.{ MatchAll, MatchPart }

class ApiSpec extends FunSpec with Matchers with ScalatestRouteTest with ElasticSugar with BeforeAndAfter with BeforeAndAfterAll with Protocols with GeneratorDrivenPropertyChecks {
  override def testConfigSource = "akka.loglevel = WARN"
  val LUCENE_CONTROL_CHARACTER_REGEX = """[^.,\\/#!$%\\^&\\*;:{}=\\-_`~()\\[\\]"'\\+]*"""
  val INSERTION_WAIT_TIME = 60 seconds
  val logger = Logging(system, getClass)
  val processors = Math.max(Runtime.getRuntime().availableProcessors() / 2, 2)
  //      val processors = 1
  logger.info("Running with {} processors", processors.toString)
  implicit override val generatorDrivenConfig = PropertyCheckConfiguration(workers = PosInt.from(processors).get, sizeRange = PosInt(50), minSuccessful = PosInt(50))
  implicit def default(implicit system: ActorSystem) = RouteTestTimeout(5 seconds)
  override def httpEnabled = false

  val properties = new Properties()
  properties.setProperty("regionLoading.cachePath", new File("./src/test/resources").getAbsolutePath())
  val generatedConf = configWith(Map("regionLoading.cachePath" -> new File("./src/test/resources").getAbsolutePath()))
  implicit val config = generatedConf.withFallback(AppConfig.conf(Some("test")))
  override def testConfig = ConfigFactory.empty()

  implicit object MockClientProvider extends ClientProvider {
    override def getClient(implicit scheduler: Scheduler, logger: LoggingAdapter, ec: ExecutionContext): Future[ElasticClientTrait] = Future(new ElasticClientAdapter(client))
  }

  val cleanUpQueue = new ConcurrentLinkedQueue[String]()

  var generatedIndexCount = 0

  var genCache: ConcurrentHashMap[Int, Future[(String, List[DataSet], Route)]] = new ConcurrentHashMap()

  override def configureSettings(builder: Settings.Builder) =
    builder
      .put("cluster.routing.allocation.disk.watermark.high", "100%")
      .put("cluster.routing.allocation.disk.watermark.low", "100%")
      .put("discovery.zen.ping.multicast", "false")
      .put("index.store.fs.memory.enabled", "true")
      .put("index.gateway.type", "none")
      .put("index.store.throttle.type", "none")
      .put("index.translog.disable_flush", "true")
      .put("index.memory.index_buffer_size", "50%")
      .put("index.refresh_interval", "-1")

  override def blockUntil(explain: String)(predicate: () ⇒ Boolean): Unit = {
    var backoff = 0
    var done = false

    while (backoff <= 10 && !done) {
      backoff = backoff + 1
      try {
        done = predicate()

        if (!done) {
          logger.debug(s"Waiting another {}ms for {}", 200 * backoff, explain)
          Thread.sleep(200 * (backoff))
        } else {
          logger.debug(s"{} is true, proceeding.", explain)
        }
      } catch {
        case e: Throwable ⇒
          logger.error(e, "")
          throw e
      }
    }

    require(done, s"Failed waiting on: $explain")
  }

  def configWith(newProps: Map[String, String]): Config = {
    ConfigFactory.parseProperties(
      newProps.foldRight(new Properties()) { (current: (String, String), properties: Properties) ⇒
        properties.setProperty(current._1, current._2)
        properties
      }
    )
  }

  case class FakeIndices(rawIndexName: String) extends Indices {
    override def getIndex(config: Config, index: Indices.Index): String = rawIndexName
  }

  implicit def indexShrinker(implicit s: Shrink[String], s1: Shrink[List[DataSet]], s2: Shrink[Route]): Shrink[(String, List[DataSet], Route)] = Shrink[(String, List[DataSet], Route)] {
    case (indexName, dataSets, route) ⇒
      logger.info("preshrink: {}", dataSets.size)
      shrink(dataSets).map(shrunkDataSets ⇒ {
        logger.info("postshrink: {}", shrunkDataSets.size)

        if (shrunkDataSets.equals(dataSets)) {
          (indexName, dataSets, route)
        } else {
          def insertNew() = {
            val result = putDataSetsInIndex(shrunkDataSets).await(INSERTION_WAIT_TIME)
            cleanUpQueue.add(result._1)
            result
          }

          if (shrunkDataSets.forall(dataSets.contains(_))) {
            println("shrunk datasets was a subset")
            insertNew
          } else {
            getFromIndexCache(shrunkDataSets.size) match {
              case (_, Some(result)) ⇒
                val cachedResult = result.await(INSERTION_WAIT_TIME)
                val cachedDataSets = cachedResult._2

                if (cachedDataSets.equals(dataSets)) insertNew
                else cachedResult
              case (_, None) ⇒ insertNew
            }
          }
        }
      })
  }

  def queryToText(query: Query): String = {
    val list = Seq(query.freeText).flatten ++
      query.quotes.map(""""""" + _ + """"""") ++
      query.publishers.map(publisher ⇒ s"by $publisher") ++
      Seq(query.dateFrom.map(dateFrom ⇒ s"from $dateFrom")).flatten ++
      Seq(query.dateTo.map(dateTo ⇒ s"to $dateTo")).flatten ++
      query.formats.map(format ⇒ s"as $format")

    list.mkString(" ")
  }

  implicit def textQueryShrinker(implicit s: Shrink[String], s1: Shrink[Query]): Shrink[(String, Query)] = Shrink[(String, Query)] {
    case (queryString, queryObj) ⇒
      shrink(queryObj).map { shrunkQuery ⇒
        (queryToText(shrunkQuery), shrunkQuery)
      }
  }

  def indexGen: Gen[(String, List[DataSet], Route)] =
    Gen.delay {
      Gen.size.flatMap { size ⇒
        getFromIndexCache(size) match {
          case (cacheKey, None) ⇒
            Gen.listOfN(size, dataSetGen).map { dataSetsRaw ⇒
              val dataSets = dataSetsRaw.groupBy(_.identifier).mapValues(_.head).values.toList
              val dataSetCount = dataSets.size
              logger.info("Cache miss for {}", cacheKey)
              genCache.put(cacheKey, putDataSetsInIndex(dataSets))
              genCache.get(cacheKey).await(INSERTION_WAIT_TIME)
            }
          case (cacheKey, Some(cachedValue)) ⇒
            val value = cachedValue.await(INSERTION_WAIT_TIME)

            logger.info("Cache hit for {}: {}", cacheKey, value._2.size)

            value
        }
      }
    }

  def getFromIndexCache(size: Int) = {
    val cacheKey = if (size < 10) size
    else if (size < 50) size - size % 5
    else if (size < 100) size - size % 10
    else size - size % 25
    //    val cacheKey = size

    (cacheKey, Option(genCache.get(cacheKey)))
  }

  def putDataSetsInIndex(dataSets: List[DataSet]): Future[(String, List[DataSet], Route)] = {
    val rawIndexName = java.util.UUID.randomUUID.toString
    val fakeIndices = FakeIndices(rawIndexName)

    val indexName = fakeIndices.getIndex(config, Indices.DataSetsIndex)
    client.execute(IndexDefinition.datasets.definition(config, fakeIndices)).await
    blockUntilGreen()

    //                implicit val thisConf = configWith(Map(s"elasticsearch.indexes.$rawIndexName.version" -> "1")).withFallback(config)
    val searchQueryer = new ElasticSearchQueryer(fakeIndices)
    val api = new Api(logger, searchQueryer)

    if (!dataSets.isEmpty) {
      client.execute(bulk(
        dataSets.map(dataSet ⇒
          index into indexName / fakeIndices.getType(Indices.DataSetsIndexType) id dataSet.identifier source dataSet.toJson)
      )).flatMap { _ ⇒
        client.execute(refreshIndex(indexName))
      }.map { _ ⇒
        blockUntilCount(dataSets.size, indexName)
        (indexName, dataSets, api.routes)
      } recover {
        case e: Throwable ⇒
          logger.error(e, "")
          throw e
      }
    } else Future.successful((indexName, List[DataSet](), api.routes))
  }

  def encodeForUrl(query: String) = java.net.URLEncoder.encode(query, "UTF-8")

  describe("searching") {
    describe("*") {
      it("should return all results") {
        forAll(indexGen) {
          case (indexName, dataSets, routes) ⇒
            Get(s"/datasets/search?query=*&limit=${dataSets.length}") ~> routes ~> check {
              status shouldBe OK
              contentType shouldBe `application/json`
              val response = responseAs[SearchResult]

              response.hitCount shouldEqual dataSets.length
              response.dataSets shouldEqual dataSets
            }
        }
      }

      it("hitCount should reflect all hits in the system, not just what is returned") {
        forAll(indexGen) {
          case (indexName, dataSets, routes) ⇒
            Get(s"/datasets/search?query=*&limit=${dataSets.length / 2}") ~> routes ~> check {
              val response = responseAs[SearchResult]

              response.hitCount shouldEqual dataSets.length
              response.dataSets should equal(dataSets.take(dataSets.length / 2))
            }
        }
      }
    }

    it("should return only filtered datasets with MatchAll, and only ones that wouldn't pass filter with MatchPart") {
      val filterQueryGen = queryGen
        .suchThat(query => query.dateFrom.isDefined || query.dateTo.isDefined || !query.formats.isEmpty || !query.publishers.isEmpty)

      forAll(indexGen, textQueryGen(filterQueryGen)) { (indexTuple, queryTuple) ⇒
        val (_, dataSets, routes) = indexTuple
        val (textQuery, query) = queryTuple
        Get(s"/datasets/search?query=${encodeForUrl(textQuery)}&limit=${dataSets.length}") ~> routes ~> check {
          val response = responseAs[SearchResult]

          response.dataSets.foreach { dataSet =>
            val temporal = dataSet.temporal
            val dataSetDateFrom = temporal.flatMap(innerTemporal => innerTemporal.start.flatMap(_.date).orElse(innerTemporal.end.flatMap(_.date)))
            val dateFromMatched = (query.dateTo, dataSetDateFrom) match {
              case (Some(innerQueryDateTo), Some(innerDataSetDateFrom)) => innerDataSetDateFrom.isBefore(innerQueryDateTo)
              case (Some(_), None) => false
              case _ => true
            }

            val dataSetDateTo = temporal.flatMap(innerTemporal => innerTemporal.end.flatMap(_.date).orElse(innerTemporal.start.flatMap(_.date)))
            val dateToMatched = (query.dateFrom, dataSetDateTo) match {
              case (Some(innerQueryDateFrom), Some(innerDataSetDateTo)) => innerDataSetDateTo.isAfter(innerQueryDateFrom)
              case (Some(_), None) => false
              case _ => true
            }

            val dataSetPublisherName = dataSet.publisher.flatMap(_.name)
            val publisherMatched = if (!query.publishers.isEmpty) {
              query.publishers.exists(queryPublisher =>
                dataSetPublisherName.map(_.equals(queryPublisher)).getOrElse(false)
              )
            } else true

            val formatMatched = if (!query.formats.isEmpty) {
              query.formats.exists(queryFormat =>
                dataSet.distributions.exists(distribution =>
                  distribution.format.map(_.equals(queryFormat)).getOrElse(false)
                )
              )
            } else true

            val allValid = dateFromMatched && dateToMatched && publisherMatched && formatMatched

            withClue(s"with query $textQuery and dataSet dateTo $dataSetDateTo dateFrom $dataSetDateFrom publisher ${dataSet.publisher} formats ${dataSet.distributions.map(_.format).mkString(",")}") {
              if (response.strategy.get == MatchAll) {
                allValid should be(true)
              } else if (query.quotes.isEmpty && query.freeText.isEmpty) {
                allValid should be(false)
              }
            }
          }
        }
      }
    }
  }

  describe("querying a dataset's title") {
    it("should return that dataset") {
      forAll(indexGen) {
        case (indexName, dataSetsRaw, routes) ⇒
          val indexedDataSets = dataSetsRaw.filter(dataSet ⇒ dataSet.title.isDefined && !dataSet.title.get.isEmpty())

          whenever(!indexedDataSets.isEmpty) {
            val dataSetsPicker = for (dataset ← Gen.oneOf(indexedDataSets)) yield dataset

            forAll(dataSetsPicker) { dataSet ⇒
              Get(s"""/datasets/search?query=${encodeForUrl(dataSet.title.get)}&limit=${dataSetsRaw.size}""") ~> routes ~> check {
                val result = responseAs[SearchResult]
                withClue(s"title: ${dataSet.title.get} and identifier: ${dataSet.identifier} in ${dataSetsRaw.map(_.title.getOrElse("(none)")).mkString(", ")}") {
                  result.dataSets.exists(_.identifier.equals(dataSet.identifier)) shouldBe true
                }
              }
            }
          }
      }
    }
  }

  describe("pagination") {
    it("should match the result of getting all datasets and using .drop(start).take(limit) to select a subset") {
      forAll(indexGen) {
        case (indexName, dataSets, routes) ⇒
          val dataSetCount = dataSets.size

          val starts = for (n ← Gen.choose(0, dataSetCount)) yield n
          val limits = for (n ← Gen.choose(0, dataSetCount)) yield n

          forAll(starts, limits) { (start, limit) ⇒
            whenever(start >= 0 && start <= dataSetCount && limit >= 0 && limit <= dataSetCount) {
              Get(s"/datasets/search?query=*&start=${start}&limit=${limit}") ~> routes ~> check {
                val result = responseAs[SearchResult]

                val expectedResultIdentifiers = dataSets.drop(start).take(limit).map(_.identifier)
                expectedResultIdentifiers shouldEqual result.dataSets.map(_.identifier)
              }
            }
          }
      }
    }
  }

  def consistentQuery(query: Query): Boolean = {
    def validString(string: String): Boolean = !string.contains("by") && !string.contains("to") && !string.contains("from") &&
      !string.contains(""""""") && !string.contains("as")

    query.productIterator.forall {
      case (x: String)    ⇒ validString(x)
      case (Some(x))      ⇒ validString(x.toString)
      case (xs: Set[Any]) ⇒ xs.forall(y ⇒ validString(y.toString))
      case _              ⇒ true
    }
  }

  describe("query") {
    it("should always be parsed correctly") {
      forAll(indexGen, textQueryGen()) { (indexTuple, queryTuple) ⇒
        val (textQuery, query) = queryTuple
        val (_, _, routes) = indexTuple

        whenever(validQuery(query) && consistentQuery(query)) {
          Get(s"/datasets/search?query=${encodeForUrl(textQuery)}") ~> routes ~> check {
            val response = responseAs[SearchResult]
            if (textQuery.equals("")) {
              response.query should equal(Query(freeText = Some("*")))
            } else {
              response.query should equal(query)
            }
          }
        }
      }
    }
  }

  def validQuery(objQuery: Query): Boolean = {
    objQuery.freeText.forall(_.matches(LUCENE_CONTROL_CHARACTER_REGEX)) &&
      objQuery.quotes.forall(_.matches(LUCENE_CONTROL_CHARACTER_REGEX)) &&
      objQuery.formats.forall(_.matches(LUCENE_CONTROL_CHARACTER_REGEX)) &&
      objQuery.publishers.forall(_.matches(LUCENE_CONTROL_CHARACTER_REGEX))
  }

  describe("facets") {
    val facetSizes = for (n ← Gen.choose(0, 10)) yield n

    def checkFacetsNoQuery(inner: (List[DataSet], Int) ⇒ Unit) = {
      forAll(indexGen, Gen.posNum[Int], Gen.posNum[Int], Gen.posNum[Int]) { (tuple, facetSize, start, limit) ⇒
        val (indexName, dataSets, routes) = tuple

        whenever(facetSize >= 0 && start >= 0 && limit >= 0) {
          Get(s"/datasets/search?query=*&start=$start&limit=$limit&facetSize=$facetSize") ~> routes ~> check {
            inner(dataSets, facetSize)
          }
        }
      }
    }

    def checkFacetsWithQuery(queryGen: Gen[(String, Query)] = textQueryGen())(inner: (List[DataSet], Int, Query, List[DataSet], Route) ⇒ Unit) = {
      forAll(indexGen, queryGen, Gen.posNum[Int]) { (tuple, query, rawFacetSize) ⇒
        val (indexName, dataSets, routes) = tuple
        val (textQuery, objQuery) = query
        val facetSize = Math.max(rawFacetSize, 1)

        whenever(validQuery(objQuery)) {
          Get(s"/datasets/search?query=${encodeForUrl(textQuery)}&start=0&limit=${dataSets.size}&facetSize=$facetSize") ~> routes ~> check {
            inner(responseAs[SearchResult].dataSets, facetSize, objQuery, dataSets, routes)
          }
        }
      }
    }

    def checkFacetsBoth(inner: (List[DataSet], Int) ⇒ Unit) = {
      it("with no query and various pagination values") {
        checkFacetsNoQuery(inner(_, _))
      }
      it("with a query") {
        checkFacetsWithQuery()((dataSets, facetSize, _, _, _) ⇒ inner(dataSets, facetSize))
      }
    }

    def specificFacetSpecs(facetType: FacetType, reducer: DataSet ⇒ Seq[String], queryCounter: Query ⇒ Int) = {
      def groupResult(dataSets: Seq[DataSet]): Map[String, Seq[DataSet]] = {
        dataSets.foldRight(Map[String, Seq[DataSet]]()) { (currentDataSet, aggregator) ⇒
          val reduced = reducer(currentDataSet) match {
            case Seq() ⇒ Seq("Unspecified")
            case xs    ⇒ xs
          }

          reduced.foldRight(aggregator) { (string, aggregator) ⇒
            aggregator + (string -> (aggregator.get(string) match {
              case Some(existingDataSets) ⇒ currentDataSet +: existingDataSets
              case None                   ⇒ Seq(currentDataSet)
            }))
          }
        }
      }

      def getFacet(result: SearchResult) = result.facets.get.find(_.id.equals(facetType.id)).get

      describe("all facet options should correspond with grouping the datasets for that query") {
        checkFacetsBoth { (dataSets: List[DataSet], facetSize: Int) ⇒
          val result = responseAs[SearchResult]

          val groupedResult = groupResult(dataSets)
          val facet = getFacet(result)

          withClue(s"With reduced values (${groupedResult.mapValues(_.size)})") {
            facet.options.foreach { facetOption ⇒
              withClue(s" and facetOption ${facetOption}: ") {
                if (facetOption.matched && facetOption.hitCount != 0) {
                  groupedResult.contains(facetOption.value) should be(true)
                  facetOption.hitCount should be(groupedResult(facetOption.value).size)
                }
              }
            }
          }
        }
      }

      describe("each dataset should be aggregated into a facet unless facet size was too small to accommodate it") {
        checkFacetsBoth { (dataSets: List[DataSet], facetSize: Int) ⇒
          val result = responseAs[SearchResult]
          val groupedResult = groupResult(dataSets)

          whenever(facetSize >= groupedResult.size + queryCounter(result.query)) {
            val facet = getFacet(result)

            withClue(s"With reduced values (${dataSets.map(reducer(_)).mkString(",")})") {
              groupedResult.mapValues(_.size).foreach {
                case (facetValue, hitCount) ⇒
                  withClue(s" and value $facetValue -> $hitCount: ") {
                    facet.options.exists(_.value.equals(facetValue)) should be(true)
                    facet.options.find(_.value.equals(facetValue)).get.hitCount should equal(hitCount)
                  }
              }
            }
          }
        }
      }
    }

    describe("should never generate a facet size bigger than what was asked for") {
      checkFacetsBoth { (dataSets: List[DataSet], facetSize: Int) ⇒
        val result = responseAs[SearchResult]
        val facets = FacetType.all.flatMap(facetType ⇒ result.facets.get.find(facetType.id.equals(_)))

        facets.foreach { facet ⇒
          facet.options.size should be <= facetSize
        }
      }
    }

    describe("publisher") {
      def reducer(dataSet: DataSet) = Seq(dataSet.publisher.flatMap(_.name)).flatten
      def queryToInt(query: Query) = query.publishers.size

      specificFacetSpecs(Publisher, reducer, queryToInt)
    }

    describe("year") {

      describe("should generate non-overlapping facets") {
        checkFacetsBoth { (dataSets, facetSize) ⇒
          val result = responseAs[SearchResult]
          val yearFacet = result.facets.get.find(_.id.equals(Year.id)).get

          val options = yearFacet.options

          val pairs = for {
            facet1 ← options
            facet2 ← options.filterNot(_ == facet1)
          } yield ((facet1.lowerBound.get, facet1.upperBound.get), (facet2.lowerBound.get, facet2.upperBound.get))

          pairs.foreach { pair ⇒
            val optionValues = options.map(_.value)
            val dataSetYears = dataSets.map(_.temporal.getOrElse("(no temporal)"))
            withClue(s"for options $optionValues and dataSet years $dataSetYears") {
              overlaps(pair) should be(false)
            }
          }
        }
      }

      describe("should be consistent with grouping all the facet results by temporal coverage year") {
        describe("for unmatched facets") {
          it("with no query") {
            checkFacetsNoQuery { (dataSets, facetSize) ⇒
              val result = responseAs[SearchResult]
              val yearFacet = result.facets.get.find(_.id.equals(Year.id)).get

              yearFacet.options.foreach { option ⇒
                val matchingDataSets = filterDataSetsForYearRange(dataSets, option.lowerBound.get, option.upperBound.get)

                val dataSetYears = dataSets.map(_.temporal.map(temporal ⇒ temporal.start.flatMap(_.date.map(_.getYear)) + "-" + temporal.end.flatMap(_.date.map(_.getYear))).getOrElse("(no temporal)"))

                withClue(s"For option ${option.value} and years $dataSetYears") {
                  matchingDataSets.size shouldEqual option.hitCount
                }
              }
            }
          }

          it("with a query") {
            checkFacetsWithQuery(textQueryGen(unspecificQueryGen)) { (dataSets, facetSize, query, allDataSets, routes) ⇒
              val outerResult = responseAs[SearchResult]
              val queryWithoutYears = query.copy(dateFrom = None, dateTo = None)
              val yearFacet = outerResult.facets.get.find(_.id.equals(Year.id)).get

              whenever(!queryWithoutYears.equals(Query())) {
                val textQueryWithoutYears = queryToText(queryWithoutYears)

                Get(s"/datasets/search?query=${encodeForUrl(textQueryWithoutYears)}&start=0&limit=${allDataSets.size}&facetSize=0") ~> routes ~> check {
                  val innerResult = responseAs[SearchResult]
                  val innerDataSets = innerResult.dataSets

                  whenever(innerResult.strategy.get.equals(outerResult.strategy.get) && innerResult.strategy.get.equals(MatchAll)) {
                    yearFacet.options.filter(!_.matched).foreach { option ⇒
                      val facetDataSets = filterDataSetsForYearRange(innerDataSets, option.lowerBound.get, option
                        .upperBound.get)
                      val dataSetYears = innerDataSets.map(_.temporal.map(temporal ⇒ temporal.start.flatMap(_.date.map(_.getYear)) + "-" + temporal.end.flatMap(_.date.map(_.getYear))).getOrElse("(no temporal)"))

                      withClue(s"For option ${option.value} and years $dataSetYears") {
                        facetDataSets.size shouldEqual option.hitCount
                      }
                    }
                  }
                }
              }
            }
          }
        }

        it("for matched facets") {
          checkFacetsWithQuery() { (dataSets, facetSize, query, allDataSets, routes) ⇒
            val result = responseAs[SearchResult]

            val yearFacet = result.facets.get.find(_.id.equals(Year.id)).get

            yearFacet.options.filter(_.matched).foreach { option ⇒
              val queryFilteredDataSets = filterDataSetsForDateRange(dataSets, query.dateFrom, query.dateTo)
              val facetDataSets = filterDataSetsForYearRange(queryFilteredDataSets, option.lowerBound.get, option
                .upperBound.get)

              val dataSetYears = facetDataSets.map(_.temporal.map(temporal ⇒ temporal.start.flatMap(_.date.map(_.getYear)) + "-" + temporal.end.flatMap(_.date.map(_.getYear))).getOrElse("(no temporal)"))

              withClue(s"For option ${option.value} and years $dataSetYears") {
                facetDataSets.size shouldEqual option.hitCount
              }
            }
          }
        }
      }

      describe("when no query") {
        it("should generate even facets") {
          checkFacetsNoQuery { (dataSets, facetSize) ⇒
            val result = responseAs[SearchResult]
            val yearFacet = result.facets.get.find(_.id.equals(Year.id)).get

            yearFacet.options.foreach { option ⇒
              val upperBound = option.upperBound.get.toInt
              val lowerBound = option.lowerBound.get.toInt
              val size = upperBound - lowerBound + 1

              option.value should equal(
                if (lowerBound == upperBound) lowerBound.toString
                else s"$lowerBound - " + s"$upperBound"
              )
              YearFacetDefinition.YEAR_BIN_SIZES should contain(size)
              if (facetSize > 1) withClue(s"[$lowerBound-$upperBound with size $size]") {
                lowerBound % size shouldEqual 0
              }
            }
          }
        }
        it("should only have gaps where there are no results") {
          checkFacetsNoQuery { (dataSets, facetSize) ⇒
            val result = responseAs[SearchResult]
            val yearFacet = result.facets.get.find(_.id.equals(Year.id)).get

            whenever(facetSize > 1 && yearFacet.options.size > 1) {
              yearFacet.options.reverse.sliding(2).foreach {
                case Seq(before, after) ⇒
                  val gap = after.lowerBound.get - before.upperBound.get
                  if (gap != 1) {
                    val options = yearFacet.options.map(_.value)
                    withClue(s"For facets ${options}") {
                      filterDataSetsForYearRange(dataSets, before.upperBound.get + 1, after.lowerBound.get - 1).size should equal(0)
                    }
                  }
              }
            }
          }
        }
      }

      def filterDataSetsForYearRange(dataSets: List[DataSet], lowerBound: Int, upperBound: Int) = dataSets
        .filter { dataSet ⇒
          val start = dataSet.temporal.flatMap(_.start).flatMap(_.date)
          val end = dataSet.temporal.flatMap(_.end).flatMap(_.date)

          (start.orElse(end), end.orElse(start)) match {
            case (Some(dataSetStart), Some(dataSetEnd)) ⇒
              dataSetStart.getYear <= upperBound && dataSetEnd.getYear >= lowerBound
            case _ ⇒ false
          }
        }

      def filterDataSetsForDateRange(dataSets: List[DataSet], lowerBound: Option[OffsetDateTime], upperBound: Option[OffsetDateTime]) = dataSets
        .filter { dataSet ⇒
          val startOption = dataSet.temporal.flatMap(_.start).flatMap(_.date)
          val endOption = dataSet.temporal.flatMap(_.end).flatMap(_.date)

          val start = startOption.orElse(endOption).getOrElse(OffsetDateTime.MAX)
          val end = endOption.orElse(startOption).getOrElse(OffsetDateTime.MIN)

          val lower = lowerBound.getOrElse(OffsetDateTime.MIN)
          val upper = upperBound.getOrElse(OffsetDateTime.MAX)

          !(start.isAfter(upper) || end.isBefore(lower))
        }

      def overlaps(tuple: ((Int, Int), (Int, Int))) = {
        val ((lowerBound1, upperBound1), (lowerBound2, upperBound2)) = tuple
        (lowerBound1 <= lowerBound2 && upperBound1 > lowerBound2) || (upperBound1 >= upperBound2 && lowerBound1 < upperBound2)
      }

      def formatYears(dataSet: DataSet) = s"${dataSet.temporal.flatMap(_.start.flatMap(_.date.map(_.getYear))).getOrElse("n/a")}-${dataSet.temporal.flatMap(_.end.flatMap(_.date.map(_.getYear))).getOrElse("n/a")}"

    }
  }

  def cleanUpIndexes() = {
    cleanUpQueue.iterator().forEachRemaining(
      new Consumer[String] {
        override def accept(indexName: String) = {
          logger.info(s"Deleting index $indexName")
          client.execute(deleteIndex(indexName)).await()
          cleanUpQueue.remove()
        }
      }
    )
  }

  after {
    cleanUpIndexes()
  }

  override def afterAll() = {
    super.afterAll()

    logger.info("cleaning up cache")

    Future.sequence((genCache.values).asScala.map(future ⇒
      future.flatMap {
        case (indexName, _, _) ⇒
          logger.debug("Deleting index {}", indexName)
          client.execute(deleteIndex(indexName))
      })).await(60 seconds)
  }
}
