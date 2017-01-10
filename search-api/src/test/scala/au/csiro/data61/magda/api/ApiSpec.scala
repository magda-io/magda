package au.csiro.data61.magda.api

import java.net.URL

import scala.concurrent.ExecutionContext
import scala.concurrent.Future
import scala.concurrent.duration._

import org.scalamock.proxy.ProxyMockFactory
import org.scalamock.scalatest.MockFactory

import org.scalatest._
import org.scalatest.Matchers._

import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.testkit.ElasticSugar
import com.typesafe.config.ConfigFactory

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.actor.Scheduler
import akka.event.Logging
import akka.event.LoggingAdapter
import akka.http.scaladsl.model.ContentTypes._
import akka.http.scaladsl.model.StatusCodes._
import akka.http.scaladsl.testkit.ScalatestRouteTest
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.crawler.Crawler
import au.csiro.data61.magda.external.ExternalInterface.ExternalInterfaceType
import au.csiro.data61.magda.external.FakeConfig
import au.csiro.data61.magda.external.InterfaceConfig
import au.csiro.data61.magda.search.SearchIndexer
import au.csiro.data61.magda.search.elasticsearch.ClientProvider
import au.csiro.data61.magda.search.elasticsearch.ElasticClientAdapter
import au.csiro.data61.magda.search.elasticsearch.ElasticClientTrait
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchQueryer
import java.util.Properties
import java.io.File
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.api.model.Protocols
import akka.http.scaladsl.model.HttpHeader

class ApiSpec extends FunSpec with Matchers with ScalatestRouteTest with MockFactory with ProxyMockFactory with ElasticSugar with BeforeAndAfter with Protocols {
  override def testConfigSource = "akka.loglevel = DEBUG"
  val logger = Logging(system, getClass)

  override def testConfig = ConfigFactory.empty()

  class Fixture {
    implicit object MockClientProvider extends ClientProvider {
      override def getClient(implicit scheduler: Scheduler, logger: LoggingAdapter, ec: ExecutionContext): Future[ElasticClientTrait] = Future(new ElasticClientAdapter(client))
    }

    val properties = new Properties()
    properties.setProperty("regionLoading.cachePath", new File("./../magda-metadata-indexer/regions").getAbsolutePath())
    val generatedConf = ConfigFactory.parseProperties(properties)

    implicit val config = generatedConf.withFallback(AppConfig.conf(Some("test")))

    val indexer = SearchIndexer(MockClientProvider, config)
    val searchQueryer = ElasticSearchQueryer.apply
    val api = new Api(logger, searchQueryer)
    val routes = api.routes

    val interfaceConfigs = Seq(
      InterfaceConfig(config.getConfig("indexedServices.test"))
    )

    val crawler = new Crawler(interfaceConfigs, indexer)

    crawler.crawl().await(100 seconds)
  }

  def fixture = new Fixture

  describe("standard query") {

    it("should respond to query") {

      Get(s"/datasets/search?query=*") ~> fixture.routes ~> check {
        status shouldBe OK
        contentType shouldBe `application/json`

        val blah = responseAs[SearchResult]

        blah.hitCount.toInt should be > 0
      }
    }
  }
}
