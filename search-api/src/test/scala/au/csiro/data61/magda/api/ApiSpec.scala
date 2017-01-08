package au.csiro.data61.magda.api

import java.net.URL

import scala.concurrent.ExecutionContext
import scala.concurrent.Future
import scala.concurrent.duration._

import org.scalamock.proxy.ProxyMockFactory
import org.scalamock.scalatest.MockFactory
import org.scalatest._

import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.testkit.ElasticSugar
import com.typesafe.config.ConfigFactory

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

class ApiSpec extends FunSpec with Matchers with ScalatestRouteTest with MockFactory with ProxyMockFactory with ElasticSugar with BeforeAndAfter {
  override def testConfigSource = "akka.loglevel = DEBUG"
  val logger = Logging(system, getClass)

  override def testConfig = ConfigFactory.empty()

  class Fixture {
    implicit object MockClientProvider extends ClientProvider {
      override def getClient(implicit scheduler: Scheduler, logger: LoggingAdapter, ec: ExecutionContext): Future[ElasticClientTrait] = Future(new ElasticClientAdapter(client))
    }
    val config = AppConfig.conf(Some("test"), true)
    val indexer = SearchIndexer(MockClientProvider, config)
    val searchQueryer = ElasticSearchQueryer(config)
    val api = new Api(logger, config, searchQueryer)
    val routes = api.routes

    val interfaceConfigs = Seq(
      new InterfaceConfig(
        name = "fake",
        interfaceType = ExternalInterfaceType.CKAN,
        baseUrl = new URL("http://example.com"),
        pageSize = 20,
        landingPageUrl = _ => "http://example.com",
        fakeConfig = Some(new FakeConfig(
          datasetPath = "/dga1000.json",
          mimeType = "application/json"
        )),
        raw = config
      )
    )

    val crawler = new Crawler(system, config, interfaceConfigs, materializer, indexer)

    crawler.crawl().await(100 seconds)
  }

  def fixture = new Fixture

  //  override lazy val ipApiConnectionFlow = Flow[HttpRequest].map { request =>
  //    if (request.uri.toString().endsWith(ip1Info.query))
  //      HttpResponse(status = OK, entity = marshal(ip1Info))
  //    else if (request.uri.toString().endsWith(ip2Info.query))
  //      HttpResponse(status = OK, entity = marshal(ip2Info))
  //    else
  //      HttpResponse(status = BadRequest, entity = marshal("Bad ip format"))
  //  }

  describe("standard query") {
    //    before {
    //
    //      client.execute {
    //        IndexDefinition.datasets.definition()
    //      }.await
    //
    //      val futureInsert1 = client.execute {
    //        index into "jtull/albums" fields ("name" -> "aqualung") id 14
    //      }
    //
    //      val futureInsert2 = client.execute {
    //        index into "jtull/albums" fields ("name" -> "passion play") id 51
    //      }
    //
    //      val futureInserts = for {
    //        insert1 <- futureInsert1
    //        insert2 <- futureInsert2
    //      } yield blockUntilCount(2, "jtull")
    //    }

    it("should respond to query") {
      //      (fixture.mockEsClient.execute(_: SearchDefinition)(_: Executable[SearchDefinition, _, RichSearchResponse]))
      //        .expects(where {x : SearchDefinition => x._builder.}, *)
      //        .returning(Future(new RichSearchResponse(new SearchResponse())))

      Get(s"/datasets/search?query=hello") ~> fixture.routes ~> check {
        status shouldBe OK
        contentType shouldBe `application/json`
        //      responseAs[IpInfo] shouldBe ip1Info
      }
    }
  }
}
