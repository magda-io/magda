package au.csiro.data61.magda.test.api

import java.net.URL

import scala.collection.mutable
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
import org.scalatest.{FunSpec, FunSuite}
import org.scalatest.Matchers
import com.sksamuel.elastic4s.http.HttpClient
import com.typesafe.config.{Config, ConfigFactory, ConfigValueFactory}
import akka.actor.ActorSystem
import akka.actor.Scheduler
import akka.event.Logging
import akka.event.LoggingAdapter
import akka.http.scaladsl.server.Route
import akka.http.scaladsl.testkit.RouteTestTimeout
import akka.http.scaladsl.testkit.ScalatestRouteTest
import akka.stream.scaladsl.Source
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.search.elasticsearch._
import au.csiro.data61.magda.spatial.RegionSource
import au.csiro.data61.magda.test.util.Generators
import au.csiro.data61.magda.test.util.MagdaGeneratorTest
import spray.json.JsObject
import au.csiro.data61.magda.test.util.TestActorSystem
import au.csiro.data61.magda.spatial.RegionLoader
import au.csiro.data61.magda.test.util.MagdaElasticSugar
import com.sksamuel.elastic4s.http.ElasticDsl._
import org.scalatest.BeforeAndAfterEach

trait BaseApiSpec extends FunSpec with Matchers with ScalatestRouteTest with MagdaElasticSugar with BeforeAndAfterEach with BeforeAndAfterAll with MagdaGeneratorTest {
  implicit def default(implicit system: ActorSystem) = RouteTestTimeout(300 seconds)
  def buildConfig = TestActorSystem.config
  override def createActorSystem(): ActorSystem = TestActorSystem.actorSystem
  val logger = Logging(system, getClass)
  implicit val indexedRegions = BaseApiSpec.indexedRegions

  val node = getNode
  implicit val config = buildConfig.withValue("elasticSearch.serverUrl", ConfigValueFactory.fromAnyRef(s"elasticsearch://${node.host}:${node.port}"))

  val clientProvider = new DefaultClientProvider

  override def client(): HttpClient = clientProvider.getClient().await

  override def beforeAll() {

    blockUntilNotRed()

    if (!doesIndexExists(DefaultIndices.getIndex(config, Indices.RegionsIndex))) {

      client.execute(
        IndexDefinition.regions.definition(DefaultIndices, config)
      ).await(90 seconds)

      val fakeRegionLoader = new RegionLoader {
        override def setupRegions(): Source[(RegionSource, JsObject), _] = Source.fromIterator(() => BaseApiSpec.indexedRegions.toIterator)
      }

      logger.info("Setting up regions")
      IndexDefinition.setupRegions(client, fakeRegionLoader, DefaultIndices).await(60 seconds)
      logger.info("Finished setting up regions")
    }

    System.gc()
  }

  override def afterAll() {
    System.gc()
  }

  implicit object MockClientProvider extends ClientProvider {
    override def getClient(): Future[HttpClient] = Future(client)
  }

  def blockUntilNotRed(): Unit = {
    blockUntil("Expected cluster to have NOT RED status") { () =>
      client.execute {
        clusterHealth()
      }.await(90 seconds) match {
        case Right(r) => r.result.status != ClusterHealthStatus.RED
        case Left(f) => false
      }
    }
  }

  def blockUntilNotYellow(): Unit = {
    blockUntil("Expected cluster to have green status") { () =>
      client.execute {
        clusterHealth()
      }.await(90 seconds) match {
        case Right(r) => r.result.status != ClusterHealthStatus.RED && r.result.status != ClusterHealthStatus.YELLOW
        case Left(f) => false
      }
    }
  }

  override def blockUntil(explain: String)(predicate: () ⇒ Boolean): Unit = {
    var backoff = 0
    var done = false

    while (backoff <= 20 && !done) {
      backoff = backoff + 1
      try {
        done = predicate()

        if (!done) {
          logger.debug(s"Waiting another {}ms for {}", 500 * backoff, explain)
          Thread.sleep(500 * (backoff))
        } else {
          logger.debug(s"{} is true, proceeding.", explain)
        }
      } catch {
        case e: Throwable ⇒
          logger.error("", e)
          throw e
      }
    }

    if (!done) {
      fail(s"Failed waiting on: $explain")
    }
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
      case Indices.DataSetsIndex => s"dataset-idx-${rawIndexName}"
      case Indices.PublishersIndex => s"publisher-idx-${rawIndexName}"
      case Indices.FormatsIndex => s"format-idx-${rawIndexName}"
      case _ => DefaultIndices.getIndex(config, index)
    }
  }
}

object BaseApiSpec {
  val qld = {
    import spray.json._
    (new RegionSource("ithinkthisisregiontype",new URL("http://example.com"), "STE_CODE11", "STE_NAME11", Some("STE_ABBREV"), false, false, 10), """
      {"type":"Feature","properties":{"STE_NAME11":"Queensland","STE_CODE11":"3","STE_ABBREV":"QLD"},"geometry":{"type":"Polygon","coordinates":[[[142.4,-10.7],[141.5,-13.6],[141.6,-15.1],[140.8,-17.5],[139.9,-17.7],[139,-17.3],[137.9,-16.4],[137.9,-26],[140.9,-26],[141,-29],[148.9,-28.9],[150,-28.6],[150.8,-28.7],[151.3,-29.1],[151.9,-28.9],[152,-28.6],[152.5,-28.4],[153.4,-28.2],[152.9,-27.4],[153,-26],[152.4,-24.9],[150.9,-23.6],[150.5,-22.4],[149.5,-22.3],[149.1,-21],[147.4,-19.5],[146.2,-18.9],[145.8,-17.3],[145.2,-16.3],[145.3,-15],[144.4,-14.2],[143.6,-14.3],[143.4,-12.7],[142.4,-10.7]]]}}
    """.parseJson.asJsObject)
  }
  val indexedRegions = Generators.indexedRegionsGen(mutable.HashMap.empty).retryUntil(_ => true).sample.get :+ qld
}
