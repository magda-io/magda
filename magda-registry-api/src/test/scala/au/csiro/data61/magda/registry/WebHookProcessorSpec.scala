package au.csiro.data61.magda.registry

import akka.http.scaladsl.Http
import akka.http.scaladsl.Http.ServerBinding
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.Directives.{as, complete, entity, post}
import akka.http.scaladsl.server.Route
import spray.json.{JsObject, JsString, JsonParser}

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
      Post("/v0/aspects", aspectDefinition) ~> param.api.routes ~> check {
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
      Post("/v0/records", record) ~> param.api.routes ~> check {
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

  it("does not duplicate records or aspect definitions") { param =>
    testWebHook(param.api, None) { payloads =>
      val a = AspectDefinition("A", "A", Some(JsObject()))
      Post("/v0/aspects", a) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val aModified = a.copy(name = "A modified")
      Put("/v0/aspects/A", aModified) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("testId", "testName", Map())
      Post("/v0/records", record) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val modified = record.copy(name = "new name")
      Put("/v0/records/testId", modified) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val withAspect = modified.copy(aspects = Map("A" -> JsObject()))
      Put("/v0/records/testId", withAspect) ~> param.api.routes ~> check {
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
      payloads(0).events.get.length shouldBe 5
      payloads(0).records.get.length shouldBe 1
      payloads(0).records.get(0).id shouldBe ("testId")
      payloads(0).aspectDefinitions.get.length shouldBe 1
      payloads(0).aspectDefinitions.get(0).id shouldBe ("A")
    }
  }

  describe("dereference") {
    it("includes a record when one of its distributions changes") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A"))))
      testWebHook(param.api, Some(webHook)) { payloads =>
        val jsonSchema =
          """
            |{
            |    "$schema": "http://json-schema.org/hyper-schema#",
            |    "title": "An aspect with a single link",
            |    "type": "object",
            |    "properties": {
            |        "someLink": {
            |            "title": "A link to another record.",
            |            "type": "string",
            |            "links": [
            |                {
            |                    "href": "/api/v0/registry/records/{$}",
            |                    "rel": "item"
            |                }
            |            ]
            |        }
            |    }
            |}
          """.stripMargin
        val a = AspectDefinition("A", "A", Some(JsonParser(jsonSchema).asJsObject))
        Post("/v0/aspects", a) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val dataset = Record("dataset", "dataset", Map())
        Post("/v0/records", dataset) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val distribution = Record("distribution", "distribution", Map())
        Post("/v0/records", distribution) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val result1 = Await.result(processor.sendNotifications(), 5 seconds)
        result1.foreach {
          case (webHook, processingResult) => {
            webHook.name shouldBe "test"
            processingResult.failedPosts shouldBe 0
            processingResult.successfulPosts shouldBe 1
          }
        }

        payloads.clear()

        val recordWithLink = dataset.copy(aspects = Map("A" -> JsObject("someLink" -> JsString("target"))))
        Put("/v0/records/dataset", recordWithLink) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val result2 = Await.result(processor.sendNotifications(), 5 seconds)
        result2.foreach {
          case (webHook, processingResult) => {
            webHook.name shouldBe "test"
            processingResult.failedPosts shouldBe 0
            processingResult.successfulPosts shouldBe 1
          }
        }

        payloads.length shouldBe 1
        payloads(0).events.get.length shouldBe 1
        payloads(0).records.get.length shouldBe 1
        payloads(0).records.get(0).id shouldBe ("dataset")
      }
    }
  }

  private val defaultWebHook = WebHook(
    id = None,
    userId = None,
    name = "test",
    active = true,
    lastEvent = None,
    url = "",
    eventTypes = EventType.values.toSet,
    config = WebHookConfig(
      includeEvents = Some(true),
      includeRecords = Some(true),
      includeAspectDefinitions = Some(true),
      dereference = Some(true)
    ))

  private def testWebHook(api: Api, webHook: Option[WebHook])(testCallback: ArrayBuffer[WebHookPayload] => Unit): Unit = {
    val payloads = ArrayBuffer[WebHookPayload]()
    val route = post {
      entity(as[WebHookPayload]) { payload =>
        payloads.append(payload)
        complete("got it")
      }
    }
    val server = createHookRoute(route)

    val hook = webHook.getOrElse(defaultWebHook).copy(url = "http://localhost:" + server.localAddress.getPort.toString)
    Post("/v0/hooks", hook) ~> api.routes ~> check {
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
