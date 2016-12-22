package ai.csiro.data61.magda.api

import akka.actor.Scheduler
import akka.event.{Logging, LoggingAdapter, NoLogging}
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.ContentTypes._
import akka.http.scaladsl.model.StatusCodes._
import akka.http.scaladsl.model.{HttpRequest, HttpResponse}
import akka.http.scaladsl.testkit.ScalatestRouteTest
import akka.stream.scaladsl.Flow
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.MagdaApp.getClass
import au.csiro.data61.magda.api.Api
import au.csiro.data61.magda.search.elasticsearch.{ClientProvider, ElasticClientTrait, ElasticSearchQueryer}
import com.sksamuel.elastic4s.ElasticClient
import org.elasticsearch.client.ElasticsearchClient
import org.scalamock.proxy.ProxyMockFactory
import org.scalamock.scalatest.MockFactory
import org.scalatest._

import scala.concurrent.{ExecutionContext, Future}

class ApiSpec extends FlatSpec with Matchers with ScalatestRouteTest with MockFactory with ProxyMockFactory {
  //  override def testConfigSource = "akka.loglevel = DEBUG"
  val logger = Logging(system, getClass)

  implicit val config = AppConfig.conf

  val mockEsClient = mock[ElasticClientTrait]
  implicit object MockClientProvider extends ClientProvider {
    override def getClient(implicit scheduler: Scheduler, logger: LoggingAdapter, ec: ExecutionContext): Future[ElasticClientTrait] = Future(mockEsClient)
  }

  val searchQueryer = new ElasticSearchQueryer()
  val api = new Api(logger, config, searchQueryer)
  val routes = api.routes

  //  override lazy val ipApiConnectionFlow = Flow[HttpRequest].map { request =>
  //    if (request.uri.toString().endsWith(ip1Info.query))
  //      HttpResponse(status = OK, entity = marshal(ip1Info))
  //    else if (request.uri.toString().endsWith(ip2Info.query))
  //      HttpResponse(status = OK, entity = marshal(ip2Info))
  //    else
  //      HttpResponse(status = BadRequest, entity = marshal("Bad ip format"))
  //  }

  it should "respond to query" in {
    Get(s"/datasets/search?query=hello") ~> routes ~> check {
      status shouldBe OK
      contentType shouldBe `application/json`
      //      responseAs[IpInfo] shouldBe ip1Info
    }

  }

}
