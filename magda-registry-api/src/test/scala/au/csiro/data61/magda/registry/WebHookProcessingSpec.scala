package au.csiro.data61.magda.registry

import akka.actor.ActorRef
import akka.http.scaladsl.Http
import akka.http.scaladsl.marshalling.ToResponseMarshallable
import akka.http.scaladsl.model.{StatusCode, StatusCodes}
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.Route
import au.csiro.data61.magda.model.Registry
import au.csiro.data61.magda.model.Registry._
import gnieh.diffson._
import gnieh.diffson.sprayJson._
import org.scalatest.{BeforeAndAfterAll, BeforeAndAfterEach}
import scalikejdbc.DB
import spray.json._

import scala.collection.mutable.ArrayBuffer
import scala.concurrent.Await
import scala.concurrent.duration._
import scala.util.Random

class WebHookProcessingSpec extends ApiSpec with BeforeAndAfterAll with BeforeAndAfterEach {

  override def afterEach(): Unit = {
    Util.clearWebHookActorsCache()
  }

  describe("includes") {
    it("aspectDefinitions if events modified them") { param =>
      testWebHook(param, None) { (payloads, _) =>
        val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds = List(2)
        assertPayload(expectedEventIds)
        payloads.head.records.get.length shouldBe 0
        payloads.head.aspectDefinitions.get.length shouldBe 1
        payloads.head.aspectDefinitions.get.head.id shouldBe "testId"
      }
    }

    it("records if events modified them") { param =>
      testWebHook(param, None) { (payloads, _) =>
        val record = Record("testId", "testName", Map())
        param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds = List(2)
        assertPayload(expectedEventIds)
        payloads.head.records.get.length shouldBe 1
        payloads.head.records.get.head.id shouldBe "testId"
        payloads.head.aspectDefinitions.get.length shouldBe 0
      }
    }

    it("records for events modifying aspects that were requested") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A", "B"))))
      testWebHook(param, Some(webHook)) { (payloads, _) =>
        val a = AspectDefinition("A", "A", Some(JsObject()))
        // Generate and process event with ID of 2.
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds_1 = List(2)
        assertPayload(expectedEventIds_1)
        payloads.clear()

        val b = AspectDefinition("B", "B", Some(JsObject()))
        // Generate and process event with ID of 3.
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds_2 = List(3)
        assertPayload(expectedEventIds_2)
        payloads.clear()

        val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("yep"))))
        // Generate and process events with IDs of 4, 5, 6.
        param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds_3 = List(4, 5, 6)
        assertPayload(expectedEventIds_3)
        payloads.clear()

        val modified = record.copy(aspects = Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("new value"))))
        // Generate and process event with ID of 7.
        param.asAdmin(Put("/v0/records/testId", modified)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds_4 = List(7)
        assertPayload(expectedEventIds_4)
        payloads.head.events.get.length shouldBe 1
        payloads.head.records.get.length shouldBe 1
        payloads.head.aspectDefinitions.get.length shouldBe 0
      }
    }

    it("requested aspects in records") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A", "B"))))
      testWebHook(param, Some(webHook)) { (payloads, _) =>
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

        Util.waitUntilAllDone()
        payloads.clear()

        val modified = record.copy(aspects = Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("new value"))))
        param.asAdmin(Put("/v0/records/testId", modified)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilAllDone()

        payloads.head.records.get.head.aspects.equals(Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("new value"))))
      }
    }

    it("optional aspects in records") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A")), optionalAspects = Some(List("B"))))
      testWebHook(param, Some(webHook)) { (payloads, _) =>
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

        Util.waitUntilAllDone()
        payloads.clear()

        val modified = record.copy(aspects = Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("new value"))))
        param.asAdmin(Put("/v0/records/testId", modified)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilAllDone()

        payloads.head.records.get.head.aspects.equals(Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("new value"))))
      }
    }
  }

  describe("doesn't include") {
    it("unrequested aspects in records") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A"))))
      testWebHook(param, Some(webHook)) { (payloads, _) =>
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

        Util.waitUntilAllDone()
        payloads.clear()

        val modified = record.copy(aspects = Map("A" -> JsObject("foo" -> JsString("bar2")), "B" -> JsObject("bvalue" -> JsString("new value"))))
        param.asAdmin(Put("/v0/records/testId", modified)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilAllDone()
        payloads.head.records.get.head.aspects.get("A").isDefined shouldBe true
        payloads.head.records.get.head.aspects.get("B").isDefined shouldBe false
      }
    }
  }

  describe("posts") {
    it("for hooks listening to a single aspect even if multiple aspects were updated") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A"))))
      testWebHook(param, Some(webHook)) { (payloads, _) =>
        val a = AspectDefinition("A", "A", Some(JsObject()))
        // Generate and process event with ID of 2.
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds_1 = List(2)
        assertPayload(expectedEventIds_1)
        payloads.clear()

        val b = AspectDefinition("B", "B", Some(JsObject()))
        // Will not process this event (with ID of 3).
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilAllDone()
        payloads.length shouldBe 0


        val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("yep"))))
        // Generate events with IDs of 4, 5, 6 but only process 4, 5.
        param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds_2 = List(4, 5)
        assertPayload(expectedEventIds_2)
        payloads.clear()

        val modified = record.copy(aspects = Map("A" -> JsObject("foo" -> JsString("bar2")), "B" -> JsObject("bvalue" -> JsString("new value"))))
        // Generate and process event with ID of 7.
        param.asAdmin(Put("/v0/records/testId", modified)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds_3 = List(7)
        assertPayload(expectedEventIds_3)
        payloads.head.records.get.length shouldBe 1
      }
    }

    it("for aspects that were only optionally requested even if they're not present on the record") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("B")), optionalAspects = Some(List("C"))))
      testWebHook(param, Some(webHook)) { (payloads, _) =>
        val a = AspectDefinition("A", "A", Some(JsObject()))
        // Generate but not process event with ID of 2.
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilAllDone()
        payloads.length shouldBe 0

        val b = AspectDefinition("B", "B", Some(JsObject()))
        // Generate and process event with ID of 3.
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds_1 = List(3)
        assertPayload(expectedEventIds_1)
        payloads.clear()

        val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("yep"))))
        // Generate events with IDs of 4, 5, 6 but only process 4 and 6.
        param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds_2 = List(4, 6)
        assertPayload(expectedEventIds_2)
        payloads.clear()

        val modified = record.copy(aspects = Map("B" -> JsObject("bvalue" -> JsString("new value"))))
        // Generate and process event with ID of 7.
        param.asAdmin(Put("/v0/records/testId", modified)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds_3 = List(7)
        assertPayload(expectedEventIds_3)
        payloads.head.records.get.length shouldBe 1
        payloads.head.aspectDefinitions.get.length shouldBe 0
      }
    }

    describe("for event:") {
      it("record created") { param =>
        val webHook = defaultWebHook.copy(eventTypes = Set(EventType.CreateRecord))
        testWebHook(param, Some(webHook)) { (payloads, _) =>
          val record = Record("testId", "testName", Map())
          // Generate and process event with ID of 2.
          param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val expectedEventIds = List(2)
          assertPayload(expectedEventIds)
          payloads.head.events.get.head.eventType shouldBe EventType.CreateRecord
          payloads.head.records.get.length shouldBe 1
        }
      }

      it("aspect definition created") { param =>
        val webHook = defaultWebHook.copy(eventTypes = Set(EventType.CreateAspectDefinition))
        testWebHook(param, Some(webHook)) { (payloads, _) =>
          val a = AspectDefinition("A", "A", Some(JsObject()))
          // Generate and process event with ID of 2.
          param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val expectedEventIds = List(2)
          assertPayload(expectedEventIds)
          payloads.head.events.get.head.eventType shouldBe EventType.CreateAspectDefinition
          payloads.head.aspectDefinitions.get.length shouldBe 1
        }
      }

      it("record aspect created by posting a new record") { param =>
        val webHook = defaultWebHook.copy(eventTypes = Set(EventType.CreateRecordAspect))
        testWebHook(param, Some(webHook)) { (payloads, _) =>
          val a = AspectDefinition("A", "A", Some(JsObject()))
          // Generate but not process event with ID of 2.
          param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilAllDone()
          payloads.length shouldBe 0

          val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar"))))
          // Generate events with IDs of 3 and 4 but only process 4.
          param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val expectedEventIds = List(4)
          assertPayload(expectedEventIds)
          payloads.head.events.get.head.eventType shouldBe EventType.CreateRecordAspect
        }
      }

      it("record deleted") { param =>
        val webHook = defaultWebHook.copy(eventTypes = Set(EventType.DeleteRecord))
        testWebHook(param, Some(webHook)) { (payloads, _) =>
          val record = Record("testId", "testName", Map())
          // Generate but not process event with ID of 2.
          param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilAllDone()
          payloads.length shouldBe 0

          // Generate and process event with ID of 3.
          param.asAdmin(Delete("/v0/records/testId")) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val expectedEventIds = List(3)
          assertPayload(expectedEventIds)
          payloads.head.events.get.head.eventType shouldBe EventType.DeleteRecord
          val theMap = payloads.head.events.get.head.data.convertTo[Map[String, JsValue]]
          theMap("recordId") shouldBe JsString("testId")
        }
      }

      it("patching an aspect definition") { param =>
        val webHook = defaultWebHook.copy(eventTypes = Set(EventType.PatchAspectDefinition))
        testWebHook(param, Some(webHook)) { (payloads, _) =>
          val a = AspectDefinition("A", "A", Some(JsObject()))
          // Generate but not process event with ID of 2.
          param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Util.waitUntilAllDone()
          payloads.length shouldBe 0

          param.asAdmin(Patch("/v0/aspects/A", JsonPatch(Replace(Pointer.root / "name", JsString("foo"))))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val expectedEventIds = List(3)
          assertPayload(expectedEventIds)
          payloads.head.events.get.head.eventType shouldBe EventType.PatchAspectDefinition
          val theMap = payloads(0).events.get.head.data.convertTo[Map[String, JsValue]]
          theMap("aspectId") shouldBe JsString("A")
        }
      }

      it("overwriting an aspect definition") { param =>
        val webHook = defaultWebHook.copy(eventTypes = Set(EventType.PatchAspectDefinition))
        testWebHook(param, Some(webHook)) { (payloads, _) =>
          val a = AspectDefinition("A", "A", Some(JsObject()))
          // Generate but not process event with ID of 2.
          param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilAllDone()
          payloads.length shouldBe 0

          // Generate and process event with ID of 3.
          param.asAdmin(Put("/v0/aspects/A", a.copy(name = "B"))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val expectedEventIds = List(3)
          assertPayload(expectedEventIds)
          payloads.head.events.get.head.eventType shouldBe EventType.PatchAspectDefinition
          val theMap = payloads.head.events.get.head.data.convertTo[Map[String, JsValue]]
          theMap("aspectId") shouldBe JsString("A")
        }
      }

      it("patching a record") { param =>
        val webHook = defaultWebHook.copy(eventTypes = Set(EventType.PatchRecord))
        testWebHook(param, Some(webHook)) { (payloads, _) =>
          val record = Record("testId", "testName", Map())
          // Generate but not process event with ID of 2.
          param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilAllDone()
          payloads.length shouldBe 0

          // Generate and process event with ID of 3.
          param.asAdmin(Patch("/v0/records/testId", JsonPatch(Replace(Pointer.root / "name", JsString("foo"))))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val expectedEventIds = List(3)
          assertPayload(expectedEventIds)
          payloads.head.events.get.head.eventType shouldBe EventType.PatchRecord
          val theMap = payloads.head.events.get.head.data.convertTo[Map[String, JsValue]]
          theMap("recordId") shouldBe JsString("testId")
        }
      }

      it("overwriting a record") { param =>
        val webHook = defaultWebHook.copy(eventTypes = Set(EventType.PatchRecord))
        testWebHook(param, Some(webHook)) { (payloads, _) =>
          val record = Record("testId", "testName", Map())
          // Generate but not process event with ID of 2.
          param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilAllDone()
          payloads.length shouldBe 0

          // Generate and process event with ID of 3.
          param.asAdmin(Put("/v0/records/testId", record.copy(name = "blah"))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val expectedEventIds = List(3)
          assertPayload(expectedEventIds)
          payloads.head.events.get.head.eventType shouldBe EventType.PatchRecord
          val theMap = payloads(0).events.get.head.data.convertTo[Map[String, JsValue]]
          theMap("recordId") shouldBe JsString("testId")
        }
      }

      it("patching a record aspect") { param =>
        val webHook = defaultWebHook.copy(eventTypes = Set(EventType.PatchRecordAspect))
        testWebHook(param, Some(webHook)) { (payloads, _) =>
          val a = AspectDefinition("A", "A", Some(JsObject()))
          // Generate but not process event with ID of 2.
          param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          // Generate but not process event with ID of 3.
          val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar"))))
          param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          // Generate events with IDs of 4 and 5 but only process 5.
          param.asAdmin(Patch("/v0/records/testId", JsonPatch(Replace(Pointer.root / "aspects" / "A" / "foo", JsString("bar2"))))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val expectedEventIds = List(5)
          assertPayload(expectedEventIds)
          payloads.head.events.get.head.eventType shouldBe EventType.PatchRecordAspect
          val theMap = payloads.head.events.get.head.data.convertTo[Map[String, JsValue]]
          theMap("recordId") shouldBe JsString("testId")
        }
      }

      it("overwriting a record aspect") { param =>
        val webHook = defaultWebHook.copy(eventTypes = Set(EventType.PatchRecordAspect))
        testWebHook(param, Some(webHook)) { (payloads, _) =>
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

          val expectedEventIds = List(5)
          assertPayload(expectedEventIds)
          payloads.head.events.get.head.eventType shouldBe EventType.PatchRecordAspect
          val theMap = payloads.head.events.get.head.data.convertTo[Map[String, JsValue]]
          theMap("recordId") shouldBe JsString("testId")
        }
      }
    }
  }
  describe("does not post") {
    it("for aspects that were not requested") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A"))))
      testWebHook(param, Some(webHook)) { (payloads, _) =>
        val a = AspectDefinition("A", "A", Some(JsObject()))
        // Generate and process event with ID of 2.
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds_1 = List(2)
        assertPayload(expectedEventIds_1)
        payloads.clear()

        val b = AspectDefinition("B", "B", Some(JsObject()))
        // Generate but not process event with ID of 3.
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilAllDone()
        payloads.length shouldBe 0

        // Generate events with IDs of 4, 5, 6 but only process 4, 5.
        val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("yep"))))
        param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds = List(4, 5)
        assertPayload(expectedEventIds)
        payloads.clear()

        val modified = record.copy(aspects = Map("B" -> JsObject("bvalue" -> JsString("new value"))))
        // Generate but not process event with ID of 7.
        param.asAdmin(Put("/v0/records/testId", modified)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilAllDone()
        payloads.length shouldBe 0
      }
    }

    it("unless all non-optional aspects are present on the record") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A", "C"))))
      testWebHook(param, Some(webHook)) { (payloads, _) =>
        val a = AspectDefinition("A", "A", Some(JsObject()))
        // Generate and process event with ID of 2.
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds_1 = List(2)
        assertPayload(expectedEventIds_1)
        payloads.clear()

        val b = AspectDefinition("B", "B", Some(JsObject()))
        // Generate but not process event with ID of 3.
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilAllDone()
        payloads.length shouldBe 0

        // Generate events with IDs of 4, 5, 6 but only process 4, 5
        val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject("bvalue" -> JsString("yep"))))
        param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds_2 = List(4, 5)
        assertPayload(expectedEventIds_2)
        payloads.clear()

        val modified = record.copy(aspects = Map("B" -> JsObject("bvalue" -> JsString("new value"))))
        // Generate but not process event with ID of 7.
        param.asAdmin(Put("/v0/records/testId", modified)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilAllDone()
        payloads.length shouldBe 0
      }
    }
  }

  describe("does not duplicate") {
    it("records") { param =>
      testWebHook(param, None) { (payloads, _) =>
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
        // Generate and process event with ID of 2.
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds_1 = List(2)
        assertPayload(expectedEventIds_1)
        payloads.clear()

        val record = Record("testId", "testName", Map())
        // Generate and process event with ID of 3.
        param.asAdmin(Post("/v0/records", record)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds_2 = List(3)
        assertPayload(expectedEventIds_2)

        val modified = record.copy(name = "new name")
        // Generate and process event with ID of 4.
        param.asAdmin(Put("/v0/records/testId", modified)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }


        val expectedEventIds_3 = List(4)
        assertPayload(expectedEventIds_3, 2)

        for (i <- 1 to 50) {
          val withAspect = modified.copy(aspects = Map("A" -> JsObject(Map("a" -> JsString(i.toString)))))
          param.asAdmin(Put("/v0/records/testId", withAspect)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
        }

        Util.waitUntilAllDone()

        val events = payloads.foldLeft(List[RegistryEvent]())((a, payload) => payload.events.getOrElse(Nil) ++ a)
        events.length shouldBe 52
        val records = payloads.foldLeft(List[Record]())((a, payload) => payload.records.getOrElse(Nil) ++ a)
        records.length shouldBe payloads.length
        records.map(_.id).distinct.length shouldBe 1
        records.map(_.id).distinct.head shouldBe "testId"
      }
    }

    it("aspect definitions") { param =>
      testWebHook(param, None) { (payloads, _) =>
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

        Util.waitUntilAllDone()
        payloads.length shouldBe 1
        payloads.clear()

        for (i <- 1 to 50) {
          val withAspect = a.copy(name = i.toString)
          param.asAdmin(Put("/v0/aspects/A", withAspect)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
        }

        Util.waitUntilAllDone()

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
      testWebHook(param, Some(webHook)) { (payloads, _) =>
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
        // Generate and process event with ID of 2.
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds_1 = List(2)
        assertPayload(expectedEventIds_1)
        payloads.clear()

        val dataset = Record("dataset", "dataset", Map())
        // Generate and process event with ID of 3.
        param.asAdmin(Post("/v0/records", dataset)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds_2 = List(3)
        assertPayload(expectedEventIds_2)
        payloads.clear()

        val distribution = Record("distribution", "distribution", Map())
        // Generate and process event with ID of 4.
        param.asAdmin(Post("/v0/records", distribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds_3 = List(4)
        assertPayload(expectedEventIds_3)
        payloads.clear()

        val recordWithLink = dataset.copy(aspects = Map("A" -> JsObject("someLink" -> JsString("distribution"))))
        // Generate and process event with ID of 5.
        param.asAdmin(Put("/v0/records/dataset", recordWithLink)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds_4 = List(5)
        assertPayload(expectedEventIds_4)
        payloads.head.records.get.length shouldBe 1
        payloads.head.records.get.head.id shouldBe "dataset"
      }
    }

    it("includes a record when a linked record is modified") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A"))))
      testWebHook(param, Some(webHook)) { (payloads, _) =>
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
        // Generate and process event with ID of 2.
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val distribution = Record("distribution", "distribution", Map())
        // Generate and process event with ID of 3.
        param.asAdmin(Post("/v0/records", distribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val dataset = Record("dataset", "dataset", Map("A" -> JsObject("someLink" -> JsString("distribution"))))
        // Generate and process events with IDs of 4, 5.
        param.asAdmin(Post("/v0/records", dataset)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilAllDone()
        payloads.clear()

        val modifiedDistribution = distribution.copy(name = "new name")
        // Generate and process event with ID of 6.
        param.asAdmin(Put("/v0/records/distribution", modifiedDistribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds = List(6)
        assertPayload(expectedEventIds)
        payloads(0).records.get.length shouldBe 1
        payloads(0).records.get.head.id shouldBe "dataset"
      }
    }

    it("includes a record when an array-linked record is modified") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A"))))
      testWebHook(param, Some(webHook)) { (payloads, _) =>
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
        // Generate and process event with ID of 2.
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val distribution = Record("distribution", "distribution", Map())
        // Generate and process event with ID of 3.
        param.asAdmin(Post("/v0/records", distribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val dataset = Record("dataset", "dataset", Map("A" -> JsObject("distributions" -> JsArray(JsString("distribution")))))
        // Generate and process events with IDs of 4, 5.
        param.asAdmin(Post("/v0/records", dataset)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilAllDone()
        payloads.clear()

        val modifiedDistribution = distribution.copy(name = "new name")
        // Generate and process event with ID of 6.
        param.asAdmin(Put("/v0/records/distribution", modifiedDistribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds = List(6)
        assertPayload(expectedEventIds)
        payloads.head.records.get.length shouldBe 1
        payloads.head.records.get.head.id shouldBe "dataset"
      }
    }

    it("includes a record when one of its single-linked records' aspects is modified") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A"))))
      testWebHook(param, Some(webHook)) { (payloads, _) =>
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
        // Generate and process event with ID of 2.
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val b = AspectDefinition("B", "B", Some(JsObject()))
        // Generate and process event with ID of 3.
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val distribution = Record("distribution", "distribution", Map("B" -> JsObject("value" -> JsString("something"))))
        // Generate and process events with IDs of 4, 5.
        param.asAdmin(Post("/v0/records", distribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val dataset = Record("dataset", "dataset", Map("A" -> JsObject("someLink" -> JsString("distribution"))))
        // Generate and process events with IDs of 6, 7.
        param.asAdmin(Post("/v0/records", dataset)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilAllDone()
        payloads.clear()

        val modifiedDistribution = distribution.copy(aspects = Map("B" -> JsObject("value" -> JsString("different"))))
        // Generate and process event with ID of 8.
        param.asAdmin(Put("/v0/records/distribution", modifiedDistribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds = List(8)
        assertPayload(expectedEventIds)
        payloads.head.records.get.length shouldBe 1
        payloads.head.records.get.head.id shouldBe "dataset"
      }
    }

    it("includes a record when an array-linked records' aspects is modified") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A"))))
      testWebHook(param, Some(webHook)) { (payloads, _) =>
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
        // Generate and process event with ID of 2.
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val b = AspectDefinition("B", "B", Some(JsObject()))
        // Generate and process event with ID of 3.
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val distribution = Record("distribution", "distribution", Map("B" -> JsObject("value" -> JsString("something"))))
        // Generate and process events with IDs of 4, 5.
        param.asAdmin(Post("/v0/records", distribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val dataset = Record("dataset", "dataset", Map("A" -> JsObject("distributions" -> JsArray(JsString("distribution")))))
        // Generate and process events with IDs of 6, 7.
        param.asAdmin(Post("/v0/records", dataset)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilAllDone()
        payloads.clear()

        val modifiedDistribution = distribution.copy(aspects = Map("B" -> JsObject("value" -> JsString("different"))))
        // Generate and process event with ID of 8.
        param.asAdmin(Put("/v0/records/distribution", modifiedDistribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds = List(8)
        assertPayload(expectedEventIds)
        payloads.head.records.get.length shouldBe 1
        payloads.head.records.get.head.id shouldBe "dataset"
      }
    }

    it("with multiple linking aspects, only one has to link to a modified record") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A", "B"))))
      testWebHook(param, Some(webHook)) { (payloads, _) =>
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
        // Generate and process event with ID of 2.
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val b = AspectDefinition("B", "B", Some(JsonParser(jsonSchema).asJsObject))
        // Generate and process event with ID of 3.
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val distribution = Record("distribution", "distribution", Map())
        // Generate and process events with IDs of 4, 5.
        param.asAdmin(Post("/v0/records", distribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val dataset = Record("dataset", "dataset", Map("A" -> JsObject("someLink" -> JsString("distribution")), "B" -> JsObject()))
        // Generate and process events with IDs of 6, 7.
        param.asAdmin(Post("/v0/records", dataset)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilAllDone()
        payloads.clear()

        val modifiedDistribution = distribution.copy(name = "new name")
        // Generate and process event with ID of 8.
        param.asAdmin(Put("/v0/records/distribution", modifiedDistribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds = List(8)
        assertPayload(expectedEventIds)
        payloads.head.records.get.length shouldBe 1
        payloads.head.records.get.head.id shouldBe "dataset"
      }
    }

    it("includes all aspects of linked records, not just the requested aspects") { param =>
      val webHook = defaultWebHook.copy(config = defaultWebHook.config.copy(aspects = Some(List("A"))))
      testWebHook(param, Some(webHook)) { (payloads, _) =>
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
        // Generate and process event with ID of 2.
        param.asAdmin(Post("/v0/aspects", a)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val b = AspectDefinition("B", "B", Some(JsObject()))
        // Generate and process event with ID of 3.
        param.asAdmin(Post("/v0/aspects", b)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val distribution = Record("distribution", "distribution", Map("B" -> JsObject("foo" -> JsString("bar"))))
        // Generate and process events with IDs of 4, 5.
        param.asAdmin(Post("/v0/records", distribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val dataset = Record("dataset", "dataset", Map("A" -> JsObject("someLink" -> JsString("distribution"))))
        // Generate and process events with IDs of 6, 7.
        param.asAdmin(Post("/v0/records", dataset)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilAllDone()
        payloads.clear()

        val modifiedDistribution = distribution.copy(name = "new name")
        // Generate and process event with ID of 8.
        param.asAdmin(Put("/v0/records/distribution", modifiedDistribution)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds = List(8)
        assertPayload(expectedEventIds)
        payloads.head.records.get.length shouldBe 1
        payloads.head.records.get.head.id shouldBe "dataset"

        val embeddedDistribution = payloads.head.records.get.head.aspects("A").fields("someLink").asJsObject
        val bAspect = embeddedDistribution.fields("aspects").asJsObject.fields("B").asJsObject
        bAspect.fields("foo").asInstanceOf[JsString].value shouldBe "bar"
      }
    }
  }

  describe("resumes hooks that have previously failed with network errors") {
    describe("sync") {
      val dataset = Record("dataset", "dataset", Map())

      /**
        * This function will perform the following common tasks:
        * 1) Create a test hook processor, no events to process yet.
        * 2) Change the hook to an invalid url.
        * 3) Add a new dataset in the registry and the hook will fail in the event processing.
        * 4) Change the hook back to a valid url and make update hook request.
        * 5) Make resume web hook request and the hook will succeed in the event processing.
        *
        * Once all the common tasks are completed, the callback function "resumeHook" will start.
        * @param param fixture parameters
        * @param resumeHook callback function
        */
      def doTestSync(param: FixtureParam)(resumeHook: () => Any) {
        testWebHook(param, None) { (payloads, _) =>
          val url = param.asAdmin(Get("/v0/hooks/test")) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[WebHook].url
          }

          // Set the test hook to an invalid url to simulate some network errors, such as the
          // subscriber service goes offline. For example, an indexer pod is deleted.
          param.asAdmin(Put("/v0/hooks/test", defaultWebHook.copy(url = "aerga://bargoiaergoi.aerg"))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          // Generate but fail to process event with ID of 2.
          param.asAdmin(Post("/v0/records", dataset)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilAllDone()
          // As the hook url is invalid, the subscriber will not receive event with id of 2.
          payloads.length shouldEqual 0

          // Set the test hook back to a valid url to simulates the subscriber goes online again.
          // For example, a re-created indexer will register itself by making a put request
          // to update its web hook, which will not cause any event processing.
          param.asAdmin(Put("/v0/hooks/test", defaultWebHook.copy(url = url))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilAllDone()
          payloads.length shouldEqual 0

          // Simulate a subscriber making request to resume its web hook, which will cause some
          // event processing. That is, process event with ID of 2.
          val lastEventId = 1
          param.asAdmin(Post("/v0/hooks/test/ack", WebHookAcknowledgement(succeeded = true, Some(lastEventId)))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[WebHookAcknowledgementResponse].lastEventIdReceived should be(lastEventId)
          }

          val expectedEventIds = List(2)
          assertPayload(expectedEventIds)
          payloads.clear()

          resumeHook()
        }
      }

      it("when subscriber posts /ack with up-to-date last event id") { param =>
        doTestSync(param) { () =>
          // Make request to resume a subscriber's web hook, with lastEventId = 2, which will
          // not cause event processing.
          // This is to simulate when an indexer is re-created, its event processing is up-to-date.
          val lastEventId = 2
          param.asAdmin(Post("/v0/hooks/" + defaultWebHook.id.get + "/ack",
            WebHookAcknowledgement(succeeded = true, Some(lastEventId)))) ~> param.api(Full).routes ~> check {
            responseAs[Registry.WebHookAcknowledgementResponse].lastEventIdReceived shouldBe lastEventId
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilAllDone()
          payloads.length shouldBe 0

          param.asAdmin(Get("/v0/hooks/" + defaultWebHook.id.get)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val hook = responseAs[WebHook]
            hook.lastEvent.get shouldBe 2
          }
        }
      }

      it("when actor is sent Process() (i.e. on registry startup)") { param =>
        doTestSync(param) { () =>
          param.webHookActor ! WebHookActor.Process(ignoreWaitingForResponse = true)
          Util.waitUntilAllDone()
          payloads.length shouldBe 0
        }
      }

      it("when new event is created") { param =>
        doTestSync(param) { () =>
          // Generate and process event with ID of 3.
          param.asAdmin(Put("/v0/records/" + dataset.id, dataset.copy(name = "blah"))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val expectedEventIds = List(3)
          assertPayload(expectedEventIds)

          param.asAdmin(Get("/v0/hooks/" + defaultWebHook.id.get)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val hook = responseAs[WebHook]
            hook.lastEvent.get shouldBe 3
            payloads.last.lastEventId shouldBe 3
          }
        }
      }
    }

    describe("async") {
      val dataset = Record("dataset", "dataset", Map())

      def doTestAsync(param: FixtureParam)(resumeHook: () => Any) {
        testAsyncWebHook(param, Some(defaultWebHook)) { (payloads, _) =>
          param.asAdmin(Post("/v0/records", dataset)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record] shouldBe dataset
          }

          val expectedEventIds = List(2)
          assertPayload(expectedEventIds)

          param.asAdmin(Get("/v0/hooks/" + defaultWebHook.id.get)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val hook = responseAs[WebHook]
            hook.lastEvent.get shouldBe 1
            hook.isWaitingForResponse.get shouldBe true
            payloads.last.lastEventId shouldBe 2
          }

          payloads.clear()

          resumeHook()
        }
      }

      it("when subscriber posts /ack") { param =>
        doTestAsync(param) { () =>
          param.asAdmin(Post("/v0/hooks/" + defaultWebHook.id.get + "/ack", WebHookAcknowledgement(succeeded = false))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val expectedEventIds = List(2)
          assertPayload(expectedEventIds)

          param.asAdmin(Get("/v0/hooks/" + defaultWebHook.id.get)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val hook = responseAs[WebHook]

            // We haven't told the registry that we've successfully processed it, so the hook should still be at event 1
            hook.lastEvent.get shouldBe 1
            hook.isWaitingForResponse.get shouldBe true
          }
        }
      }

      it("when actor is sent Process() (i.e. on registry startup)") { param =>
        doTestAsync(param) { () =>
          param.webHookActor ! WebHookActor.Process(ignoreWaitingForResponse = true)

          val expectedEventIds = List(2)
          assertPayload(expectedEventIds)
        }
      }

      it("should not resume when new event is created, but should include both events when resumed") { param =>
        doTestAsync(param) { () =>
          param.asAdmin(Put("/v0/records/" + dataset.id,
            dataset.copy(name = "blah2"))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record].id shouldBe "dataset"
            responseAs[Record].name shouldBe "blah2"
            responseAs[Record].aspects shouldBe Map()
          }

          Util.waitUntilAllDone()
          // Because the hook is marked as waiting for response, the new event should not be sent.
          payloads.length shouldBe 0

          param.asAdmin(Post("/v0/hooks/" + defaultWebHook.id.get + "/ack",
            WebHookAcknowledgement(succeeded = false))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[WebHookAcknowledgementResponse].lastEventIdReceived shouldBe 1
          }

          // Because the subscriber post ack as failure, two events should be sent,
          // with the first event being re-sent.
          val expectedEventIds = List(2, 3)
          assertPayload(expectedEventIds)
        }
      }
    }
  }

  private def assertPayload(expectedEventIds: Seq[Int], payloadsSize: Int = 1) = {
//    Util.waitUntilPayloadsReady(payloads, payloadsSize)
    Util.waitUntilAllDone(200)
    payloads.length shouldBe payloadsSize
    val thePayload: WebHookPayload = payloads.last
    val events = thePayload.events.get
    val eventsSize = events.size
    eventsSize shouldBe expectedEventIds.size
    for(i <- 0 until eventsSize) events(i).id.get shouldBe expectedEventIds(i)
    thePayload.lastEventId shouldBe expectedEventIds(eventsSize - 1)
  }

  describe("async web hooks") {
    it("delays further notifications until previous one is acknowledged") { param =>
      testAsyncWebHook(param, None) { (payloads, _) =>
        val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilAllDone()
        payloads.length shouldBe 1
        payloads(0).events.get.length shouldBe 1
        payloads(0).records.get.length shouldBe 0
        payloads(0).aspectDefinitions.get.length shouldBe 1
        payloads(0).aspectDefinitions.get.head.id shouldBe "testId"
        payloads(0).deferredResponseUrl shouldBe Some("http://localhost:6101/v0/hooks/test/ack")
        payloads.clear()

        val aspectDefinition2 = AspectDefinition("testId2", "testName2", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", aspectDefinition2)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilAllDone()
        payloads.length shouldBe 0
      }
    }

    it("retries an unsuccessful notification") { param =>
      testAsyncWebHook(param, None) { (payloads, _) =>
        val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Util.waitUntilAllDone()
        payloads.length shouldBe 1
        payloads(0).events.get.length shouldBe 1
        payloads(0).records.get.length shouldBe 0
        payloads(0).aspectDefinitions.get.length shouldBe 1
        payloads(0).aspectDefinitions.get.head.id shouldBe "testId"
        payloads.clear()

        param.asAdmin(Post("/v0/hooks/test/ack", WebHookAcknowledgement(succeeded = false, None))) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[WebHookAcknowledgementResponse].lastEventIdReceived should be < 2L
        }

        val expectedEventIds = List(2)
        assertPayload(expectedEventIds)
        payloads.head.records.get.length shouldBe 0
        payloads.head.aspectDefinitions.get.length shouldBe 1
        payloads.head.aspectDefinitions.get.head.id shouldBe "testId"
      }
    }

    it("sends the next events after a successful notification") { param =>
      testAsyncWebHook(param, None) { (payloads, _) =>
        val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val expectedEventIds_1 = List(2)
        assertPayload(expectedEventIds_1)
        payloads.head.records.get.length shouldBe 0
        payloads.head.aspectDefinitions.get.length shouldBe 1
        payloads.head.aspectDefinitions.get.head.id shouldBe "testId"
        val lastEventId = payloads.head.lastEventId
        payloads.clear()

        val aspectDefinition2 = AspectDefinition("testId2", "testName2", Some(JsObject()))
        param.asAdmin(Post("/v0/aspects", aspectDefinition2)) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        param.asAdmin(Post("/v0/hooks/test/ack", WebHookAcknowledgement(succeeded = true, Some(lastEventId)))) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[WebHookAcknowledgementResponse].lastEventIdReceived should be(lastEventId)
        }

        val expectedEventIds_2 = List(3)
        assertPayload(expectedEventIds_2)
        payloads.head.records.get.length shouldBe 0
        payloads.head.aspectDefinitions.get.length shouldBe 1
        payloads.head.aspectDefinitions.get.head.id shouldBe "testId2"
      }
    }

  }

  describe("deactivation/reactivation") {
    describe("deactivates on webhook recipient failure") {
      it("sync - when recipient returns failure code") { param =>
        def response(): ToResponseMarshallable = {
          StatusCodes.InternalServerError
        }

        testWebHookWithResponse(param, Some(defaultWebHook), response) { (payloads, _) =>
          param.asAdmin(Get("/v0/hooks/test")) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val hook = responseAs[WebHook]
            hook.active shouldEqual true
          }

          val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
          param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val expectedEventIds_1 = List(2)
          assertPayload(expectedEventIds_1)
          payloads.clear()


          param.asAdmin(Get("/v0/hooks/test")) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val hook = responseAs[WebHook]
            hook.active shouldEqual false
          }

          val aspectDefinition2 = AspectDefinition("testId2", "testName2", Some(JsObject()))
          param.asAdmin(Post("/v0/aspects", aspectDefinition2)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          payloads.length should be(0)
        }
      }

      it("async - deactivates when /ack called with active=false") { param =>
        testAsyncWebHook(param, None) { (payloads, _) =>
          val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
          // Generate and process event with ID of 2.
          param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Registry.AspectDefinition].id shouldBe "testId"
          }

          val expectedEventIds = List(2)
          assertPayload(expectedEventIds)
          val lastEventId = payloads(0).lastEventId
          payloads.clear()

          // Not to re-process event with ID of 2 as the hook is set to inactive.
          param.asAdmin(Post("/v0/hooks/test/ack",
            WebHookAcknowledgement(succeeded = false, lastEventIdReceived = None, active = Some(false)))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[WebHookAcknowledgementResponse].lastEventIdReceived should not be lastEventId
          }

          Util.waitUntilAllDone()
          payloads.length shouldEqual 0

          // Not to re-process event with ID of 2 as the hook is still inactive.
          param.asAdmin(Post("/v0/hooks/test/ack", WebHookAcknowledgement(succeeded = false))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilAllDone()
          payloads.length shouldEqual 0

          param.asAdmin(Get("/v0/hooks/test")) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val hook = responseAs[WebHook]
            hook.active shouldEqual false
          }
        }
      }

      it("reactivates when /ack called with active=true") { param =>
        testAsyncWebHook(param, Some(defaultWebHook.copy(active = false))) { (payloads, _) =>
          val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
          // Generate but not process event with ID of 2.
          param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilAllDone()
          payloads.length shouldEqual 0

          // Process event with ID of 2 as the hook becomes active.
          param.asAdmin(Post("/v0/hooks/test/ack",
            WebHookAcknowledgement(succeeded = false, lastEventIdReceived = None, active = Some(true)))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val expectedEventIds_1 = List(2)
          assertPayload(expectedEventIds_1)
          val lastEventId = payloads.head.lastEventId
          payloads.clear()

          val aspectDefinition2 = AspectDefinition("testId2", "testName2", Some(JsObject()))
          // Generate but not process event with ID of 3 as the hook is waiting for ack.
          param.asAdmin(Post("/v0/aspects", aspectDefinition2)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Util.waitUntilAllDone()
          payloads.length shouldBe 0

          // Process event with ID of 3.
          param.asAdmin(Post("/v0/hooks/test/ack",
            WebHookAcknowledgement(succeeded = true, Some(lastEventId)))) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val expectedEventIds_2 = List(3)
          assertPayload(expectedEventIds_2)
        }
      }

      it("When recipient returns success code, registry should reset webHook lastRetryTime & retryCount") { param =>
        def response(): ToResponseMarshallable = {
          StatusCodes.OK
        }

        testWebHookWithResponse(param, Some(defaultWebHook), response) { (_, _) =>
          //--- retry will increase try count and set lastRetryTime
          DB localTx { session =>
            HookPersistence.retry(session, "test")
          }

          param.asAdmin(Get("/v0/hooks/test")) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val hook = responseAs[WebHook]
            hook.active shouldEqual true
            hook.retryCount shouldEqual 1
            hook.lastRetryTime.isEmpty shouldEqual false
          }

          val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
          // Generate and process event with ID of 2.
          param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val expectedEventIds = List(2)
          assertPayload(expectedEventIds)

          param.asAdmin(Get("/v0/hooks/test")) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val hook = responseAs[WebHook]
            hook.active shouldEqual true
            hook.retryCount shouldEqual 0
            hook.lastRetryTime.isEmpty shouldEqual true
          }
        }
      }

    }
  }

  describe("Retry inactive Webhooks") {

    it("Will restart inactive hook and start to process event immediately") { param =>
      // an inactive hook
      val hook = defaultWebHook.copy(
        url = "http://localhost:" + server.localAddress.getPort.toString + "/hook",
        active = false,
        enabled = true)

      val hookId = hook.id.get
      Util.getWebHookActor(hookId) shouldBe None

      param.asAdmin(Post("/v0/hooks", hook)) ~> param.api(Full).routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      Util.waitUntilAllDone(1000)
      Util.getWebHookActor(hookId) shouldBe None

      def response(): ToResponseMarshallable = {
        StatusCodes.OK
      }

      this.currentResponse = Some(response)

      val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
      // Generate but not process event with ID of 2 as the hook is inactive.
      param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api(Full).routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      Util.waitUntilAllDone()
      payloads.length should be(0)

      // Send message to trigger the retry.
      // Will process event with ID of 2.
      // This will take some time so we wait a little bit longer than usual.
      val actor = param.webHookActor
      actor ! WebHookActor.RetryInactiveHooks
      Util.waitUntilAllDone(1000)

      // Check the hook again to see if it's live now
      Util.getWebHookActor(hookId) should not be None

      // Should send one request to hook
      payloads.length should be(1)
      payloads.last.lastEventId shouldBe 2

    }

    it("Will not restart disabled inactive hook") { param =>

      val hook = defaultWebHook.copy(
        url = "http://localhost:" + server.localAddress.getPort.toString + "/hook",
        active = false,
        enabled = false)

      val hookId = hook.id.get

      Util.getWebHookActor(hookId) shouldBe None

      param.asAdmin(Post("/v0/hooks", hook)) ~> param.api(Full).routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      Util.waitUntilAllDone()
      Util.getWebHookActor(hookId) shouldBe None

      // --- send message to trigger the retry
      WebHookActor.RetryInactiveHooks
      Util.waitUntilAllDone()

      Util.getWebHookActor(hookId) shouldBe None

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

  var currentHttpStatusCode: StatusCode = StatusCodes.OK
  var currentResponse: Option[() => ToResponseMarshallable] = None
  val payloads: ArrayBuffer[WebHookPayload] = ArrayBuffer[WebHookPayload]()
  val route: Route = post {
    path("hook") {
      entity(as[WebHookPayload]) { payload =>
        payloads.append(payload)

        if (currentHttpStatusCode == StatusCodes.InternalServerError)
          complete(currentHttpStatusCode)
        else
          complete(currentResponse.get())
      } ~ complete(StatusCodes.BlockedByParentalControls)
    }
  }
  val server: Http.ServerBinding = createHookRoute(route)

  override def afterAll() {
    Await.result(server.unbind(), 30 seconds)
    Util.clearWebHookActorsCache()
  }

  private def testWebHookWithResponse(param: FixtureParam, webHook: Option[WebHook], response: () ⇒ ToResponseMarshallable)(testCallback: (ArrayBuffer[WebHookPayload], ActorRef) => Unit): Unit = {
    // Why this super-global approach instead of creating a new http server for each test? For some reason if you do it fast enough,
    // the akka http server from the old test can receive hooks for the new server, even after you've waited for it to unbind and bound
    // the new one on the current port (this is hard to reproduce but happens maybe 1/20th of the time.
    this.currentResponse = Some(response)
    val hook = webHook.getOrElse(defaultWebHook).copy(url = "http://localhost:" + server.localAddress.getPort.toString + "/hook")
    // Create a new web hook actor asynchronously.
    param.asAdmin(Post("/v0/hooks", hook)) ~> param.api(Full).routes ~> check {
      status shouldEqual StatusCodes.OK
    }

    if (hook.active && hook.enabled)
      Util.waitUntilWebHookActorIsInCache(hook.id.get)
    else
      Util.waitUntilAllDone()

    val actor = param.webHookActor

    try {
      testCallback(payloads, actor)
    } finally {
      payloads.clear()
    }
  }

  private def testWebHook(param: FixtureParam, webHook: Option[WebHook], succeeded: Boolean = true)(testCallback: (ArrayBuffer[WebHookPayload], ActorRef) => Unit): Unit = {
    if (succeeded) {
      currentHttpStatusCode = StatusCodes.OK
      testWebHookWithResponse(param, webHook, () => "got it")(testCallback)
    }
    else {
      currentHttpStatusCode = StatusCodes.InternalServerError
      testWebHookWithResponse(param, webHook, () => "failed")(testCallback)
    }
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
