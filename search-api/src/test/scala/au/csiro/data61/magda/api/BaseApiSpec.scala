package au.csiro.data61.magda.api

import java.net.URL
import java.util.Properties
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.function.Consumer

import scala.collection.JavaConversions.mapAsJavaMap
import scala.concurrent.ExecutionContext
import scala.concurrent.Future
import scala.concurrent.duration.DurationInt

import org.elasticsearch.cluster.health.ClusterHealthStatus
import org.scalacheck.Gen
import org.scalacheck.Shrink
import org.scalatest.BeforeAndAfter
import org.scalatest.BeforeAndAfterAll
import org.scalatest.FunSpec
import org.scalatest.Matchers

import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.TcpClient
import com.sksamuel.elastic4s.testkit.SharedElasticSugar
import com.typesafe.config.Config
import com.typesafe.config.ConfigFactory

import akka.actor.ActorSystem
import akka.actor.Scheduler
import akka.event.Logging
import akka.event.LoggingAdapter
import akka.http.scaladsl.server.Route
import akka.http.scaladsl.testkit.RouteTestTimeout
import akka.http.scaladsl.testkit.ScalatestRouteTest
import akka.stream.scaladsl.Source
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.api.model.Protocols
import au.csiro.data61.magda.external.InterfaceConfig
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.search.elasticsearch.ClientProvider
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchIndexer
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchQueryer
import au.csiro.data61.magda.search.elasticsearch.IndexDefinition
import au.csiro.data61.magda.search.elasticsearch.Indices
import au.csiro.data61.magda.search.elasticsearch.RegionLoader
import au.csiro.data61.magda.spatial.RegionSource
import au.csiro.data61.magda.test.util.ApiGenerators.indexedRegionsGen
import au.csiro.data61.magda.test.util.ApiGenerators.textQueryGen
import au.csiro.data61.magda.test.util.Generators
import au.csiro.data61.magda.test.util.MagdaGeneratorTest
import spray.json.JsObject
import au.csiro.data61.magda.search.elasticsearch.DefaultIndices
import au.csiro.data61.magda.test.util.TestActorSystem


trait BaseApiSpec extends FunSpec with Matchers with ScalatestRouteTest with SharedElasticSugar with BeforeAndAfter with BeforeAndAfterAll with Protocols with MagdaGeneratorTest {
  val INSERTION_WAIT_TIME = 90 seconds
  implicit def default(implicit system: ActorSystem) = RouteTestTimeout(60 seconds)
  val indexedRegions = BaseApiSpec.indexedRegions
  implicit val config = TestActorSystem.config

  override def createActorSystem(): ActorSystem = TestActorSystem.actorSystem

  val logger = Logging(system, getClass)

  implicit object MockClientProvider extends ClientProvider {
    override def getClient(implicit scheduler: Scheduler, logger: LoggingAdapter, ec: ExecutionContext): Future[TcpClient] = Future(client)
  }

  val cleanUpQueue = new ConcurrentLinkedQueue[String]()

  override def beforeAll() {
    if (!doesIndexExists(DefaultIndices.getIndex(config, Indices.RegionsIndex))) {

      client.execute(
        IndexDefinition.regions.definition(DefaultIndices, config)
      ).await

      val fakeRegionLoader = new RegionLoader {
        override def setupRegions(): Source[(RegionSource, JsObject), _] = Source.fromIterator(() => BaseApiSpec.indexedRegions.toIterator)
      }

      logger.info("Setting up regions")
      IndexDefinition.setupRegions(client, fakeRegionLoader, DefaultIndices).await(60 seconds)
      logger.info("Finished setting up regions")
    }
  }

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
    override def getIndex(config: Config, index: Indices.Index): String = index match {
      case Indices.DataSetsIndex => rawIndexName
      case _                     => DefaultIndices.getIndex(config, index)
    }
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
    textQueryGen(Gen.const(query)).retryUntil(_ => true).sample.get._1
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

  def emptyIndexGen: Gen[(String, List[DataSet], Route)] =
    Gen.delay {
      genIndexForSize(0)
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
          val dataSets = Gen.listOfN(size, Generators.dataSetGen).retryUntil(_ => true).sample.get
          putDataSetsInIndex(dataSets).await(INSERTION_WAIT_TIME)
        }

        BaseApiSpec.genCache.put(cacheKey, future)
        logger.info("Cache miss for {}", cacheKey)

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
    (cacheKey, Option(BaseApiSpec.genCache.get(cacheKey)))
  }

  def putDataSetsInIndex(dataSets: List[DataSet]): Future[(String, List[DataSet], Route)] = {
    val rawIndexName = java.util.UUID.randomUUID.toString
    val fakeIndices = FakeIndices(rawIndexName)

    val indexName = fakeIndices.getIndex(config, Indices.DataSetsIndex)
    val searchQueryer = new ElasticSearchQueryer(fakeIndices)
    val api = new Api(logger, searchQueryer)
    val indexer = new ElasticSearchIndexer(MockClientProvider, fakeIndices)

    if (!dataSets.isEmpty) {
      indexer.index(new InterfaceConfig("test-catalog", "blah", new URL("http://example.com"), 23), dataSets)
        .flatMap { _ ⇒
          client.execute(refreshIndex(indexName))
        }.map { _ ⇒
          blockUntilNotRed()
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
          logger.debug(s"Deleting index $indexName")
          client.execute(ElasticDsl.deleteIndex(indexName)).await()
          cleanUpQueue.remove()
        }
      }
    )
  }

  after {
    cleanUpIndexes()
  }
}

object BaseApiSpec {
  val indexedRegions = indexedRegionsGen.retryUntil(_ => true).sample.get
  val genCache: ConcurrentHashMap[Int, Future[(String, List[DataSet], Route)]] = new ConcurrentHashMap()
}
