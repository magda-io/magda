package au.csiro.data61.magda.registry

import akka.http.scaladsl.model.StatusCodes
import gnieh.diffson._
import gnieh.diffson.sprayJson._
import spray.json._
import au.csiro.data61.magda.model.Registry.Record
import scala.concurrent.duration._
import au.csiro.data61.magda.model.Registry._

class RecordsServiceSpec extends ApiSpec {
  describe("GET") {
    it("starts with no records defined") { param =>
      Get("/v0/records") ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[RecordSummariesPage].records shouldBe empty
      }
    }

    it("returns 404 if the given ID does not exist") { param =>
      Get("/v0/records/foo") ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.NotFound
        responseAs[BadRequest].message should include("exist")
      }
    }

    it("returns 404 if the given ID does not have a required aspect") { param =>
      val aspectDefinition = AspectDefinition("test", "test", None)
      param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("foo", "foo", Map())
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      Get("/v0/records/foo?aspect=test") ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.NotFound
        responseAs[BadRequest].message should include("exist")
      }
    }

    describe("aspects") {
      it("includes optionalAspect if it exists") { param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val recordWithAspect = Record("with", "with", Map("test" -> JsObject("foo" -> JsString("bar"))))
        param.asAdmin(Post("/v0/records", recordWithAspect)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val recordWithoutAspect = Record("without", "without", Map())
        param.asAdmin(Post("/v0/records", recordWithoutAspect)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Get("/v0/records?optionalAspect=test") ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
          val page = responseAs[RecordsPage]
          page.records.length shouldBe 2
          page.records(0) shouldBe recordWithAspect
          page.records(1) shouldBe recordWithoutAspect
        }
      }

      it("requires presence of aspect") { param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val recordWithAspect = Record("with", "with", Map("test" -> JsObject("foo" -> JsString("bar"))))
        param.asAdmin(Post("/v0/records", recordWithAspect)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val recordWithoutAspect = Record("without", "without", Map())
        param.asAdmin(Post("/v0/records", recordWithoutAspect)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Get("/v0/records?aspect=test") ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
          val page = responseAs[RecordsPage]
          page.records.length shouldBe 1
          page.records(0) shouldBe recordWithAspect
        }
      }

      it("requires any specified aspects to be present") { param =>
        val fooAspect = AspectDefinition("foo", "foo", None)
        param.asAdmin(Post("/v0/aspects", fooAspect)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val barAspect = AspectDefinition("bar", "bar", None)
        param.asAdmin(Post("/v0/aspects", barAspect)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val withFoo = Record("withFoo", "with foo", Map("foo" -> JsObject("test" -> JsString("test"))))
        param.asAdmin(Post("/v0/records", withFoo)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val withBar = Record("withBar", "with bar", Map("bar" -> JsObject("test" -> JsString("test"))))
        param.asAdmin(Post("/v0/records", withBar)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val withFooAndBar = Record("withFooAndBar", "with foo and bar", Map("foo" -> JsObject(), "bar" -> JsObject("test" -> JsString("test"))))
        param.asAdmin(Post("/v0/records", withFooAndBar)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Get("/v0/records?aspect=foo&aspect=bar") ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
          val page = responseAs[RecordsPage]
          page.records.length shouldBe 1
          page.records(0) shouldBe withFooAndBar
        }
      }

      it("optionalAspects are optional") { param =>
        val fooAspect = AspectDefinition("foo", "foo", None)
        param.asAdmin(Post("/v0/aspects", fooAspect)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val barAspect = AspectDefinition("bar", "bar", None)
        param.asAdmin(Post("/v0/aspects", barAspect)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val withFoo = Record("withFoo", "with foo", Map("foo" -> JsObject("test" -> JsString("test"))))
        param.asAdmin(Post("/v0/records", withFoo)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val withBar = Record("withBar", "with bar", Map("bar" -> JsObject("test" -> JsString("test"))))
        param.asAdmin(Post("/v0/records", withBar)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val withFooAndBar = Record("withFooAndBar", "with foo and bar", Map("foo" -> JsObject(), "bar" -> JsObject("test" -> JsString("test"))))
        param.asAdmin(Post("/v0/records", withFooAndBar)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val withNone = Record("withNone", "with none", Map())
        param.asAdmin(Post("/v0/records", withNone)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Get("/v0/records?optionalAspect=foo&optionalAspect=bar") ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
          val page = responseAs[RecordsPage]
          page.records.length shouldBe 4
          page.records(0) shouldBe withFoo
          page.records(1) shouldBe withBar
          page.records(2) shouldBe withFooAndBar
          page.records(3) shouldBe withNone
        }
      }

      it("supports a mix of aspects and optionalAspects") { param =>
        val fooAspect = AspectDefinition("foo", "foo", None)
        param.asAdmin(Post("/v0/aspects", fooAspect)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val barAspect = AspectDefinition("bar", "bar", None)
        param.asAdmin(Post("/v0/aspects", barAspect)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val bazAspect = AspectDefinition("baz", "baz", None)
        param.asAdmin(Post("/v0/aspects", bazAspect)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val withFoo = Record("withFoo", "with foo", Map("foo" -> JsObject("test" -> JsString("test"))))
        param.asAdmin(Post("/v0/records", withFoo)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val withBar = Record("withBar", "with bar", Map("bar" -> JsObject("test" -> JsString("test"))))
        param.asAdmin(Post("/v0/records", withBar)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val withFooAndBarAndBaz = Record("withFooAndBarAndBaz", "with foo and bar", Map("foo" -> JsObject(), "bar" -> JsObject("test" -> JsString("test")), "baz" -> JsObject()))
        param.asAdmin(Post("/v0/records", withFooAndBarAndBaz)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val withNone = Record("withNone", "with none", Map())
        param.asAdmin(Post("/v0/records", withNone)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Get("/v0/records?aspect=foo&optionalAspect=bar") ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
          val page = responseAs[RecordsPage]
          page.records.length shouldBe 2
          page.records(0) shouldBe withFoo

          // withFooAndBarAndBaz shouldn't include the baz aspect because it wasn't requested
          page.records(1) shouldBe withFooAndBarAndBaz.copy(aspects = withFooAndBarAndBaz.aspects - "baz")
        }
      }

      it("accepts URL-encoded aspect names") { param =>
        val aspect = AspectDefinition("with space", "foo", None)
        param.asAdmin(Post("/v0/aspects", aspect)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("whatever", "whatever", Map("with space" -> JsObject("test" -> JsString("test"))))
        param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Get("/v0/records?optionalAspect=with%20space") ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
          val page = responseAs[RecordsPage]
          page.records.length shouldBe 1
          page.records(0) shouldBe record
        }

        Get("/v0/records?aspect=with%20space") ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
          val page = responseAs[RecordsPage]
          page.records.length shouldBe 1
          page.records(0) shouldBe record
        }
      }
    }

    describe("dereference") {
      it("dereferences a single link if requested") { param =>
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
        val aspect = AspectDefinition("withLink", "with link", Some(JsonParser(jsonSchema).asJsObject))
        param.asAdmin(Post("/v0/aspects", aspect)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val source = Record("source", "source", Map("withLink" -> JsObject("someLink" -> JsString("target"))))
        param.asAdmin(Post("/v0/records", source)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val target = Record("target", "target", Map("withLink" -> JsObject("someLink" -> JsString("source"))))
        param.asAdmin(Post("/v0/records", target)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Get("/v0/records/source?aspect=withLink") ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record].aspects("withLink") shouldBe JsObject(
            "someLink" -> JsString("target"))
        }

        Get("/v0/records/source?aspect=withLink&dereference=false") ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record].aspects("withLink") shouldBe JsObject(
            "someLink" -> JsString("target"))
        }

        Get("/v0/records/source?aspect=withLink&dereference=true") ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record].aspects("withLink") shouldBe JsObject(
            "someLink" -> JsObject(
              "id" -> JsString("target"),
              "name" -> JsString("target"),
              "aspects" -> JsObject(
                "withLink" -> JsObject(
                  "someLink" -> JsString("source")))))
        }
      }

      it("dereferences an array of links if requested") { param =>
        val jsonSchema =
          """
            |{
            |    "$schema": "http://json-schema.org/hyper-schema#",
            |    "title": "An aspect with an array of links",
            |    "type": "object",
            |    "properties": {
            |        "someLinks": {
            |            "title": "Link to other records.",
            |            "type": "array",
            |            "items": {
            |                "title": "A link",
            |                "type": "string",
            |                "links": [
            |                    {
            |                        "href": "/api/v0/registry/records/{$}",
            |                        "rel": "item"
            |                    }
            |                ]
            |            }
            |        }
            |    }
            |}
          """.stripMargin
        val aspect = AspectDefinition("withLinks", "with links", Some(JsonParser(jsonSchema).asJsObject))
        param.asAdmin(Post("/v0/aspects", aspect)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val source = Record("source", "source", Map("withLinks" -> JsObject("someLinks" -> JsArray(JsString("target"), JsString("anotherTarget")))))
        param.asAdmin(Post("/v0/records", source)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val target = Record("target", "target", Map("withLinks" -> JsObject("someLinks" -> JsArray(JsString("source")))))
        param.asAdmin(Post("/v0/records", target)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val anotherTarget = Record("anotherTarget", "anotherTarget", Map("withLinks" -> JsObject("someLinks" -> JsArray(JsString("source")))))
        param.asAdmin(Post("/v0/records", anotherTarget)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Get("/v0/records/source?aspect=withLinks") ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record].aspects("withLinks") shouldBe JsObject(
            "someLinks" -> JsArray(JsString("target"), JsString("anotherTarget")))
        }

        Get("/v0/records/source?aspect=withLinks&dereference=false") ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record].aspects("withLinks") shouldBe JsObject(
            "someLinks" -> JsArray(JsString("target"), JsString("anotherTarget")))
        }

        Get("/v0/records/source?aspect=withLinks&dereference=true") ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record].aspects("withLinks") shouldBe JsObject(
            "someLinks" -> JsArray(
              JsObject(
                "id" -> JsString("target"),
                "name" -> JsString("target"),
                "aspects" -> JsObject(
                  "withLinks" -> JsObject(
                    "someLinks" -> JsArray(JsString("source"))))),
              JsObject(
                "id" -> JsString("anotherTarget"),
                "name" -> JsString("anotherTarget"),
                "aspects" -> JsObject(
                  "withLinks" -> JsObject(
                    "someLinks" -> JsArray(JsString("source")))))))
        }
      }
    }

    describe("paging") {
      it("honors the limit parameter") { param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        for (i <- 1 to 5) {
          val record = Record(i.toString, i.toString, Map("test" -> JsObject("value" -> JsNumber(i))))
          param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
            status shouldEqual StatusCodes.OK
          }
        }

        Get("/v0/records?limit=2") ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
          val page = responseAs[RecordSummariesPage]
          page.records.length shouldBe 2
          page.records(0).name shouldBe "1"
          page.records(1).name shouldBe "2"
        }

        Get("/v0/records?aspect=test&limit=2") ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
          val page = responseAs[RecordsPage]
          page.records.length shouldBe 2
          page.records(0).name shouldBe "1"
          page.records(1).name shouldBe "2"
        }
      }

      it("honors the start parameter") { param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        for (i <- 1 to 5) {
          val record = Record(i.toString, i.toString, Map("test" -> JsObject("value" -> JsNumber(i))))
          param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
            status shouldEqual StatusCodes.OK
          }
        }

        Get("/v0/records?start=3&limit=2") ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
          val page = responseAs[RecordSummariesPage]
          page.records.length shouldBe 2
          page.records(0).name shouldBe "4"
          page.records(1).name shouldBe "5"
        }

        Get("/v0/records?start=3&aspect=test&limit=2") ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
          val page = responseAs[RecordsPage]
          page.records.length shouldBe 2
          page.records(0).name shouldBe "4"
          page.records(1).name shouldBe "5"
        }
      }

      it("pageTokens can be used to page through results") { param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        for (i <- 1 to 5) {
          val record = Record(i.toString, i.toString, Map("test" -> JsObject("value" -> JsNumber(i))))
          param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
            status shouldEqual StatusCodes.OK
          }
        }

        Get("/v0/records?limit=2") ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
          val page = responseAs[RecordSummariesPage]
          page.records.length shouldBe 2
          page.records(0).name shouldBe "1"
          page.records(1).name shouldBe "2"

          Get(s"/v0/records?pageToken=${page.nextPageToken.get}&limit=2") ~> param.api.routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordSummariesPage]
            page.records.length shouldBe 2
            page.records(0).name shouldBe "3"
            page.records(1).name shouldBe "4"

            Get(s"/v0/records?pageToken=${page.nextPageToken.get}&limit=2") ~> param.api.routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordSummariesPage]
              page.records.length shouldBe 1
              page.records(0).name shouldBe "5"
            }
          }
        }

        Get("/v0/records?aspect=test&limit=2") ~> param.api.routes ~> check {
          status shouldEqual StatusCodes.OK
          val page = responseAs[RecordsPage]
          page.records.length shouldBe 2
          page.records(0).name shouldBe "1"
          page.records(1).name shouldBe "2"

          Get(s"/v0/records?aspect=test&pageToken=${page.nextPageToken.get}&limit=2") ~> param.api.routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage]
            page.records.length shouldBe 2
            page.records(0).name shouldBe "3"
            page.records(1).name shouldBe "4"

            Get(s"/v0/records?aspect=test&pageToken=${page.nextPageToken.get}&limit=2") ~> param.api.routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage]
              page.records.length shouldBe 1
              page.records(0).name shouldBe "5"
            }
          }
        }
      }
    }
  }

  describe("POST") {
    it("can add a new record") { param =>
      val record = Record("testId", "testName", Map())
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual record
      }

      Get("/v0/records") ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK

        val recordPage = responseAs[RecordSummariesPage]
        recordPage.records.length shouldEqual 1
        recordPage.records(0) shouldEqual RecordSummary("testId", "testName", List())
      }
    }

    it("supports invalid URL characters in ID") { param =>
      val record = Record("in valid", "testName", Map())
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual record
      }

      Get("/v0/records/in%20valid") ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[RecordSummary] shouldEqual RecordSummary("in valid", "testName", List())
      }
    }

    it("returns 400 if a record with the given ID already exists") { param =>
      val record = Record("testId", "testName", Map())
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual record
      }

      val updated = record.copy(name = "foo")
      param.asAdmin(Post("/v0/records", updated)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.BadRequest
        responseAs[BadRequest].message should include("already exists")
      }
    }

    it("triggers WebHook processing") { param =>
      val record = Record("testId", "testName", Map())
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual record
      }

      param.webHookActorProbe.expectMsg(1 millis, WebHookActor.Process)
    }

    checkMustBeAdmin {
      val record = Record("testId", "testName", Map())
      Post("/v0/records", record)
    }
  }

  describe("PUT") {
    it("can add a new record") { param =>
      val record = Record("testId", "testName", Map())
      param.asAdmin(Put("/v0/records/testId", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual record
      }

      Get("/v0/records") ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK

        val recordsPage = responseAs[RecordSummariesPage]
        recordsPage.records.length shouldEqual 1
        recordsPage.records(0) shouldEqual RecordSummary("testId", "testName", List())
      }
    }

    it("can update an existing record") { param =>
      val record = Record("testId", "testName", Map())
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val newRecord = record.copy(name = "newName")
      param.asAdmin(Put("/v0/records/testId", newRecord)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual newRecord
      }

      Get("/v0/records/testId") ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[RecordSummary] shouldEqual RecordSummary("testId", "newName", List())
      }
    }

    it("cannot change the ID of an existing record") { param =>
      val record = Record("testId", "testName", Map())
      param.asAdmin(Put("/v0/records/testId", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual record
      }

      val updated = record.copy(id = "foo")
      param.asAdmin(Put("/v0/records/testId", updated)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.BadRequest
        responseAs[BadRequest].message should include("does not match the record")
      }
    }

    it("supports invalid URL characters in ID") { param =>
      val record = Record("in valid", "testName", Map())
      param.asAdmin(Put("/v0/records/in%20valid", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual record
      }

      Get("/v0/records/in%20valid") ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[RecordSummary] shouldEqual RecordSummary("in valid", "testName", List())
      }
    }

    it("can add an aspect") { param =>
      val aspectDefinition = AspectDefinition("test", "test", None)
      param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("testId", "testName", Map())
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val updated = record.copy(aspects = Map("test" -> JsObject()))
      param.asAdmin(Put("/v0/records/testId", updated)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual updated
      }

      Get("/v0/records/testId?aspect=test") ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual updated
      }
    }

    it("can modify an aspect") { param =>
      val aspectDefinition = AspectDefinition("test", "test", None)
      param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))))
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val updated = record.copy(aspects = Map("test" -> JsObject("foo" -> JsString("baz"))))
      param.asAdmin(Put("/v0/records/testId", updated)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual updated
      }

      Get("/v0/records/testId?aspect=test") ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual updated
      }
    }

    it("does not remove aspects simply because they're missing from the PUT payload") { param =>
      val aspectDefinition = AspectDefinition("test", "test", None)
      param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))))
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      // TODO: the PUT should return the real record, not just echo back what the user provided.
      //       i.e. the aspects should be included.  I think.
      val updated = record.copy(aspects = Map())
      param.asAdmin(Put("/v0/records/testId", updated)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual updated
      }

      Get("/v0/records/testId?aspect=test") ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual record
      }
    }

    it("triggers WebHook processing") { param =>
      val record = Record("testId", "testName", Map())
      param.asAdmin(Put("/v0/records/testId", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual record
      }

      param.webHookActorProbe.expectMsg(1 millis, WebHookActor.Process)
    }

    checkMustBeAdmin {
      val record = Record("testId", "testName", Map())
      Put("/v0/records/testId", record)
    }
  }

  describe("PATCH") {
    it("returns an error when the record does not exist") { param =>
      val patch = JsonPatch()
      param.asAdmin(Patch("/v0/records/doesnotexist", patch)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.BadRequest
        responseAs[BadRequest].message should include("exists")
        responseAs[BadRequest].message should include("ID")
      }
    }

    it("can modify a record's name") { param =>
      val record = Record("testId", "testName", Map())
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val patch = JsonPatch(Replace(Pointer.root / "name", JsString("foo")))
      param.asAdmin(Patch("/v0/records/testId", patch)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "foo", Map())
      }

      Get("/v0/records/testId") ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[RecordSummary] shouldEqual RecordSummary("testId", "foo", List())
      }
    }

    it("cannot modify a record's ID") { param =>
      val record = Record("testId", "testName", Map())
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val patch = JsonPatch(Replace(Pointer.root / "id", JsString("foo")))
      param.asAdmin(Patch("/v0/records/testId", patch)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.BadRequest
        responseAs[BadRequest].message should include("ID")
      }
    }

    it("can add an aspect") { param =>
      val aspectDefinition = AspectDefinition("test", "test", None)
      param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("testId", "testName", Map())
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val patch = JsonPatch(Add(Pointer.root / "aspects" / "test", JsObject()))
      param.asAdmin(Patch("/v0/records/testId", patch)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject()))
      }

      Get("/v0/records/testId?aspect=test") ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject()))
      }
    }

    it("can modify an aspect") { param =>
      val aspectDefinition = AspectDefinition("test", "test", None)
      param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))))
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val patch = JsonPatch(Replace(Pointer.root / "aspects" / "test" / "foo", JsString("baz")))
      param.asAdmin(Patch("/v0/records/testId", patch)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("baz"))))
      }

      Get("/v0/records/testId?aspect=test") ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("baz"))))
      }
    }

    it("can add a new property to an aspect") { param =>
      val aspectDefinition = AspectDefinition("test", "test", None)
      param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))))
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val patch = JsonPatch(Add(Pointer.root / "aspects" / "test" / "newprop", JsString("test")))
      param.asAdmin(Patch("/v0/records/testId", patch)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"), "newprop" -> JsString("test"))))
      }

      Get("/v0/records/testId?aspect=test") ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"), "newprop" -> JsString("test"))))
      }
    }

    it("can remove an aspect") { param =>
      val aspectDefinition = AspectDefinition("test", "test", None)
      param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))))
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val patch = JsonPatch(Remove(Pointer.root / "aspects" / "test"))
      param.asAdmin(Patch("/v0/records/testId", patch)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "testName", Map())
      }

      Get("/v0/records/testId?optionalAspect=test") ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "testName", Map())
      }
    }

    it("can remove a property from an aspect") { param =>
      val aspectDefinition = AspectDefinition("test", "test", None)
      param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"), "newprop" -> JsString("test"))))
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val patch = JsonPatch(Remove(Pointer.root / "aspects" / "test" / "newprop"))
      param.asAdmin(Patch("/v0/records/testId", patch)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))))
      }

      Get("/v0/records/testId?optionalAspect=test") ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))))
      }
    }

    it("supports Move within an aspect") { param =>
      val aspectDefinition = AspectDefinition("test", "test", None)
      param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))))
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val patch = JsonPatch(Move(Pointer.root / "aspects" / "test" / "foo", Pointer.root / "aspects" / "test" / "bar"))
      param.asAdmin(Patch("/v0/records/testId", patch)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("bar" -> JsString("bar"))))
      }

      Get("/v0/records/testId?optionalAspect=test") ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("bar" -> JsString("bar"))))
      }
    }

    it("supports Copy within an aspect") { param =>
      val aspectDefinition = AspectDefinition("test", "test", None)
      param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))))
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val patch = JsonPatch(Copy(Pointer.root / "aspects" / "test" / "foo", Pointer.root / "aspects" / "test" / "bar"))
      param.asAdmin(Patch("/v0/records/testId", patch)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"), "bar" -> JsString("bar"))))
      }

      Get("/v0/records/testId?optionalAspect=test") ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"), "bar" -> JsString("bar"))))
      }
    }

    it("evaluates Test operations") { param =>
      val A = AspectDefinition("A", "A", None)
      param.asAdmin(Post("/v0/aspects", A)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar"))))
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val patchSuccess = JsonPatch(Test(Pointer.root / "aspects" / "A" / "foo", JsString("bar")))
      param.asAdmin(Patch("/v0/records/testId", patchSuccess)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar"))))
      }

      val patchFail = JsonPatch(Test(Pointer.root / "aspects" / "A" / "foo", JsString("not this value")))
      param.asAdmin(Patch("/v0/records/testId", patchFail)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.BadRequest
        responseAs[BadRequest].message should include("test failed")
      }
    }

    it("does not support Move between aspects") { param =>
      val A = AspectDefinition("A", "A", None)
      param.asAdmin(Post("/v0/aspects", A)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val B = AspectDefinition("B", "B", None)
      param.asAdmin(Post("/v0/aspects", B)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject()))
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val patch = JsonPatch(Move(Pointer.root / "aspects" / "A" / "foo", Pointer.root / "aspects" / "B" / "foo"))
      param.asAdmin(Patch("/v0/records/testId", patch)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.BadRequest
        responseAs[BadRequest].message should include("two different aspects")
      }
    }

    it("does not support Copy between aspects") { param =>
      val A = AspectDefinition("A", "A", None)
      param.asAdmin(Post("/v0/aspects", A)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val B = AspectDefinition("B", "B", None)
      param.asAdmin(Post("/v0/aspects", B)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject()))
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val patch = JsonPatch(Copy(Pointer.root / "aspects" / "A" / "foo", Pointer.root / "aspects" / "B" / "foo"))
      param.asAdmin(Patch("/v0/records/testId", patch)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.BadRequest
        responseAs[BadRequest].message should include("two different aspects")
      }
    }

    it("triggers WebHook process") { param =>
      val record = Record("testId", "testName", Map())
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      param.webHookActorProbe.expectMsg(1 millis, WebHookActor.Process)

      val patch = JsonPatch(Replace(Pointer.root / "name", JsString("foo")))
      param.asAdmin(Patch("/v0/records/testId", patch)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "foo", Map())
      }

      param.webHookActorProbe.expectMsg(1 millis, WebHookActor.Process)
    }

    checkMustBeAdmin {
      val patch = JsonPatch(Replace(Pointer.root / "name", JsString("foo")))
      Patch("/v0/records/testId", patch)
    }
  }

  describe("DELETE") {
    it("can delete a record without any aspects") { param =>
      val record = Record("without", "without", Map())
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      param.asAdmin(Delete("/v0/records/without")) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[DeleteResult].deleted shouldBe true
      }
    }

    it("returns 200 and deleted=false when asked to delete a record that doesn't exist") { param =>
      param.asAdmin(Delete("/v0/records/doesnotexist")) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[DeleteResult].deleted shouldBe false
      }
    }

    it("can delete a record with an aspect") { param =>
      val aspectDefinition = AspectDefinition("test", "test", None)
      param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("with", "with", Map("test" -> JsObject()))
      param.asAdmin(Post("/v0/records", record)) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      param.asAdmin(Delete("/v0/records/with")) ~> param.api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[DeleteResult].deleted shouldBe true
      }
    }
    
    checkMustBeAdmin {
      Delete("/v0/records/without")
    }
  }
}
