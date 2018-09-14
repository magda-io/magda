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
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.Route
import akka.pattern.ask
import akka.util.Timeout
import au.csiro.data61.magda.model.Registry._
import spray.json._
import java.util.UUID

import gnieh.diffson._
import gnieh.diffson.sprayJson._
import org.scalatest.BeforeAndAfterAll
import akka.pattern.ask
import scalikejdbc.DB

class WebHookProcessingSpec extends ApiSpec with BeforeAndAfterAll {

  describe("includes") {
    it("aspectDefinitions if events modified them") { param =>
      testWebHook(param, None) { (payloads, actor) =>
        val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api(Full).routes ~> check {
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

    it("records if events modified them") { param =>
      testWebHook(param, None) { (payloads, actor) =>
        val record = Record("testId", "testName", Map())
        param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
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

    it("records for events modifying aspects that were requested") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A", "B"))))
      testWebHook(param, Some(webHook)) { (payloads, actor) =>
        val a = AspectDefinition("A", "A", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val b = AspectDefinition("B", "B", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("yep"))))
        param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.clear()

        val modified = record.copy(aspects = Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("new value"))))
        param.asAdmin(Put("/v0/records/testId", modified)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.length shouldBe 1
        payloads(0).events.get.length shouldBe 1
        payloads(0).records.get.length shouldBe 1
        payloads(0).aspectDefinitions.get.length shouldBe 0
      }
    }

    it("requested aspects in records") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A", "B"))))
      testWebHook(param, Some(webHook)) { (payloads, actor) =>
        val a = AspectDefinition("A", "A", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val b = AspectDefinition("B", "B", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("yep"))))
        param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.clear()

        val modified = record.copy(aspects = Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("new value"))))
        param.asAdmin(Put("/v0/records/testId", modified)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads(0).records.get(0).aspects.equals(Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("new value"))))
      }
    }

    it("optional aspects in records") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A")), optionalAspects = Some(List("B"))))
      testWebHook(param, Some(webHook)) { (payloads, actor) =>
        val a = AspectDefinition("A", "A", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val b = AspectDefinition("B", "B", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("yep"))))
        param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.clear()

        val modified = record.copy(aspects = Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("new value"))))
        param.asAdmin(Put("/v0/records/testId", modified)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads(0).records.get(0).aspects.equals(Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("new value"))))
      }
    }
  }

  describe("doesn't include") {
    it("unrequested aspects in records") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A"))))
      testWebHook(param, Some(webHook)) { (payloads, actor) =>
        val a = AspectDefinition("A", "A", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val b = AspectDefinition("B", "B", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("yep"))))
        param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.clear()

        val modified = record.copy(aspects = Map("A" -> JsObject("foo" -> JsString("bar2")), "B" -> JsObject("bvalue" -> JsString("new value"))))
        param.asAdmin(Put("/v0/records/testId", modified)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads(0).records.get(0).aspects.get("A").isDefined shouldBe true
        payloads(0).records.get(0).aspects.get("B").isDefined shouldBe false
      }
    }
  }

  describe("posts") {
    it("for hooks listening to a single aspect even if multiple aspects were updated") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A"))))
      testWebHook(param, Some(webHook)) { (payloads, actor) =>
        val a = AspectDefinition("A", "A", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val b = AspectDefinition("B", "B", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("yep"))))
        param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.clear()

        val modified = record.copy(aspects = Map("A" -> JsObject("foo" -> JsString("bar2")), "B" -> JsObject("bvalue" -> JsString("new value"))))
        param.asAdmin(Put("/v0/records/testId", modified)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.length shouldBe (1)
        payloads(0).events.get.length shouldBe 1
        payloads(0).records.get.length shouldBe 1
      }
    }

    it("for aspects that were only optionally requested even if they're not present on the record") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("B")), optionalAspects = Some(List("C"))))
      testWebHook(param, Some(webHook)) { (payloads, actor) =>
        val a = AspectDefinition("A", "A", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val b = AspectDefinition("B", "B", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("yep"))))
        param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.clear()

        val modified = record.copy(aspects = Map("B" -> JsObject("bvalue" -> JsString("new value"))))
        param.asAdmin(Put("/v0/records/testId", modified)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.length shouldBe 1
        payloads(0).events.get.length shouldBe 1
        payloads(0).records.get.length shouldBe 1
        payloads(0).aspectDefinitions.get.length shouldBe 0
      }
    }

    describe("for event:") {
      it("record created") { param =>
        val webHook = defaultWebHook.copy(eventTypes = Set(EventType.CreateRecord))
        testWebHook(param, Some(webHook)) { (payloads, actor) =>
          val record = Record("testId", "testName", Map())
          param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilDone(actor, "test")

          payloads.length shouldBe 1
          payloads(0).events.get.length shouldBe 1
          payloads(0).events.get(0).eventType shouldBe (EventType.CreateRecord)
          payloads(0).records.get.length shouldBe 1
        }
      }

      it("aspect definition created") { param =>
        val webHook = defaultWebHook.copy(eventTypes = Set(EventType.CreateAspectDefinition))
        testWebHook(param, Some(webHook)) { (payloads, actor) =>
          val a = AspectDefinition("A", "A", Some(JsObject()))
          param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilDone(actor, "test")

          payloads.length shouldBe 1
          payloads(0).events.get.length shouldBe 1
          payloads(0).events.get(0).eventType shouldBe (EventType.CreateAspectDefinition)
          payloads(0).aspectDefinitions.get.length shouldBe 1
        }
      }

      it("record aspect created by posting a new record") { param =>
        val webHook = defaultWebHook.copy(eventTypes = Set(EventType.CreateRecordAspect))
        testWebHook(param, Some(webHook)) { (payloads, actor) =>
          val a = AspectDefinition("A", "A", Some(JsObject()))
          param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Util.waitUntilDone(actor, "test")

          val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar"))))
          param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Util.waitUntilDone(actor, "test")

          payloads.length shouldBe (1)
          payloads(0).events.get.length shouldBe (1)
          payloads(0).events.get(0).eventType shouldBe EventType.CreateRecordAspect
        }
      }

      it("record deleted") { param =>
        val webHook = defaultWebHook.copy(eventTypes = Set(EventType.DeleteRecord))
        testWebHook(param, Some(webHook)) { (payloads, actor) =>
          val record = Record("testId", "testName", Map())
          param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Util.waitUntilDone(actor, "test")

          param.asAdmin(Delete("/v0/records/testId")) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Util.waitUntilDone(actor, "test")

          payloads.length shouldBe (1)
          payloads(0).events.get.length shouldBe (1)
          payloads(0).events.get(0).eventType shouldBe EventType.DeleteRecord
          payloads(0).events.get(0).data.convertTo[Map[String, JsValue]].get("recordId").get shouldBe JsString("testId")
        }
      }

      it("patching an aspect definition") { param =>
        val webHook = defaultWebHook.copy(eventTypes = Set(EventType.PatchAspectDefinition))
        testWebHook(param, Some(webHook)) { (payloads, actor) =>
          val a = AspectDefinition("A", "A", Some(JsObject()))
          param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Util.waitUntilDone(actor, "test")

          param.asAdmin(Patch("/v0/aspects/A", JsonPatch(Replace(Pointer.root / "name", JsString("foo"))))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Util.waitUntilDone(actor, "test")

          payloads.length shouldBe (1)
          payloads(0).events.get.length shouldBe (1)
          payloads(0).events.get(0).eventType shouldBe EventType.PatchAspectDefinition
          payloads(0).events.get(0).data.convertTo[Map[String, JsValue]].get("aspectId").get shouldBe JsString("A")
        }
      }

      it("overwriting an aspect definition") { param =>
        val webHook = defaultWebHook.copy(eventTypes = Set(EventType.PatchAspectDefinition))
        testWebHook(param, Some(webHook)) { (payloads, actor) =>
          val a = AspectDefinition("A", "A", Some(JsObject()))
          param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Util.waitUntilDone(actor, "test")

          param.asAdmin(Put("/v0/aspects/A", a.copy(name = "B"))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Util.waitUntilDone(actor, "test")

          payloads.length shouldBe (1)
          payloads(0).events.get.length shouldBe (1)
          payloads(0).events.get(0).eventType shouldBe EventType.PatchAspectDefinition
          payloads(0).events.get(0).data.convertTo[Map[String, JsValue]].get("aspectId").get shouldBe JsString("A")
        }
      }

      it("patching a record") { param =>
        val webHook = defaultWebHook.copy(eventTypes = Set(EventType.PatchRecord))
        testWebHook(param, Some(webHook)) { (payloads, actor) =>
          val record = Record("testId", "testName", Map())
          param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          param.asAdmin(Patch("/v0/records/testId", JsonPatch(Replace(Pointer.root / "name", JsString("foo"))))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Util.waitUntilDone(actor, "test")

          payloads.length shouldBe (1)
          payloads(0).events.get.length shouldBe (1)
          payloads(0).events.get(0).eventType shouldBe EventType.PatchRecord
          payloads(0).events.get(0).data.convertTo[Map[String, JsValue]].get("recordId").get shouldBe JsString("testId")
        }
      }

      it("overwriting a record") { param =>
        val webHook = defaultWebHook.copy(eventTypes = Set(EventType.PatchRecord))
        testWebHook(param, Some(webHook)) { (payloads, actor) =>
          val record = Record("testId", "testName", Map())
          param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          param.asAdmin(Put("/v0/records/testId", record.copy(name = "blah"))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Util.waitUntilDone(actor, "test")

          payloads.length shouldBe (1)
          payloads(0).events.get.length shouldBe (1)
          payloads(0).events.get(0).eventType shouldBe EventType.PatchRecord
          payloads(0).events.get(0).data.convertTo[Map[String, JsValue]].get("recordId").get shouldBe JsString("testId")
        }
      }

      it("patching a record aspect") { param =>
        val webHook = defaultWebHook.copy(eventTypes = Set(EventType.PatchRecordAspect))
        testWebHook(param, Some(webHook)) { (payloads, actor) =>
          val a = AspectDefinition("A", "A", Some(JsObject()))
          param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar"))))
          param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          param.asAdmin(Patch("/v0/records/testId", JsonPatch(Replace(Pointer.root / "aspects" / "A" / "foo", JsString("bar2"))))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Util.waitUntilDone(actor, "test")

          payloads.length shouldBe (1)
          payloads(0).events.get.length shouldBe (1)
          payloads(0).events.get(0).eventType shouldBe EventType.PatchRecordAspect
          payloads(0).events.get(0).data.convertTo[Map[String, JsValue]].get("recordId").get shouldBe JsString("testId")
        }
      }

      it("overwriting a record aspect") { param =>
        val webHook = defaultWebHook.copy(eventTypes = Set(EventType.PatchRecordAspect))
        testWebHook(param, Some(webHook)) { (payloads, actor) =>
          val a = AspectDefinition("A", "A", Some(JsObject()))
          param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar"))))
          param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          param.asAdmin(Put("/v0/records/testId", record.copy(aspects = Map("A" -> JsObject("foo" -> JsString("bar2")))))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Util.waitUntilDone(actor, "test")

          payloads.length shouldBe (1)
          payloads(0).events.get.length shouldBe (1)
          payloads(0).events.get(0).eventType shouldBe EventType.PatchRecordAspect
          payloads(0).events.get(0).data.convertTo[Map[String, JsValue]].get("recordId").get shouldBe JsString("testId")
        }
      }
    }
  }
  describe("does not post") {
    it("for aspects that were not requested") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A"))))
      testWebHook(param, Some(webHook)) { (payloads, actor) =>
        val a = AspectDefinition("A", "A", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val b = AspectDefinition("B", "B", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("yep"))))
        param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.clear()

        val modified = record.copy(aspects = Map("B" -> JsObject("bvalue" -> JsString("new value"))))
        param.asAdmin(Put("/v0/records/testId", modified)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.length shouldBe 0
      }
    }

    it("unless all non-optional aspects are present on the record") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A", "C"))))
      testWebHook(param, Some(webHook)) { (payloads, actor) =>
        val a = AspectDefinition("A", "A", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val b = AspectDefinition("B", "B", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("yep"))))
        param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.clear()

        val modified = record.copy(aspects = Map("B" -> JsObject("bvalue" -> JsString("new value"))))
        param.asAdmin(Put("/v0/records/testId", modified)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.length shouldBe 0
      }
    }
  }

  describe("does not duplicate") {

    it("records") { param =>
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
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")
        payloads.length shouldBe 1
        payloads.clear()

        val record = Record("testId", "testName", Map())
        param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val modified = record.copy(name = "new name")
        param.asAdmin(Put("/v0/records/testId", modified)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        for (i <- 1 to 50) {
          val withAspect = modified.copy(aspects = Map("A" -> JsObject(Map("a" -> JsString(i.toString)))))
          param.asAdmin(Put("/v0/records/testId", withAspect)) ~> param.api(Full).routes ~> check {
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

    it("aspect definitions") { param =>
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
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")
        payloads.length shouldBe 1
        payloads.clear()

        for (i <- 1 to 50) {
          val withAspect = a.copy(name = i.toString)
          param.asAdmin(Put("/v0/aspects/A", withAspect)) ~> param.api(Full).routes ~> check {
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
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val dataset = Record("dataset", "dataset", Map())
        param.asAdmin(Post("/v0/records", dataset)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val distribution = Record("distribution", "distribution", Map())
        param.asAdmin(Post("/v0/records", distribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.clear()

        val recordWithLink = dataset.copy(aspects = Map("A" -> JsObject("someLink" -> JsString("distribution"))))
        param.asAdmin(Put("/v0/records/dataset", recordWithLink)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.length shouldBe 1
        payloads(0).events.get.length shouldBe 1
        payloads(0).records.get.length shouldBe 1
        payloads(0).records.get(0).id shouldBe ("dataset")
      }
    }

    it("includes a record when a linked record is modified") { param =>
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
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val distribution = Record("distribution", "distribution", Map())
        param.asAdmin(Post("/v0/records", distribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val dataset = Record("dataset", "dataset", Map("A" -> JsObject("someLink" -> JsString("distribution"))))
        param.asAdmin(Post("/v0/records", dataset)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.clear()

        val modifiedDistribution = distribution.copy(name = "new name")
        param.asAdmin(Put("/v0/records/distribution", modifiedDistribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.length shouldBe 1
        payloads(0).events.get.length shouldBe 1
        payloads(0).records.get.length shouldBe 1
        payloads(0).records.get(0).id shouldBe ("dataset")
      }
    }

    it("includes a record when an array-linked record is modified") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A"))))
      testWebHook(param, Some(webHook)) { (payloads, actor) =>
        val jsonSchema =
          """
                |{
                |    "$schema": "http://json-schema.org/hyper-schema#",
                |    "title": "An aspect with a single link",
                |    "type": "object",
                |    "properties": {
                |        "distributions": {
                |           "title": "The distributions of this dataset.",
                |           "type": "array",
                |           "items": {
                |               "title": "A ID of a distribution of this dataset.",
                |               "type": "string",
                |               "links": [
                |                   {
                |                       "href": "/api/v0/registry/records/{$}",
                |                       "rel": "item"
                |                   }
                |               ]
                |           }
                |       }
                |    }
                |}
              """.stripMargin
        val a = AspectDefinition("A", "A", Some(JsonParser(jsonSchema).asJsObject))
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val distribution = Record("distribution", "distribution", Map())
        param.asAdmin(Post("/v0/records", distribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val dataset = Record("dataset", "dataset", Map("A" -> JsObject("distributions" -> JsArray(JsString("distribution")))))
        param.asAdmin(Post("/v0/records", dataset)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.clear()

        val modifiedDistribution = distribution.copy(name = "new name")
        param.asAdmin(Put("/v0/records/distribution", modifiedDistribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.length shouldBe 1
        payloads(0).events.get.length shouldBe 1
        payloads(0).records.get.length shouldBe 1
        payloads(0).records.get(0).id shouldBe ("dataset")
      }
    }

    it("includes a record when one of its single-linked records' aspects is modified") { param =>
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
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val b = AspectDefinition("B", "B", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val distribution = Record("distribution", "distribution", Map("B" -> JsObject("value" -> JsString("something"))))
        param.asAdmin(Post("/v0/records", distribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val dataset = Record("dataset", "dataset", Map("A" -> JsObject("someLink" -> JsString("distribution"))))
        param.asAdmin(Post("/v0/records", dataset)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.clear()

        val modifiedDistribution = distribution.copy(aspects = Map("B" -> JsObject("value" -> JsString("different"))))
        param.asAdmin(Put("/v0/records/distribution", modifiedDistribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.length shouldBe 1
        payloads(0).events.get.length shouldBe 1
        payloads(0).records.get.length shouldBe 1
        payloads(0).records.get(0).id shouldBe ("dataset")
      }
    }

    it("includes a record when an array-linked records' aspects is modified") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A"))))
      testWebHook(param, Some(webHook)) { (payloads, actor) =>
        val jsonSchema =
          """
                |{
                |    "$schema": "http://json-schema.org/hyper-schema#",
                |    "title": "An aspect with a single link",
                |    "type": "object",
                |    "properties": {
                |        "distributions": {
                |           "title": "The distributions of this dataset.",
                |           "type": "array",
                |           "items": {
                |               "title": "A ID of a distribution of this dataset.",
                |               "type": "string",
                |               "links": [
                |                   {
                |                       "href": "/api/v0/registry/records/{$}",
                |                       "rel": "item"
                |                   }
                |               ]
                |           }
                |       }
                |    }
                |}
              """.stripMargin
        val a = AspectDefinition("A", "A", Some(JsonParser(jsonSchema).asJsObject))
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val b = AspectDefinition("B", "B", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val distribution = Record("distribution", "distribution", Map("B" -> JsObject("value" -> JsString("something"))))
        param.asAdmin(Post("/v0/records", distribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val dataset = Record("dataset", "dataset", Map("A" -> JsObject("distributions" -> JsArray(JsString("distribution")))))
        param.asAdmin(Post("/v0/records", dataset)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.clear()

        val modifiedDistribution = distribution.copy(aspects = Map("B" -> JsObject("value" -> JsString("different"))))
        param.asAdmin(Put("/v0/records/distribution", modifiedDistribution)) ~> param.api(Full).routes ~> check {
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
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val b = AspectDefinition("B", "B", Some(JsonParser(jsonSchema).asJsObject))
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val distribution = Record("distribution", "distribution", Map())
        param.asAdmin(Post("/v0/records", distribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val dataset = Record("dataset", "dataset", Map("A" -> JsObject("someLink" -> JsString("distribution")), "B" -> JsObject()))
        param.asAdmin(Post("/v0/records", dataset)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.clear()

        val modifiedDistribution = distribution.copy(name = "new name")
        param.asAdmin(Put("/v0/records/distribution", modifiedDistribution)) ~> param.api(Full).routes ~> check {
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
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val b = AspectDefinition("B", "B", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val distribution = Record("distribution", "distribution", Map("B" -> JsObject("foo" -> JsString("bar"))))
        param.asAdmin(Post("/v0/records", distribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val dataset = Record("dataset", "dataset", Map("A" -> JsObject("someLink" -> JsString("distribution"))))
        param.asAdmin(Post("/v0/records", dataset)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.clear()

        val modifiedDistribution = distribution.copy(name = "new name")
        param.asAdmin(Put("/v0/records/distribution", modifiedDistribution)) ~> param.api(Full).routes ~> check {
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

  describe("resumes hooks that have previously failed with network errors") {
    describe("sync") {
      val dataset = Record("dataset", "dataset", Map())

      def doTestSync(param: FixtureParam)(resumeHook: ArrayBuffer[WebHookPayload] => Any) {
        testWebHook(param, None) { (payloads, actor) =>
          val url = param.asAdmin(Get("/v0/hooks/test")) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[WebHook].url
          }

          param.asAdmin(Put("/v0/hooks/test", defaultWebHook.copy(url = "aerga://bargoiaergoi.aerg"))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          param.asAdmin(Post("/v0/records", dataset)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilDone(actor, "test")

          param.asAdmin(Put("/v0/hooks/test", defaultWebHook.copy(url = url))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          payloads.length shouldEqual (0)

          resumeHook(payloads)
        }
      }

      it("when subscriber posts /ack") { param =>
        doTestSync(param) { payloads =>
          param.asAdmin(Post("/v0/hooks/" + defaultWebHook.id.get + "/ack", WebHookAcknowledgement(false))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilDone(param.webHookActor, "test")
          payloads.length shouldBe (1)
          payloads.last.lastEventId shouldBe (2)

          param.asAdmin(Get("/v0/hooks/" + defaultWebHook.id.get)) ~> param.api(Full).routes ~> check {
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

          payloads.length shouldBe (1)
          payloads.last.lastEventId shouldBe (2)
        }
      }

      it("when new event is created") { param =>
        doTestSync(param) { payloads =>
          param.asAdmin(Put("/v0/records/" + dataset.id, dataset.copy(name = "blah"))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilDone(param.webHookActor, "test")
          payloads.length shouldBe (1)

          param.asAdmin(Get("/v0/hooks/" + defaultWebHook.id.get)) ~> param.api(Full).routes ~> check {
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
          param.asAdmin(Post("/v0/records", dataset)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilDone(actor, "test")

          payloads.length shouldBe (1)

          param.asAdmin(Get("/v0/hooks/" + defaultWebHook.id.get)) ~> param.api(Full).routes ~> check {
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
          param.asAdmin(Post("/v0/hooks/" + defaultWebHook.id.get + "/ack", WebHookAcknowledgement(false))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilDone(param.webHookActor, "test")
          payloads.length shouldBe (2)
          payloads.last.lastEventId shouldBe (2)

          param.asAdmin(Get("/v0/hooks/" + defaultWebHook.id.get)) ~> param.api(Full).routes ~> check {
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
          param.asAdmin(Put("/v0/records/" + dataset.id, dataset.copy(name = "blah2"))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilDone(param.webHookActor, "test")
          payloads.length shouldBe (1)

          param.asAdmin(Post("/v0/hooks/" + defaultWebHook.id.get + "/ack", WebHookAcknowledgement(false))) ~> param.api(Full).routes ~> check {
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
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api(Full).routes ~> check {
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
        param.asAdmin(Post("/v0/aspects", aspectDefinition2)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.length shouldBe 1
      }
    }

    it("retries an unsuccessful notification") { param =>
      testAsyncWebHook(param, None) { (payloads, actor) =>
        val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilDone(actor, "test")

        payloads.length shouldBe 1
        payloads(0).events.get.length shouldBe 1
        payloads(0).records.get.length shouldBe 0
        payloads(0).aspectDefinitions.get.length shouldBe 1
        payloads(0).aspectDefinitions.get(0).id shouldBe ("testId")

        param.asAdmin(Post("/v0/hooks/test/ack", WebHookAcknowledgement(false, None))) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[WebHookAcknowledgementResponse].lastEventIdReceived should be < (payloads(0).lastEventId)
        }

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
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api(Full).routes ~> check {
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
        param.asAdmin(Post("/v0/aspects", aspectDefinition2)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        param.asAdmin(Post("/v0/hooks/test/ack", WebHookAcknowledgement(true, Some(lastEventId)))) ~> param.api(Full).routes ~> check {
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

  describe("deactivation/reactivation") {
    describe("deactivates on webhook recipient failure") {
      it("sync - when recipient returns failure code") { param =>
        def response(): ToResponseMarshallable = {
          StatusCodes.InternalServerError
        }

        testWebHookWithResponse(param, Some(defaultWebHook), response) { (payloads, actor) =>
          param.asAdmin(Get("/v0/hooks/test")) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val hook = responseAs[WebHook]
            hook.active shouldEqual (true)
          }

          val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
          param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilDone(actor, "test")

          payloads.length should be(1)

          param.asAdmin(Get("/v0/hooks/test")) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val hook = responseAs[WebHook]
            hook.active shouldEqual (false)
          }

          val aspectDefinition2 = AspectDefinition("testId2", "testName2", Some(JsObject()))
          param.asAdmin(Post("/v0/aspects", aspectDefinition2)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          implicit val timeout = Timeout(5 seconds)
          Await.result(actor ? WebHookActor.GetStatus("test"), 5 seconds).asInstanceOf[WebHookActor.Status].isProcessing.getOrElse(false) shouldEqual (false)

          payloads.length should be(1)
        }
      }

      it("async - deactivates when /ack called with active=false") { param =>
        testAsyncWebHook(param, None) { (payloads, actor) =>
          val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
          param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilDone(actor, "test")

          val lastEventId = payloads(0).lastEventId
          payloads.clear()

          param.asAdmin(Post("/v0/hooks/test/ack", WebHookAcknowledgement(false, None, Some(false)))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[WebHookAcknowledgementResponse].lastEventIdReceived should not be (lastEventId)
          }

          payloads.length shouldEqual (0)

          param.asAdmin(Post("/v0/hooks/test/ack", WebHookAcknowledgement(false))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          implicit val timeout = Timeout(5 seconds)
          Await.result(actor ? WebHookActor.GetStatus("test"), 5 seconds).asInstanceOf[WebHookActor.Status].isProcessing.getOrElse(false) shouldEqual (false)

          payloads.length shouldEqual (0)

          param.asAdmin(Get("/v0/hooks/test")) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val hook = responseAs[WebHook]
            hook.active shouldEqual (false)
          }
        }
      }

      it("reactivates when /ack called with active=true") { param =>
        testAsyncWebHook(param, Some(defaultWebHook.copy(active = false))) { (payloads, actor) =>
          val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
          param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          payloads.length shouldEqual (0)

          param.asAdmin(Post("/v0/hooks/test/ack", WebHookAcknowledgement(false, None, Some(true)))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilDone(actor, "test")

          payloads.length shouldEqual (1)

          val aspectDefinition2 = AspectDefinition("testId2", "testName2", Some(JsObject()))
          param.asAdmin(Post("/v0/aspects", aspectDefinition2)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          param.asAdmin(Post("/v0/hooks/test/ack", WebHookAcknowledgement(true, Some(payloads.last.lastEventId)))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilDone(actor, "test")

          payloads.length shouldEqual (2)
        }
      }

      it("When recipient returns success code, registry should reset webHook lastRetryTime & retryCount") { param =>
        def response(): ToResponseMarshallable = {
          StatusCodes.OK
        }

        testWebHookWithResponse(param, Some(defaultWebHook), response) { (payloads, actor) =>
          //--- retry will increase try count and set lastRetryTime
          DB localTx { session =>
            HookPersistence.retry(session, "test")
          }

          param.asAdmin(Get("/v0/hooks/test")) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val hook = responseAs[WebHook]
            hook.active shouldEqual (true)
            hook.retryCount shouldEqual 1
            hook.lastRetryTime.isEmpty shouldEqual false
          }

          val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
          param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilDone(actor, "test")

          payloads.length should be(1)

          param.asAdmin(Get("/v0/hooks/test")) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val hook = responseAs[WebHook]
            hook.active shouldEqual (true)
            hook.retryCount shouldEqual 0
            hook.lastRetryTime.isEmpty shouldEqual true
          }
        }
      }

    }
  }

  describe("Retry inactive Webhooks") {

    implicit val timeout = Timeout(5 seconds)

    it("Will restart inactive hook and start to process event immediately") { param =>

      val hook = defaultWebHook.copy(
        url = "http://localhost:" + server.localAddress.getPort.toString + "/hook",
        active = false,
        enabled = true)

      val actor = param.webHookActor
      Await.result(actor ? WebHookActor.GetStatus(hook.id.get), 5 seconds).asInstanceOf[WebHookActor.Status].isProcessing should be(None)

      param.asAdmin(Post("/v0/hooks", hook)) ~> param.api(Full).routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      def response(): ToResponseMarshallable = {
        StatusCodes.OK
      }

      this.currentResponse = Some(response);

      val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
      param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api(Full).routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      // --- should not in processing as initial value for active is false
      Await.result(actor ? WebHookActor.GetStatus(hook.id.get), 1 seconds).asInstanceOf[WebHookActor.Status].isProcessing should be(None)
      // --- No payload should be received by hook yet
      payloads.length should be(0)

      // --- send message to trigger the retry
      Await.ready(actor ? WebHookActor.RetryInactiveHooks, 15 seconds)

      Util.waitUntilDone(actor, hook.id.get)

      // --- check the hook again to see if it's live now
      Await.result(actor ? WebHookActor.GetStatus(hook.id.get), 5 seconds).asInstanceOf[WebHookActor.Status].isProcessing should not be None
      // --- should at send one request to hook
      payloads.length should be(1)

    }

    it("Will not restart disabled inactive hook") { param =>

      val hook = defaultWebHook.copy(
        url = "http://localhost:" + server.localAddress.getPort.toString + "/hook",
        active = false,
        enabled = false)

      val actor = param.webHookActor
      Await.result(actor ? WebHookActor.GetStatus(hook.id.get), 5 seconds).asInstanceOf[WebHookActor.Status].isProcessing should be(None)

      param.asAdmin(Post("/v0/hooks", hook)) ~> param.api(Full).routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      // --- should not in processing as initial value for active is false
      Await.result(actor ? WebHookActor.GetStatus(hook.id.get), 1 seconds).asInstanceOf[WebHookActor.Status].isProcessing should be(None)

      // --- send message to trigger the retry
      Await.ready(actor ? WebHookActor.RetryInactiveHooks, 15 seconds)

      // --- check the hook again to see if it's still inactive
      Await.result(actor ? WebHookActor.GetStatus(hook.id.get), 5 seconds).asInstanceOf[WebHookActor.Status].isProcessing should be(None)

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

  val payloads = ArrayBuffer[WebHookPayload]()
  val route = post {
    path("hook") {
      entity(as[WebHookPayload]) { payload =>
        payloads.append(payload)

        complete(currentResponse.get())
      } ~ complete(StatusCodes.BlockedByParentalControls)
    }
  }
  var currentResponse: Option[() => ToResponseMarshallable] = None
  val server = createHookRoute(route)

  override def afterAll() {
    Await.result(server.unbind(), 30 seconds)
  }

  private def testWebHookWithResponse(param: FixtureParam, webHook: Option[WebHook], response: () ⇒ ToResponseMarshallable)(testCallback: (ArrayBuffer[WebHookPayload], ActorRef) => Unit): Unit = {
    // Why this super-global approach instead of creating a new http server for each test? For some reason if you do it fast enough,
    // the akka http server from the old test can receive hooks for the new server, even after you've waited for it to unbind and bound
    // the new one on the current port (this is hard to reproduce but happens maybe 1/20th of the time.
    this.currentResponse = Some(response)
    val hook = webHook.getOrElse(defaultWebHook).copy(url = "http://localhost:" + server.localAddress.getPort.toString + "/hook")
    param.asAdmin(Post("/v0/hooks", hook)) ~> param.api(Full).routes ~> check {
      status shouldEqual StatusCodes.OK
    }

    val actor = param.webHookActor

    try {
      testCallback(payloads, actor)
    } finally {
      payloads.clear()
    }
  }

  private def testWebHook(param: FixtureParam, webHook: Option[WebHook])(testCallback: (ArrayBuffer[WebHookPayload], ActorRef) => Unit): Unit = {
    testWebHookWithResponse(param, webHook, () => "got it")(testCallback)
  }

  private def testAsyncWebHook(param: FixtureParam, webHook: Option[WebHook])(testCallback: (ArrayBuffer[WebHookPayload], ActorRef) => Unit): Unit = {
    testWebHookWithResponse(param, webHook, () => WebHookResponse(true))(testCallback)
  }

  private def createHookRoute(route: Route): Http.ServerBinding = {
    val http = Http()

    val random = new Random()

    var serverBinding: Option[Http.ServerBinding] = None
    var tries = 0

    while (serverBinding.isEmpty && tries < 10) {
      val port = random.nextInt(1000)
      val bindingFuture = http.bindAndHandle(route, "localhost", 30000 + port)
      serverBinding = Await.ready(bindingFuture, 5 seconds).value.get.toOption

      tries += 1
    }

    if (serverBinding.isEmpty) {
      throw new RuntimeException("Could not bind to a port in the 30000-31000 range after 10 tries.")
    }

    serverBinding.get
  }
}
