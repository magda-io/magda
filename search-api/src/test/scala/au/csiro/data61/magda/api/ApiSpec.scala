package au.csiro.data61.magda.api

import java.io.File
import java.util.Properties
import java.util.concurrent.ConcurrentHashMap

import akka.actor.{ActorSystem, Scheduler}
import akka.event.{Logging, LoggingAdapter}
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.ContentTypes.`application/json`
import akka.http.scaladsl.model.StatusCodes.OK
import akka.http.scaladsl.server.Route
import akka.http.scaladsl.testkit.{RouteTestTimeout, ScalatestRouteTest}
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.api.model.{Protocols, SearchResult}
import au.csiro.data61.magda.model.misc.{DataSet, _}
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import au.csiro.data61.magda.search.elasticsearch._
import au.csiro.data61.magda.test.util.Generators._
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.testkit.ElasticSugar
import com.typesafe.config.{Config, ConfigFactory}
import org.elasticsearch.common.settings.Settings
import org.scalacheck.Shrink._
import org.scalacheck._
import org.scalactic.anyvals.PosInt
import org.scalatest.{BeforeAndAfter, Matchers, _}
import org.scalatest.prop.GeneratorDrivenPropertyChecks
import spray.json._

import scala.collection.JavaConverters._
import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration.DurationInt
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.function.Consumer

class ApiSpec extends FlatSpec with Matchers with ScalatestRouteTest with ElasticSugar with BeforeAndAfter with BeforeAndAfterAll with Protocols with GeneratorDrivenPropertyChecks {
  override def testConfigSource = "akka.loglevel = WARN"
  val INSERTION_WAIT_TIME = 45 seconds
  //  override def indexRefresh = - 1 seconds
  val logger = Logging(system, getClass)
  val processors = PosInt.from(Runtime.getRuntime().availableProcessors() / 2).get
  //      val processors = PosInt.from(1).get
  logger.info("Running with {} processors", processors.toString)
  implicit override val generatorDrivenConfig = PropertyCheckConfiguration(workers = processors, minSuccessful = 50, sizeRange = 100)
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
  //      .put("index.refresh_interval", "-1")

  //      .put("gateway.type", "none")

  override def blockUntil(explain: String)(predicate: () => Boolean): Unit = {

    var backoff = 0
    var done = false

    while (backoff <= 10 && !done) {
      backoff = backoff + 1
      try {
        done = predicate()

        if (!done) {
          println(s"Waiting another ${200 * backoff}ms for $explain")
          Thread.sleep(200 * (backoff))
        } else {
          println(s"$explain is true, proceeding.")
        }
      } catch {
        case e: Throwable =>
          logger.error(e, "")
          throw e
      }
    }

    require(done, s"Failed waiting on: $explain")
  }

  def configWith(newProps: Map[String, String]): Config = {
    ConfigFactory.parseProperties(
      newProps.foldRight(new Properties()) { (current: (String, String), properties: Properties) =>
        properties.setProperty(current._1, current._2)
        properties
      }
    )
  }
  //  object DataSetGen {
  //    val cache: Map[Int, (String, List[DataSet])] = Map()
  //
  //    def gen: Gen[(String, DataSet)] = Gen.parameterized { params => 
  //      params.pos
  //    }
  //    
  //    
  //  }

  //  val indexGen: Gen[(List[DataSet], Route)] = Gen.parameterized(params => indexGenInner(params.size))

  var generatedIndexCount = 0

  var genCache: ConcurrentHashMap[Int, Future[(String, List[DataSet], Route)]] = new ConcurrentHashMap()

  case class FakeIndices(rawIndexName: String) extends Indices {
    override def getIndex(config: Config, index: Indices.Index): String = rawIndexName
  }

  implicit def indexShrinker(implicit s: Shrink[String], s1: Shrink[List[DataSet]], s2: Shrink[Route]): Shrink[(String, List[DataSet], Route)] = Shrink[(String, List[DataSet], Route)] {
    case (indexName, dataSets, route) =>
      println(s"preshrink: ${dataSets.size}")
      shrink(dataSets).map(dataSets => {
        println(s"postshrink: ${dataSets.size}")
        val result = putDataSetsInIndex(dataSets).await(INSERTION_WAIT_TIME)

        cleanUpQueue.add(result._1)

        result
      })
  }

  def indexGen: Gen[(String, List[DataSet], Route)] =
    Gen.delay {
      Gen.size.flatMap { size =>
        val cacheKey = if (size < 10) size
        else if (size < 50) size - size % 5
        else size - size % 10

        Option(genCache.get(cacheKey)) match {
          //                  Option.empty[Future[(List[DataSet], Route)]] match {
          case None =>
            Gen.listOfN(size, dataSetGen).map { dataSetsRaw =>
              val dataSets = dataSetsRaw.groupBy(_.identifier).mapValues(_.head).values.toList
              val dataSetCount = dataSets.size
              println(s"Cache miss for for ${cacheKey}")
              genCache.put(cacheKey, putDataSetsInIndex(dataSets))
              genCache.get(cacheKey).await(INSERTION_WAIT_TIME)
            }
          case Some(cachedValue) =>
            val value = cachedValue.await(INSERTION_WAIT_TIME)

            println(s"Cache hit for ${cacheKey}: ${value._2.size}")

            value
        }
      }
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
        dataSets.map(dataSet =>
          index into indexName / fakeIndices.getType(Indices.DataSetsIndexType) id dataSet.identifier source dataSet.toJson)
      )).flatMap { _ =>
        client.execute(refreshIndex(indexName))
      }.map { _ =>
        blockUntilCount(dataSets.size, indexName)
        (indexName, dataSets, api.routes)
      } recover {
        case e: Throwable =>
          logger.error(e, "")
          throw e
      }
    } else Future.successful((indexName, List[DataSet](), api.routes))
  }
  //
  //  val blah3Gen = blah2Gen.flatMap { listOfLists =>
  //    Gen.oneOf(listOfLists)
  //  }

  //  def indexGenInner(size: Int) = Gen.listOfN(size, dataSetGen)
  //    .map { dataSetsRaw =>
  //      println(s"Generating for $size")
  //      val dataSets = dataSetsRaw.groupBy(_.identifier).mapValues(_.head).values.toList
  //      val rawIndexName = java.util.UUID.randomUUID.toString
  //      implicit val thisConf = configWith(Map(s"elasticsearch.indexes.$rawIndexName.version" -> "1")).withFallback(config)
  //      val indexName = rawIndexName + 1
  //      val searchQueryer = new ElasticSearchQueryer(new Indices(rawIndexName, "regions"))
  //      val api = new Api(logger, searchQueryer)
  //      val routes = api.routes
  //
  //      client.execute(IndexDefinition.datasets.definition(Some(indexName))).await(30 seconds)
  //      blockUntilGreen()
  //      blockUntilIndexExists(indexName)
  //
  //      if (!dataSets.isEmpty) {
  //        client.execute(bulk(
  //          dataSets.map(dataSet =>
  //            index into indexName / IndexDefinition.datasets.name id dataSet.identifier source dataSet.toJson
  //          )
  //        )).recover {
  //          case e: Throwable =>
  //            logger.error(e, "")
  //            throw e
  //        }.await(30 seconds)
  //      }
  //
  //      Thread.sleep(1100)
  //      blockUntilCount(dataSets.length, indexName)
  //
  //      (dataSets, routes)
  //    }

  //  val blahGen = blah2Gen

  def encodeForUrl(query: String) = java.net.URLEncoder.encode(query, "UTF-8")

  "searching *" should "return all results" in {
    forAll(indexGen) {
      case (indexName, dataSets, routes) =>
        Get(s"/datasets/search?query=*&limit=${dataSets.length}") ~> routes ~> check {
          status shouldBe OK
          contentType shouldBe `application/json`
          val response = responseAs[SearchResult]
          println(s"${response.hitCount} / ${dataSets.length}")

          response.hitCount shouldEqual dataSets.length
          response.dataSets shouldEqual dataSets
        }
    }
  }

  "hitCount" should "reflect all hits in the system, not just what is returned" in {
    forAll(indexGen) {
      case (indexName, dataSets, routes) =>
        Get(s"/datasets/search?query=*&limit=${dataSets.length / 2}") ~> routes ~> check {
          val response = responseAs[SearchResult]

          response.hitCount shouldEqual dataSets.length
          response.dataSets should equal(dataSets.take(dataSets.length / 2))
        }
    }
  }

  "querying a dataset's title" should "return that dataset" in {
    forAll(indexGen) {
      case (indexName, dataSetsRaw, routes) =>
        val dataSets = dataSetsRaw.filter(dataSet => dataSet.title.isDefined && !dataSet.title.get.isEmpty())

        whenever(!dataSets.isEmpty) {
          val dataSetsPicker = for (dataset <- Gen.oneOf(dataSets)) yield dataset

          forAll(dataSetsPicker) { dataSet =>
            Get(s"""/datasets/search?query=${encodeForUrl(dataSet.title.get)}&limit=${dataSets.size}""") ~> routes ~> check {
              val result = responseAs[SearchResult]
              result.dataSets.exists(_.identifier.equals(dataSet.identifier)) shouldBe true
            }
          }
        }
    }
  }

  "pagination" should "match the result of getting all datasets and using .drop(start).take(limit) to select a subset" in {
    forAll(indexGen) {
      case (indexName, dataSets, routes) =>
        val dataSetCount = dataSets.size

        val starts = for (n <- Gen.choose(0, dataSetCount)) yield n
        val limits = for (n <- Gen.choose(0, dataSetCount)) yield n

        forAll(starts, limits) { (start, limit) =>
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

  val queryGen = descWordGen.flatMap(Gen.oneOf(_))
  val facetSizes = for (n <- Gen.choose(1, 10)) yield n

  "publisher facet" should "be consistent with grouping all the facet results by publisher id" in {
    forAll(indexGen, queryGen, facetSizes) { (tuple, query, facetSize) =>
      val (indexName, dataSets, routes) = tuple

      whenever(facetSize > 0 && query.matches("""[^.,\\/#!$%\\^&\\*;:{}=\\-_`~()\\[\\]"']*""")) {
        Get(s"/datasets/search?query=${encodeForUrl(query)}&start=0&limit=${dataSets.size}&facetSize=$facetSize") ~> routes ~> check {
          val result = responseAs[SearchResult]
          val groupedResult = result.dataSets.groupBy(_.publisher.map(_.name.getOrElse("Unspecified")).getOrElse("Unspecified"))
          val publisherFacet = result.facets.get.find(_.id.equals(Publisher.id)).get

          publisherFacet.options.size should be <= facetSize

          val facetMinimal = publisherFacet.options.map(facet => (facet.value, facet.hitCount))

          facetMinimal shouldEqual groupedResult.mapValues(_.size).toList.sortBy(_._1).sortBy(-_._2).take(facetSize)
        }
      }
    }
  }

  "year facet" should "generate even, non-overlapping facets" in {
    forAll(indexGen, queryGen, facetSizes) { (tuple, query, facetSize) =>
      val (indexName, dataSets, routes) = tuple

      whenever(facetSize > 0 && query.matches("""[^.,\\/#!$%\\^&\\*;:{}=\\-_`~()\\[\\]"']*""")) {
        Get(s"/datasets/search?query=${encodeForUrl(query)}&start=0&limit=${dataSets.size}&facetSize=$facetSize") ~> routes ~> check {
          val result = responseAs[SearchResult]
          val yearFacet = result.facets.get.find(_.id.equals(Year.id)).get
          yearFacet.options.size should be <= facetSize

          yearFacet.options.foreach { option =>
            val upperBound = option.upperBound.get.toInt
            val lowerBound = option.lowerBound.get.toInt
            val size = upperBound - lowerBound + 1

            option.value should equal(s"$lowerBound - $upperBound")
            YearFacetDefinition.YEAR_BIN_SIZES should contain(size)
            if (facetSize > 1) withClue(s"[$lowerBound-$upperBound with size $size]") { lowerBound % size shouldEqual 0 }
          }

          if (facetSize > 1)
            yearFacet.options.sliding(2).foreach {
              case Seq(higherOption, lowerOption) =>
                lowerOption.upperBound.get.toInt shouldEqual higherOption.lowerBound.get.toInt - 1
            }
        }
      }
    }
  }

  "year facet" should "be consistent with grouping all the facet results by temporal coverage year" in {
    forAll(indexGen, queryGen, facetSizes) { (tuple, query, facetSize) =>
      val (indexName, dataSets, routes) = tuple

      whenever(facetSize > 0 && query.matches("""[^.,\\/#!$%\\^&\\*;:{}=\\-_`~()\\[\\]"']*""")) {
        Get(s"/datasets/search?query=${encodeForUrl(query)}&start=0&limit=${dataSets.size}&facetSize=$facetSize") ~> routes ~> check {
          val result = responseAs[SearchResult]
          val yearFacet = result.facets.get.find(_.id.equals(Year.id)).get

          yearFacet.options.foreach { option =>
            val matchingDatasets = result.dataSets
              .filter(x => x.temporal.isDefined && (x.temporal.get.start.isDefined || x.temporal.get.end.isDefined))
              .filter(dataSet => dataSet.temporal.get.start.orElse(dataSet.temporal.get.end).get.date.get.getYear <= option.upperBound.get.toInt)
              .filter(dataSet => dataSet.temporal.get.end.orElse(dataSet.temporal.get.start).get.date.get.getYear >= option.lowerBound.get.toInt)

            matchingDatasets.size shouldEqual option.hitCount
          }
        }
      }
    }
  }

  "format" should "be consistent with grouping all the facet results by format" in {
    forAll(indexGen, queryGen, facetSizes) { (tuple, query, facetSize) =>
      val (indexName, dataSets, routes) = tuple

      whenever(facetSize > 0 && query.matches("""[^.,\\/#!$%\\^&\\*;:{}=\\-_`~()\\[\\]"']*""")) {
        Get(s"/datasets/search?query=${encodeForUrl(query)}&start=0&limit=${dataSets.size}&facetSize=$facetSize") ~> routes ~> check {
          val result = responseAs[SearchResult]
          val formatFacet = result.facets.get.find(_.id.equals(Format.id)).get

          formatFacet.options.foreach { option =>
            val matchingDatasets = result.dataSets
              .filter(_.distributions.exists(_.format.map(_.equalsIgnoreCase(option.value)).getOrElse(false)))

            matchingDatasets.size shouldEqual option.hitCount
          }
        }
      }
    }
  }

  val cleanUpQueue = new ConcurrentLinkedQueue[String]()

  def cleanUpIndexes() = {
    cleanUpQueue.iterator().forEachRemaining(
      new Consumer[String] {
        override def accept(indexName: String) = {
          println(s"Deleting index $indexName")
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

    println("cleaning up cache")

    Future.sequence((genCache.values).asScala.map(future =>
      future.flatMap { case (indexName, _, _) => client.execute(deleteIndex(indexName)) })).await(60 seconds)
  }
}
