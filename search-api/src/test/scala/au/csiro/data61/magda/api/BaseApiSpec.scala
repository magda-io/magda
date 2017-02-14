package au.csiro.data61.magda.api

import java.io.File
import java.util.Properties
import akka.actor.{ ActorSystem, Scheduler }
import akka.event.{ Logging, LoggingAdapter }
import akka.http.scaladsl.server.Route
import akka.http.scaladsl.testkit.{ RouteTestTimeout, ScalatestRouteTest }
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.model.misc.{ DataSet, _ }
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import au.csiro.data61.magda.search.elasticsearch._
import au.csiro.data61.magda.test.util.Generators._
import com.sksamuel.elastic4s.testkit.ElasticSugar
import com.typesafe.config.{ Config, ConfigFactory }
import org.scalacheck.Shrink
import org.scalacheck._
import org.scalactic.anyvals.PosInt
import org.scalatest.{ BeforeAndAfter, Matchers, _ }
import org.scalatest.prop.GeneratorDrivenPropertyChecks
import spray.json._
import scala.concurrent.{ ExecutionContext, Future }
import scala.concurrent.duration.DurationInt
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.function.Consumer
import com.sksamuel.elastic4s.TcpClient
import com.sksamuel.elastic4s.ElasticDsl
import org.elasticsearch.cluster.health.ClusterHealthStatus
import au.csiro.data61.magda.api.model.Protocols
import org.elasticsearch.index.cache.IndexCache
import java.util.concurrent.ConcurrentHashMap

class BaseApiSpec extends FunSpec with Matchers with ScalatestRouteTest with ElasticSugar with BeforeAndAfter with BeforeAndAfterAll with Protocols with GeneratorDrivenPropertyChecks {
  override def testConfigSource = "akka.loglevel = WARN"
  val isCi = Option(System.getenv("CI")).map(_.equals("true")).getOrElse(false)
  val INSERTION_WAIT_TIME = 60 seconds
  val logger = Logging(system, getClass)
  val processors = Math.max(Runtime.getRuntime().availableProcessors(), 2)

  implicit override val generatorDrivenConfig: PropertyCheckConfiguration =
    if (isCi) {
      logger.info("Running with {} processors with minSuccessful={}", processors.toString, 100)
      PropertyCheckConfiguration(workers = PosInt.from(processors).get, sizeRange = PosInt(50), minSuccessful = PosInt(20))
    } else {
      logger.info("Running with {} processors with minSuccessful={}", processors.toString, 20)
      PropertyCheckConfiguration(workers = PosInt.from(processors).get, sizeRange = PosInt(50), minSuccessful = PosInt(100))
    }
  implicit def default(implicit system: ActorSystem) = RouteTestTimeout(60 seconds)

  val genCache: ConcurrentHashMap[Int, Future[(String, List[DataSet], Route)]] = new ConcurrentHashMap()
  val generatedConf = ConfigFactory.empty() // Can add specific config here.
  implicit val config = generatedConf.withFallback(AppConfig.conf(Some("local")))
  override def testConfig = config

  implicit object MockClientProvider extends ClientProvider {
    override def getClient(implicit scheduler: Scheduler, logger: LoggingAdapter, ec: ExecutionContext): Future[TcpClient] = Future(client)
  }

  val cleanUpQueue = new ConcurrentLinkedQueue[String]()

  //  def configureSettings() =
  //    Settings.builder()
  //      .put("cluster.routing.allocation.disk.watermark.high", "100%")
  //      .put("cluster.routing.allocation.disk.watermark.low", "100%")
  //      .put("discovery.zen.ping.multicast", "false")
  //      .put("index.store.fs.memory.enabled", "true")
  //      .put("index.gateway.type", "none")
  //      .put("index.store.throttle.type", "none")
  //      .put("index.translog.disable_flush", "true")
  //      .put("index.memory.index_buffer_size", "50%")
  //      .put("index.refresh_interval", "-1")
  //      .build()
  //

  def blockUntilNotRed(): Unit = {
    blockUntil("Expected cluster to have green status") { () =>
      val status = client.execute {
        clusterHealth()
      }.await.getStatus
      status != ClusterHealthStatus.RED
    }
  }

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
      Shrink.shrink(dataSets).map(shrunkDataSets ⇒ {
        logger.info("Shrunk datasets to size {} from {}", shrunkDataSets.size, dataSets.size)

        val result = putDataSetsInIndex(shrunkDataSets).await(INSERTION_WAIT_TIME)
        cleanUpQueue.add(result._1)
        result
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
      Shrink.shrink(queryObj).map { shrunkQuery ⇒
        (queryToText(shrunkQuery), shrunkQuery)
      }
  }

  def indexGen: Gen[(String, List[DataSet], Route)] =
    Gen.delay {
      Gen.size.flatMap { size ⇒
        genIndexForSize(size)
      }
    }

  def smallIndexGen: Gen[(String, List[DataSet], Route)] =
    Gen.delay {
      Gen.size.flatMap { size ⇒
        genIndexForSize(Math.round(Math.sqrt(size.toDouble).toFloat))
      }
    }

  def mediumIndexGen: Gen[(String, List[DataSet], Route)] =
    Gen.delay {
      Gen.size.flatMap { size ⇒
        genIndexForSize(Math.round(Math.sqrt(size.toDouble).toFloat) * 5)
      }
    }

  def genIndexForSize(size: Int): (String, List[DataSet], Route) =
    getFromIndexCache(size) match {
      case (cacheKey, None) ⇒
        val future = Future {
          val dataSets = Gen.listOfN(size, dataSetGen).retryUntil(_ => true).sample.get
          putDataSetsInIndex(dataSets).await(INSERTION_WAIT_TIME)
        }

        genCache.put(cacheKey, future)
        logger.info("Cache miss for {}", cacheKey)
        //        print(IndexCache.genCache.keys())

        future.await(INSERTION_WAIT_TIME)
      case (cacheKey, Some(cachedValue)) ⇒
        logger.info("Cache hit for {}", cacheKey)

        val value = cachedValue.await(INSERTION_WAIT_TIME)

        value
    }

  def getFromIndexCache(size: Int): (Int, Option[Future[(String, List[DataSet], Route)]]) = {
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
    client.execute(IndexDefinition.dataSets.definition(Some(indexName)).singleReplica().singleShard()).await
    blockUntilNotRed()

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
  def cleanUpIndexes() = {
    cleanUpQueue.iterator().forEachRemaining(
      new Consumer[String] {
        override def accept(indexName: String) = {
          logger.info(s"Deleting index $indexName")
          client.execute(ElasticDsl.deleteIndex(indexName)).await()
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

    //    Future.sequence((IndexCache.genCache.values).asScala.map { future: Future[(String, List[DataSet], Route)] ⇒
    //      future.flatMap {
    //        case (indexName, _, _) ⇒
    //          logger.debug("Deleting index {}", indexName)
    //          client.execute(ElasticDsl.deleteIndex(indexName))
    //      }
    //    }).await(60 seconds)
  }
}
