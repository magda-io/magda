package au.csiro.data61.magda.registry

import akka.http.scaladsl.Http
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.Directives.{as, complete, entity, post}
import akka.http.scaladsl.server.Route
import spray.json.JsObject

import scala.collection.mutable.ArrayBuffer
import scala.concurrent.Await
import scala.concurrent.duration._
import scala.util.Random
import au.csiro.data61.magda.model.Registry._

class WebHookProcessorSpec extends ApiSpec {
  private val processor = new WebHookProcessor(system, executor)

  it("includes aspectDefinitions if events modified them") { param =>
    testWebHook(param.api, None) { payloads =>
      val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
      Post("/api/0.1/aspects", aspectDefinition) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val result = Await.result(processor.sendNotifications(), 5 seconds)
      result.foreach {
        case (webHook, processingResult) => {
          webHook.name shouldBe "test"
          processingResult.failedPosts shouldBe 0
          processingResult.successfulPosts shouldBe 1
        }
      }
      payloads.length shouldBe 1
      payloads(0).events.get.length shouldBe 1
      payloads(0).records.get.length shouldBe 0
      payloads(0).aspectDefinitions.get.length shouldBe 1
      payloads(0).aspectDefinitions.get(0).id shouldBe ("testId")
    }
  }

  it("includes records if events modified them") { param =>
    testWebHook(param.api, None) { payloads =>
      val record = Record("testId", "testName", Map())
      Post("/api/0.1/records", record) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val result = Await.result(processor.sendNotifications(), 5 seconds)
      result.foreach {
        case (webHook, processingResult) => {
          webHook.name shouldBe "test"
          processingResult.failedPosts shouldBe 0
          processingResult.successfulPosts shouldBe 1
        }
      }
      payloads.length shouldBe 1
      payloads(0).events.get.length shouldBe 1
      payloads(0).records.get.length shouldBe 1
      payloads(0).records.get(0).id shouldBe ("testId")
      payloads(0).aspectDefinitions.get.length shouldBe 0
    }
  }

  private def testWebHook(api: Api, webHook: Option[WebHook])(testCallback: ArrayBuffer[WebHookPayload] => Unit): Unit = {
    val payloads = ArrayBuffer[WebHookPayload]()
    val route = post {
      entity(as[WebHookPayload]) { payload =>
        payloads.append(payload)
        complete("got it")
      }
    }
    val server = createHookRoute(route)

    val hook = webHook.getOrElse(WebHook(
      id = None,
      userId = None,
      name = "test",
      active = true,
      lastEvent = None,
      url = "http://localhost:" + server.localAddress.getPort.toString,
      eventTypes = EventType.values.toSet,
      config = WebHookConfig(
        includeEvents = Some(true),
        includeRecords = Some(true),
        includeAspectDefinitions = Some(true)
      )))
    Post("/api/0.1/hooks", hook) ~> api.routes ~> check {
      status shouldEqual StatusCodes.OK
    }

    try {
      testCallback(payloads)
    } finally {
      server.unbind()
    }
  }

  private def createHookRoute(route: Route): Http.ServerBinding = {
    val http = Http()

    val random = new Random()

    var serverBinding: Option[Http.ServerBinding] = None
    var tries = 0

    while (serverBinding.isEmpty && tries < 10) {
      val port = random.nextInt(1000)
      val bindingFuture = http.bindAndHandle(route, "localhost", 30000 + port)
      Await.ready(bindingFuture, 5 seconds)
      serverBinding = bindingFuture.value.get.toOption
      tries += 1
    }

    if (serverBinding.isEmpty) {
      throw new RuntimeException("Could not bind to a port in the 30000-31000 range after 10 tries.")
    }

    serverBinding.get
  }
}
