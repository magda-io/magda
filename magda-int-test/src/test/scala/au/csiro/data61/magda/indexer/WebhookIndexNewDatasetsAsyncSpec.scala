package au.csiro.data61.magda.indexer

import akka.http.scaladsl.testkit.ScalatestRouteTest
import au.csiro.data61.magda.model.misc._
import spray.json._
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.test.MockServer
import com.typesafe.config.{Config, ConfigFactory}
import org.mockserver.model.{HttpRequest, HttpResponse}
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.{Created, OK}
import au.csiro.data61.magda.api.model.SearchResult
import org.scalatest.concurrent.Eventually
import org.scalatest.time.{Millis, Seconds, Span}

class WebhookIndexNewDatasetsAsyncSpec
    extends WebhookSpecBase
    with MockServer
    with ScalatestRouteTest
    with Eventually {
  override def buildConfig: Config =
    ConfigFactory
      .parseString(
        s"""
          indexer.asyncWebhook = true
          indexer.requestThrottleMs = 1
          registry.baseUrl = "http://localhost:${mockServer.getLocalPort}"
          """
      )
      .withFallback(super.buildConfig)
  describe("when webhook received") {
    it("should send defer response (async mode)") {
      forAll(dataSetsGen) {
        dataSets: List[(DataSet, List[(String, Double, Double, Double)])] =>
          implicit val config: Config = buildConfig
          mockServer.reset()
          val webhookId = config.getString("registry.webhookId")
          val ackPath = s"/v0/hooks/$webhookId/ack"
          mockServer
            .when(
              HttpRequest
                .request()
                .withMethod("POST")
                .withPath(ackPath)
            )
            .respond(
              HttpResponse
                .response()
                .withStatusCode(200)
            )

          val builtIndex = buildIndex()
          val lastEventId = 104856
          val payload = WebHookPayload(
            action = "records.changed",
            lastEventId = lastEventId,
            events = None,
            records = Some(dataSets.map(dataSetToRecord)),
            aspectDefinitions = None,
            deferredResponseUrl = Some("http://localhost/mock") // Not actually using deferredResponseUrl
          )

          // indexer should return a deferred response in async mode
          Post("/", payload) ~> addSingleTenantIdHeader ~> builtIndex.webhookApi.routes ~> check {
            status shouldBe Created
            responseAs[JsObject].fields("status") shouldBe JsString("Working")
            responseAs[JsObject].fields("deferResponse") shouldBe JsTrue
          }

          // An ack request should be sent after indexing
          eventually(timeout(Span(30, Seconds)), interval(Span(200, Millis))) {
            val ackRequests = mockServer.retrieveRecordedRequests(
              HttpRequest.request().withMethod("POST").withPath(ackPath)
            )
            val body = ackRequests.head.getBodyAsString
            val json = body.parseJson.asJsObject

            json.fields("succeeded") shouldBe JsTrue
            json.fields("lastEventIdReceived") shouldBe JsNumber(lastEventId)
          }

          // should successfully retrieve data
          eventually(timeout(Span(30, Seconds)), interval(Span(200, Millis))) {
            builtIndex.indexNames.foreach { idxName =>
              refresh(idxName)
            }

            blockUntilExactCount(dataSets.size, builtIndex.indexId)

            Get("/v0/datasets?query=*&limit=10000") ~> addSingleTenantIdHeader ~> builtIndex.searchApi.routes ~> check {
              status shouldBe OK
              val result = responseAs[SearchResult]
              result.dataSets.length shouldEqual dataSets.length
              result.dataSets.map(_.identifier).toSet shouldEqual dataSets
                .map(_._1.identifier)
                .toSet
            }
          }

          builtIndex.indexNames.foreach { idxName =>
            deleteIndex(idxName)
          }
      }
    }
  }
}
