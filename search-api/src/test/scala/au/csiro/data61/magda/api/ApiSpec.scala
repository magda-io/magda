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
import org.scalatest.prop.PropertyChecks
import org.scalacheck.Gen

class ApiSpec extends FunSpec with Matchers with ScalatestRouteTest with ElasticSugar with BeforeAndAfter with Protocols with PropertyChecks {
  override def testConfigSource = "akka.loglevel = DEBUG"
  val RESULT_COUNT = 100
  val logger = Logging(system, getClass)

  override def testConfig = ConfigFactory.empty()

  class Fixture {
    implicit object MockClientProvider extends ClientProvider {
      override def getClient(implicit scheduler: Scheduler, logger: LoggingAdapter, ec: ExecutionContext): Future[ElasticClientTrait] = Future(new ElasticClientAdapter(client))
    }

    val properties = new Properties()
    properties.setProperty("regionLoading.cachePath", new File("./src/test/resources").getAbsolutePath())
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

    Thread.sleep(500)
  }

  val fixture = new Fixture

  describe("query") {
    it("* should return all results") {
      Get(s"/datasets/search?query=*") ~> fixture.routes ~> check {
        status shouldBe OK
        contentType shouldBe `application/json`
        responseAs[SearchResult].hitCount shouldEqual RESULT_COUNT
      }
    }

    it("querying a datasets title should return that dataset first") {
      Get(s"/datasets/search?query=*") ~> fixture.routes ~> check {
        val dataSets = for (dataset <- Gen.oneOf(responseAs[SearchResult].dataSets)) yield dataset

        forAll(dataSets) { dataSet =>
          Get(s"/datasets/search?query=${java.net.URLEncoder.encode(dataSet.title.get, "UTF-8")}") ~> fixture.routes ~> check {
            val result = responseAs[SearchResult]
            result.dataSets.head.identifier shouldEqual (dataSet.identifier)
          }
        }
      }
    }
  }

  describe("pagination") {
    Get(s"/datasets/search?query=*&start=0&limit=$RESULT_COUNT") ~> fixture.routes ~> check {
      val originalResult = responseAs[SearchResult]

      it("should match the result of getting all datasets and using .drop(start).take(limit) to select a subset") {
        val starts = for (n <- Gen.choose(0, RESULT_COUNT)) yield n
        val limits = for (n <- Gen.choose(0, RESULT_COUNT)) yield n

        forAll(starts, limits) { (start, limit) =>
          whenever(start >= 0 && start <= RESULT_COUNT && limit >= 0 && limit <= RESULT_COUNT) {
            Get(s"/datasets/search?query=*&start=${start}&limit=${limit}") ~> fixture.routes ~> check {
              val result = responseAs[SearchResult]

              val expectedResultIdentifiers = originalResult.dataSets.drop(start).take(limit).map(_.identifier)

              expectedResultIdentifiers shouldEqual result.dataSets.map(_.identifier)
            }
          }
        }
      }
    }
  }
}
