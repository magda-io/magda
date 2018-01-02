package au.csiro.data61.magda.registry

import scala.collection.mutable.ArrayBuffer
import scala.concurrent.Await
import scala.concurrent.duration._
import scala.util.Random

import akka.actor.ActorRef
import akka.http.scaladsl.Http
import akka.http.scaladsl.Http.ServerBinding
import akka.http.scaladsl.marshalling.ToResponseMarshallable
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.Directives.as
import akka.http.scaladsl.server.Directives.complete
import akka.http.scaladsl.server.Directives.entity
import akka.http.scaladsl.server.Directives.post
import akka.http.scaladsl.server.Directives.path
import akka.http.scaladsl.server.Route
import akka.pattern.ask
import akka.util.Timeout
import au.csiro.data61.magda.model.Registry._
import spray.json.JsObject
import spray.json.JsString
import spray.json.JsonParser
import java.util.UUID

class WebHookProcessorSpec extends ApiSpec {

  it("includes aspectDefinitions if events modified them") { param =>
    testWebHook(param, None) { (payloads, actor) =>
      val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
      param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      Util.waitUntilDone(actor, "test")

      payloads.length shouldBe 1
      payloads(0).events.get.length shouldBe 1
      payloads(0).records.get.length shouldBe 0
      payloads(0).aspectDefinitions.get.length shouldBe 1
      payloads(0).aspectDefinitions.get(0).id shouldBe ("testId")
    }
  }

  it("includes records if events modified them") { param =>
    testWebHook(param, None) { (payloads, actor) =>
      val record = Record("testId", "testName", Map())
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      Util.waitUntilDone(actor, "test")

      payloads.length shouldBe 1
      payloads(0).events.get.length shouldBe 1
      payloads(0).records.get.length shouldBe 1
      payloads(0).records.get(0).id shouldBe ("testId")
      payloads(0).aspectDefinitions.get.length shouldBe 0
    }
  }

  it("includes records only for events modifying aspects that were requested") { param =>
    val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A", "B"))))
    testWebHook(param, Some(webHook)) { (payloads, actor) =>
      val a = AspectDefinition("A", "A", Some(JsObject()))
      param.asAdmin(Post("/v0/aspects", a)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val b = AspectDefinition("B", "B", Some(JsObject()))
      param.asAdmin(Post("/v0/aspects", b)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("yep"))))
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      Util.waitUntilDone(actor, "test")

      payloads.clear()

      val modified = record.copy(aspects = Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("new value"))))
      param.asAdmin(Put("/v0/records/testId", modified)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      Util.waitUntilDone(actor, "test")

      payloads.length shouldBe 1
      payloads(0).events.get.length shouldBe 1
      payloads(0).records.get.length shouldBe 1
      payloads(0).aspectDefinitions.get.length shouldBe 0
    }
  }

  it("does not duplicate records") { param =>
    testWebHook(param, None) { (payloads, actor) =>
      val jsonSchema =
        """
                |{
                |    "$schema": "http://json-schema.org/hyper-schema#",
                |    "title": "An aspect",
                |    "type": "object",
                |    "properties": {
                |        "a": {
                |            "title": "A test",
                |            "type": "string"
                |        }
                |    }
                |}
              """.stripMargin
      val a = AspectDefinition("A", "A", Some(JsonParser(jsonSchema).asJsObject))
      param.asAdmin(Post("/v0/aspects", a)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      Util.waitUntilDone(actor, "test")
      payloads.length shouldBe 1
      payloads.clear()

      val record = Record("testId", "testName", Map())
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val modified = record.copy(name = "new name")
      param.asAdmin(Put("/v0/records/testId", modified)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      for (i <- 1 to 50) {
        val withAspect = modified.copy(aspects = Map("A" -> JsObject(Map("a" -> JsString(i.toString)))))
        param.asAdmin(Put("/v0/records/testId", withAspect)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }
      }
      
      Util.waitUntilDone(actor, "test")

      val events = payloads.foldLeft(List[RegistryEvent]())((a, payload) => payload.events.getOrElse(Nil) ++ a)
      events.length shouldBe 52
      val records = payloads.foldLeft(List[Record]())((a, payload) => payload.records.getOrElse(Nil) ++ a)
      records.length shouldBe payloads.length
      records.map(_.id).distinct.length shouldBe 1
      records.map(_.id).distinct.head shouldBe "testId"
    }
  }

  it("does not duplicate aspect definitions") { param =>
    testWebHook(param, None) { (payloads, actor) =>
      val jsonSchema =
        """
                |{
                |    "$schema": "http://json-schema.org/hyper-schema#",
                |    "title": "An aspect",
                |    "type": "object",
                |    "properties": {
                |        "a": {
                |            "title": "A test",
                |            "type": "string"
                |        }
                |    }
                |}
              """.stripMargin
      val a = AspectDefinition("A", "A", Some(JsonParser(jsonSchema).asJsObject))
      param.asAdmin(Post("/v0/aspects", a)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      Util.waitUntilDone(actor, "test")
      payloads.length shouldBe 1
      payloads.clear()

      for (i <- 1 to 50) {
        val withAspect = a.copy(name = i.toString)
        param.asAdmin(Put("/v0/aspects/A", withAspect)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }
      }

      Util.waitUntilDone(actor, "test")

      val events = payloads.foldLeft(List[RegistryEvent]())((a, payload) => payload.events.getOrElse(Nil) ++ a)
      events.length shouldBe 50
      val aspects = payloads.foldLeft(List[AspectDefinition]())((a, payload) => payload.aspectDefinitions.getOrElse(Nil) ++ a)
      aspects.length shouldBe payloads.length
      aspects.map(_.id).distinct.length shouldBe 1
      aspects.map(_.id).distinct.head shouldBe "A"
    }
  }

  describe("dereference") {
    it("includes a record when a distribution is added to it") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A"))))
      testWebHook(param, Some(webHook)) { (payloads, actor) =>
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
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val dataset = Record("dataset", "dataset", Map())
        param.asAdmin(Post("/v0/records", dataset)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val distribution = Record("distribution", "distribution", Map())
        param.asAdmin(Post("/v0/records", distribution)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.clear()

        val recordWithLink = dataset.copy(aspects = Map("A" -> JsObject("someLink" -> JsString("distribution"))))
        param.asAdmin(Put("/v0/records/dataset", recordWithLink)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.length shouldBe 1
        payloads(0).events.get.length shouldBe 1
        payloads(0).records.get.length shouldBe 1
        payloads(0).records.get(0).id shouldBe ("dataset")
      }
    }

    it("includes a record when one of its distributions is modified") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A"))))
      testWebHook(param, Some(webHook)) { (payloads, actor) =>
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
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val distribution = Record("distribution", "distribution", Map())
        param.asAdmin(Post("/v0/records", distribution)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val dataset = Record("dataset", "dataset", Map("A" -> JsObject("someLink" -> JsString("distribution"))))
        param.asAdmin(Post("/v0/records", dataset)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.clear()

        val modifiedDistribution = distribution.copy(name = "new name")
        param.asAdmin(Put("/v0/records/distribution", modifiedDistribution)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.length shouldBe 1
        payloads(0).events.get.length shouldBe 1
        payloads(0).records.get.length shouldBe 1
        payloads(0).records.get(0).id shouldBe ("dataset")
      }
    }

    it("includes a record when one of its distribution's aspects is modified") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A"))))
      testWebHook(param, Some(webHook)) { (payloads, actor) =>
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
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val b = AspectDefinition("B", "B", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val distribution = Record("distribution", "distribution", Map("B" -> JsObject("value" -> JsString("something"))))
        param.asAdmin(Post("/v0/records", distribution)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val dataset = Record("dataset", "dataset", Map("A" -> JsObject("someLink" -> JsString("distribution"))))
        param.asAdmin(Post("/v0/records", dataset)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.clear()

        val modifiedDistribution = distribution.copy(aspects = Map("B" -> JsObject("value" -> JsString("different"))))
        param.asAdmin(Put("/v0/records/distribution", modifiedDistribution)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.length shouldBe 1
        payloads(0).events.get.length shouldBe 1
        payloads(0).records.get.length shouldBe 1
        payloads(0).records.get(0).id shouldBe ("dataset")
      }
    }

    it("with multiple linking aspects, only one has to link to a modified record") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A", "B"))))
      testWebHook(param, Some(webHook)) { (payloads, actor) =>
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
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val b = AspectDefinition("B", "B", Some(JsonParser(jsonSchema).asJsObject))
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val distribution = Record("distribution", "distribution", Map())
        param.asAdmin(Post("/v0/records", distribution)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val dataset = Record("dataset", "dataset", Map("A" -> JsObject("someLink" -> JsString("distribution")), "B" -> JsObject()))
        param.asAdmin(Post("/v0/records", dataset)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.clear()

        val modifiedDistribution = distribution.copy(name = "new name")
        param.asAdmin(Put("/v0/records/distribution", modifiedDistribution)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.length shouldBe 1
        payloads(0).events.get.length shouldBe 1
        payloads(0).records.get.length shouldBe 1
        payloads(0).records.get(0).id shouldBe ("dataset")
      }
    }

    it("includes all aspects of linked records, not just the requested aspects") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A"))))
      testWebHook(param, Some(webHook)) { (payloads, actor) =>
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
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val b = AspectDefinition("B", "B", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val distribution = Record("distribution", "distribution", Map("B" -> JsObject("foo" -> JsString("bar"))))
        param.asAdmin(Post("/v0/records", distribution)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val dataset = Record("dataset", "dataset", Map("A" -> JsObject("someLink" -> JsString("distribution"))))
        param.asAdmin(Post("/v0/records", dataset)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.clear()

        val modifiedDistribution = distribution.copy(name = "new name")
        param.asAdmin(Put("/v0/records/distribution", modifiedDistribution)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }
        
        Util.waitUntilDone(actor, "test")

        payloads.length shouldBe 1
        payloads(0).events.get.length shouldBe 1
        payloads(0).records.get.length shouldBe 1
        payloads(0).records.get(0).id shouldBe ("dataset")

        val embeddedDistribution = payloads(0).records.get(0).aspects("A").fields("someLink").asJsObject
        val bAspect = embeddedDistribution.fields("aspects").asJsObject.fields("B").asJsObject
        bAspect.fields("foo").asInstanceOf[JsString].value shouldBe ("bar")
      }
    }
  }

  describe("resumes hooks that have previously failed") {
    describe("sync") {
      val dataset = Record("dataset", "dataset", Map())

      def doTestSync(param: FixtureParam)(resumeHook: ArrayBuffer[WebHookPayload] => Any) {
        var responseCount = 0
        def response(): ToResponseMarshallable = {
          responseCount += 1

          if (responseCount == 1) {
            StatusCodes.NotFound
          } else {
            "got it"
          }
        }

        testWebHookWithResponse(param, Some(defaultWebHook), response) { (payloads, actor) =>
          param.asAdmin(Post("/v0/records", dataset)) ~> param.api.routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilDone(actor, "test")

          payloads.length shouldBe (1)

          param.asAdmin(Get("/v0/hooks/" + defaultWebHook.id.get)) ~> param.api.routes ~> check {
            status shouldEqual StatusCodes.OK
            val hook = responseAs[WebHook]
            hook.lastEvent.get shouldBe (1)
            payloads.last.lastEventId shouldBe (2)
          }

          resumeHook(payloads)
        }
      }

      it("when subscriber posts /ack") { param =>
        doTestSync(param) { payloads =>
          param.asAdmin(Post("/v0/hooks/" + defaultWebHook.id.get + "/ack", WebHookAcknowledgement(false))) ~> param.api.routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilDone(param.webHookActor, "test")
          payloads.length shouldBe (2)
          payloads.last.lastEventId shouldBe (2)

          param.asAdmin(Get("/v0/hooks/" + defaultWebHook.id.get)) ~> param.api.routes ~> check {
            status shouldEqual StatusCodes.OK
            val hook = responseAs[WebHook]
            hook.lastEvent.get shouldBe (2)
          }
        }
      }

      it("when actor is sent Process() (i.e. on registry startup)") { param =>
        doTestSync(param) { payloads =>
          param.webHookActor ! WebHookActor.Process(true)

          Util.waitUntilDone(param.webHookActor, "test")

          payloads.length shouldBe (2)
          payloads.last.lastEventId shouldBe (2)
        }
      }

      it("when new event is created") { param =>
        doTestSync(param) { payloads =>
          param.asAdmin(Put("/v0/records/" + dataset.id, dataset.copy(name = "blah"))) ~> param.api.routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilDone(param.webHookActor, "test")
          payloads.length shouldBe (2)

          param.asAdmin(Get("/v0/hooks/" + defaultWebHook.id.get)) ~> param.api.routes ~> check {
            status shouldEqual StatusCodes.OK
            val hook = responseAs[WebHook]
            hook.lastEvent.get shouldBe (3)
            payloads.last.lastEventId shouldBe (3)
          }
        }
      }
    }

    describe("async") {
      val dataset = Record("dataset", "dataset", Map())

      def doTestAsync(param: FixtureParam)(resumeHook: ArrayBuffer[WebHookPayload] => Any) {
        testAsyncWebHook(param, Some(defaultWebHook)) { (payloads, actor) =>
          param.asAdmin(Post("/v0/records", dataset)) ~> param.api.routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilDone(actor, "test")

          payloads.length shouldBe (1)

          param.asAdmin(Get("/v0/hooks/" + defaultWebHook.id.get)) ~> param.api.routes ~> check {
            status shouldEqual StatusCodes.OK
            val hook = responseAs[WebHook]
            hook.lastEvent.get shouldBe (1)
            hook.isWaitingForResponse.get shouldBe (true)
            payloads.last.lastEventId shouldBe (2)
          }

          resumeHook(payloads)
        }
      }

      it("when subscriber posts /ack") { param =>
        doTestAsync(param) { payloads =>
          param.asAdmin(Post("/v0/hooks/" + defaultWebHook.id.get + "/ack", WebHookAcknowledgement(false))) ~> param.api.routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilDone(param.webHookActor, "test")
          payloads.length shouldBe (2)
          payloads.last.lastEventId shouldBe (2)

          param.asAdmin(Get("/v0/hooks/" + defaultWebHook.id.get)) ~> param.api.routes ~> check {
            status shouldEqual StatusCodes.OK
            val hook = responseAs[WebHook]

            // We haven't told the registry that we've successfully processed it, so the hook should still be at event 1
            hook.lastEvent.get shouldBe (1)
            hook.isWaitingForResponse.get shouldBe (true)
          }
        }
      }

      it("when actor is sent Process() (i.e. on registry startup)") { param =>
        doTestAsync(param) { payloads =>
          param.webHookActor ! WebHookActor.Process(true)

          Util.waitUntilDone(param.webHookActor, "test")

          payloads.length shouldBe (2)
          payloads.last.lastEventId shouldBe (2)
        }
      }

      it("should not resume when new event is created, but should include both events when resumed") { param =>
        doTestAsync(param) { payloads =>
          param.asAdmin(Put("/v0/records/" + dataset.id, dataset.copy(name = "blah2"))) ~> param.api.routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilDone(param.webHookActor, "test")
          payloads.length shouldBe (1)

          param.asAdmin(Post("/v0/hooks/" + defaultWebHook.id.get + "/ack", WebHookAcknowledgement(false))) ~> param.api.routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilDone(param.webHookActor, "test")

          payloads.length shouldBe (2)
          payloads.last.lastEventId shouldBe (3)
        }
      }
    }
  }

  describe("async web hooks") {
    it("delays further notifications until previous one is acknowledged") { param =>
      testAsyncWebHook(param, None) { (payloads, actor) =>
        val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.length shouldBe 1
        payloads(0).events.get.length shouldBe 1
        payloads(0).records.get.length shouldBe 0
        payloads(0).aspectDefinitions.get.length shouldBe 1
        payloads(0).aspectDefinitions.get(0).id shouldBe ("testId")
        payloads(0).deferredResponseUrl shouldBe (Some("http://localhost:6101/v0/hooks/test/ack"))

        val aspectDefinition2 = AspectDefinition("testId2", "testName2", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", aspectDefinition2)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.length shouldBe 1
      }
    }

    it("retries an unsuccessful notification") { param =>
      testAsyncWebHook(param, None) { (payloads, actor) =>
        val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        //        val result1 = Await.result(processor.sendSomeNotificationsForOneWebHook("test", false), 5 seconds)
        //        result1.deferredResponse should be(true)
        Util.waitUntilDone(actor, "test")

        payloads.length shouldBe 1
        payloads(0).events.get.length shouldBe 1
        payloads(0).records.get.length shouldBe 0
        payloads(0).aspectDefinitions.get.length shouldBe 1
        payloads(0).aspectDefinitions.get(0).id shouldBe ("testId")

        param.asAdmin(Post("/v0/hooks/test/ack", WebHookAcknowledgement(false, None))) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[WebHookAcknowledgementResponse].lastEventIdReceived should be < (payloads(0).lastEventId)
        }

        //        val result2 = Await.result(processor.sendSomeNotificationsForOneWebHook("test", false), 5 seconds)
        //        result2.deferredResponse should be(true)
        Util.waitUntilDone(actor, "test")

        payloads.length shouldBe 2
        payloads(1).events.get.length shouldBe 1
        payloads(1).records.get.length shouldBe 0
        payloads(1).lastEventId shouldBe (payloads(0).lastEventId)
        payloads(1).aspectDefinitions.get.length shouldBe 1
        payloads(1).aspectDefinitions.get(0).id shouldBe ("testId")
      }
    }

    it("sends the next events after a successful notification") { param =>
      testAsyncWebHook(param, None) { (payloads, actor) =>
        val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.length shouldBe 1
        payloads(0).events.get.length shouldBe 1
        payloads(0).records.get.length shouldBe 0
        payloads(0).aspectDefinitions.get.length shouldBe 1
        payloads(0).aspectDefinitions.get(0).id shouldBe ("testId")

        val lastEventId = payloads(0).lastEventId
        payloads.clear()

        val aspectDefinition2 = AspectDefinition("testId2", "testName2", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", aspectDefinition2)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        param.asAdmin(Post("/v0/hooks/test/ack", WebHookAcknowledgement(true, Some(lastEventId)))) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[WebHookAcknowledgementResponse].lastEventIdReceived should be(lastEventId)
        }

        Util.waitUntilDone(actor, "test")

        payloads.length should be > (0)
        payloads.map(_.events.get).flatten.length shouldBe 1
        payloads.map(_.records.get).flatten.length shouldBe 0
        payloads.last.lastEventId shouldBe >(lastEventId)
        payloads.map(_.aspectDefinitions.get).flatten.length shouldBe 1
        payloads.map(_.aspectDefinitions.get).flatten.head.id shouldBe ("testId2")
      }
    }
  }

  private val defaultWebHook = WebHook(
    id = Some("test"),
    userId = None,
    name = "test",
    active = true,
    lastEvent = None,
    url = "",
    eventTypes = EventType.values.toSet,
    isWaitingForResponse = None,
    config = WebHookConfig(
      includeEvents = Some(true),
      includeRecords = Some(true),
      includeAspectDefinitions = Some(true),
      dereference = Some(true)))

  private def testWebHookWithResponse(param: FixtureParam, webHook: Option[WebHook], response: ⇒ ToResponseMarshallable)(testCallback: (ArrayBuffer[WebHookPayload], ActorRef) => Unit): Unit = {
    val payloads = ArrayBuffer[WebHookPayload]()

    val uuid = UUID.randomUUID()
    val route = post {
      path(uuid.toString) {
        entity(as[WebHookPayload]) { payload =>
          payloads.append(payload)

          complete(response)
        }
      }
    }
    val server = createHookRoute(route)

    val hook = webHook.getOrElse(defaultWebHook).copy(url = "http://localhost:" + server.localAddress.getPort.toString + "/" + uuid.toString)
    param.asAdmin(Post("/v0/hooks", hook)) ~> param.api.routes ~> check {
      status shouldEqual StatusCodes.OK
    }

    val actor = param.webHookActor

    try {
      testCallback(payloads, actor)
    } finally {
      Await.result(server.unbind(), 30 seconds)
    }
  }

  private def testWebHook(param: FixtureParam, webHook: Option[WebHook])(testCallback: (ArrayBuffer[WebHookPayload], ActorRef) => Unit): Unit = {
    testWebHookWithResponse(param, webHook, "got it")(testCallback)
  }

  private def testAsyncWebHook(param: FixtureParam, webHook: Option[WebHook])(testCallback: (ArrayBuffer[WebHookPayload], ActorRef) => Unit): Unit = {
    testWebHookWithResponse(param, webHook, WebHookResponse(true))(testCallback)
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
