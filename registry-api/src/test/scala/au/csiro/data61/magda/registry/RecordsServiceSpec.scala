package au.csiro.data61.magda.registry

import akka.http.scaladsl.model.StatusCodes
import gnieh.diffson._
import gnieh.diffson.sprayJson._
import spray.json._

class RecordsServiceSpec extends ApiSpec {
  describe("GET") {
    it("starts with no records defined") { api =>
      Get("/api/0.1/records") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[RecordSummariesPage].records shouldBe empty
      }
    }

    it("returns 404 if the given ID does not exist") { api =>
      Get("/api/0.1/records/foo") ~> api.routes ~> check {
        status shouldEqual StatusCodes.NotFound
        responseAs[BadRequest].message should include ("exist")
      }
    }

    it("returns 404 if the given ID does not have a required aspect") { api =>
      val aspectDefinition = AspectDefinition("test", "test", None)
      Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("foo", "foo", Map())
      Post("/api/0.1/records", record) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      Get("/api/0.1/records/foo?aspect=test") ~> api.routes ~> check {
        status shouldEqual StatusCodes.NotFound
        responseAs[BadRequest].message should include ("exist")
      }
    }

    it("includes optionalAspect if it exists") { api =>
      val aspectDefinition = AspectDefinition("test", "test", None)
      Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val recordWithAspect = Record("with", "with", Map("test" -> JsObject("foo" -> JsString("bar"))))
      Post("/api/0.1/records", recordWithAspect) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val recordWithoutAspect = Record("without", "without", Map())
      Post("/api/0.1/records", recordWithoutAspect) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      Get("/api/0.1/records?optionalAspect=test") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        val page = responseAs[RecordsPage]
        page.records.length shouldBe 2
        page.records(0) shouldBe recordWithAspect
        page.records(1) shouldBe recordWithoutAspect
      }
    }

    it("requires presence of aspect") { api =>
      val aspectDefinition = AspectDefinition("test", "test", None)
      Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val recordWithAspect = Record("with", "with", Map("test" -> JsObject("foo" -> JsString("bar"))))
      Post("/api/0.1/records", recordWithAspect) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val recordWithoutAspect = Record("without", "without", Map())
      Post("/api/0.1/records", recordWithoutAspect) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      Get("/api/0.1/records?aspect=test") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        val page = responseAs[RecordsPage]
        page.records.length shouldBe 1
        page.records(0) shouldBe recordWithAspect
      }
    }

    it("requires any specified aspects to be present") { api =>
      val fooAspect = AspectDefinition("foo", "foo", None)
      Post("/api/0.1/aspects", fooAspect) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val barAspect = AspectDefinition("bar", "bar", None)
      Post("/api/0.1/aspects", barAspect) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val withFoo = Record("withFoo", "with foo", Map("foo" -> JsObject("test" -> JsString("test"))))
      Post("/api/0.1/records", withFoo) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val withBar = Record("withBar", "with bar", Map("bar" -> JsObject("test" -> JsString("test"))))
      Post("/api/0.1/records", withBar) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val withFooAndBar = Record("withFooAndBar", "with foo and bar", Map("foo" -> JsObject(), "bar" -> JsObject("test" -> JsString("test"))))
      Post("/api/0.1/records", withFooAndBar) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      Get("/api/0.1/records?aspect=foo&aspect=bar") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        val page = responseAs[RecordsPage]
        page.records.length shouldBe 1
        page.records(0) shouldBe withFooAndBar
      }
    }

    it("optionalAspects are optional") { api =>
      val fooAspect = AspectDefinition("foo", "foo", None)
      Post("/api/0.1/aspects", fooAspect) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val barAspect = AspectDefinition("bar", "bar", None)
      Post("/api/0.1/aspects", barAspect) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val withFoo = Record("withFoo", "with foo", Map("foo" -> JsObject("test" -> JsString("test"))))
      Post("/api/0.1/records", withFoo) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val withBar = Record("withBar", "with bar", Map("bar" -> JsObject("test" -> JsString("test"))))
      Post("/api/0.1/records", withBar) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val withFooAndBar = Record("withFooAndBar", "with foo and bar", Map("foo" -> JsObject(), "bar" -> JsObject("test" -> JsString("test"))))
      Post("/api/0.1/records", withFooAndBar) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val withNone = Record("withNone", "with none", Map())
      Post("/api/0.1/records", withNone) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      Get("/api/0.1/records?optionalAspect=foo&optionalAspect=bar") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        val page = responseAs[RecordsPage]
        page.records.length shouldBe 4
        page.records(0) shouldBe withFoo
        page.records(1) shouldBe withBar
        page.records(2) shouldBe withFooAndBar
        page.records(3) shouldBe withNone
      }
    }

    it("supports a mix of aspects and optionalAspects") { api =>
      val fooAspect = AspectDefinition("foo", "foo", None)
      Post("/api/0.1/aspects", fooAspect) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val barAspect = AspectDefinition("bar", "bar", None)
      Post("/api/0.1/aspects", barAspect) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val bazAspect = AspectDefinition("baz", "baz", None)
      Post("/api/0.1/aspects", bazAspect) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val withFoo = Record("withFoo", "with foo", Map("foo" -> JsObject("test" -> JsString("test"))))
      Post("/api/0.1/records", withFoo) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val withBar = Record("withBar", "with bar", Map("bar" -> JsObject("test" -> JsString("test"))))
      Post("/api/0.1/records", withBar) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val withFooAndBarAndBaz = Record("withFooAndBarAndBaz", "with foo and bar", Map("foo" -> JsObject(), "bar" -> JsObject("test" -> JsString("test")), "baz" -> JsObject()))
      Post("/api/0.1/records", withFooAndBarAndBaz) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val withNone = Record("withNone", "with none", Map())
      Post("/api/0.1/records", withNone) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      Get("/api/0.1/records?aspect=foo&optionalAspect=bar") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        val page = responseAs[RecordsPage]
        page.records.length shouldBe 2
        page.records(0) shouldBe withFoo

        // withFooAndBarAndBaz shouldn't include the baz aspect because it wasn't requested
        page.records(1) shouldBe withFooAndBarAndBaz.copy(aspects = withFooAndBarAndBaz.aspects - "baz")
      }
    }

    it("accepts URL-encoded aspect names") { api =>
      val aspect = AspectDefinition("with space", "foo", None)
      Post("/api/0.1/aspects", aspect) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("whatever", "whatever", Map("with space" -> JsObject("test" -> JsString("test"))))
      Post("/api/0.1/records", record) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      Get("/api/0.1/records?optionalAspect=with%20space") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        val page = responseAs[RecordsPage]
        page.records.length shouldBe 1
        page.records(0) shouldBe record
      }

      Get("/api/0.1/records?aspect=with%20space") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        val page = responseAs[RecordsPage]
        page.records.length shouldBe 1
        page.records(0) shouldBe record
      }
    }

    it("dereferences a single link if requested") { api =>
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
          |                    "href": "/api/0.1/records/{$}",
          |                    "rel": "item"
          |                }
          |            ]
          |        }
          |    }
          |}
        """.stripMargin
      val aspect = AspectDefinition("withLink", "with link", Some(JsonParser(jsonSchema).asJsObject))
      Post("/api/0.1/aspects", aspect) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val source = Record("source", "source", Map("withLink" -> JsObject("someLink" -> JsString("target"))))
      Post("/api/0.1/records", source) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val target = Record("target", "target", Map("withLink" -> JsObject("someLink" -> JsString("source"))))
      Post("/api/0.1/records", target) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      Get("/api/0.1/records/source?aspect=withLink") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record].aspects("withLink") shouldBe JsObject(
          "someLink" -> JsString("target")
        )
      }

      Get("/api/0.1/records/source?aspect=withLink&dereference=false") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record].aspects("withLink") shouldBe JsObject(
          "someLink" -> JsString("target")
        )
      }

      Get("/api/0.1/records/source?aspect=withLink&dereference=true") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record].aspects("withLink") shouldBe JsObject(
          "someLink" -> JsObject(
            "id" -> JsString("target"),
            "name" -> JsString("target"),
            "aspects" -> JsObject(
              "withLink" -> JsObject(
                "someLink" -> JsString("source")
              )
            )
          )
        )
      }
    }

    it("dereferences an array of links if requested") { api =>
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
          |                        "href": "/api/0.1/records/{$}",
          |                        "rel": "item"
          |                    }
          |                ]
          |            }
          |        }
          |    }
          |}
        """.stripMargin
      val aspect = AspectDefinition("withLinks", "with links", Some(JsonParser(jsonSchema).asJsObject))
      Post("/api/0.1/aspects", aspect) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val source = Record("source", "source", Map("withLinks" -> JsObject("someLinks" -> JsArray(JsString("target"), JsString("anotherTarget")))))
      Post("/api/0.1/records", source) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val target = Record("target", "target", Map("withLinks" -> JsObject("someLinks" -> JsArray(JsString("source")))))
      Post("/api/0.1/records", target) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val anotherTarget = Record("anotherTarget", "anotherTarget", Map("withLinks" -> JsObject("someLinks" -> JsArray(JsString("source")))))
      Post("/api/0.1/records", anotherTarget) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      Get("/api/0.1/records/source?aspect=withLinks") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record].aspects("withLinks") shouldBe JsObject(
          "someLinks" -> JsArray(JsString("target"), JsString("anotherTarget"))
        )
      }

      Get("/api/0.1/records/source?aspect=withLinks&dereference=false") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record].aspects("withLinks") shouldBe JsObject(
          "someLinks" -> JsArray(JsString("target"), JsString("anotherTarget"))
        )
      }

      Get("/api/0.1/records/source?aspect=withLinks&dereference=true") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record].aspects("withLinks") shouldBe JsObject(
          "someLinks" -> JsArray(
            JsObject(
              "id" -> JsString("target"),
              "name" -> JsString("target"),
              "aspects" -> JsObject(
                "withLinks" -> JsObject(
                  "someLinks" -> JsArray(JsString("source"))
                )
              )
            ),
            JsObject(
              "id" -> JsString("anotherTarget"),
              "name" -> JsString("anotherTarget"),
              "aspects" -> JsObject(
                "withLinks" -> JsObject(
                  "someLinks" -> JsArray(JsString("source"))
                )
              )
            )
          )
        )
      }
    }
  }

  describe("POST") {
    it("can add a new record") { api =>
      val record = Record("testId", "testName", Map())
      Post("/api/0.1/records", record) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual record
      }

      Get("/api/0.1/records") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK

        val recordPage = responseAs[RecordSummariesPage]
        recordPage.records.length shouldEqual 1
        recordPage.records(0) shouldEqual RecordSummary("testId", "testName", List())
      }
    }

    it("supports invalid URL characters in ID") { api =>
      val record = Record("in valid", "testName", Map())
      Post("/api/0.1/records", record) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual record
      }

      Get("/api/0.1/records/in%20valid") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[RecordSummary] shouldEqual RecordSummary("in valid", "testName", List())
      }
    }

    it("returns 400 if a record with the given ID already exists") { api =>
      val record = Record("testId", "testName", Map())
      Post("/api/0.1/records", record) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual record
      }

      val updated = record.copy(name = "foo")
      Post("/api/0.1/records", updated) ~> api.routes ~> check {
        status shouldEqual StatusCodes.BadRequest
        responseAs[BadRequest].message should include ("already exists")
      }
    }
  }

  describe("PUT") {
    it("can add a new record") { api =>
      val record = Record("testId", "testName", Map())
      Put("/api/0.1/records/testId", record) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual record
      }

      Get("/api/0.1/records") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK

        val recordsPage = responseAs[RecordSummariesPage]
        recordsPage.records.length shouldEqual 1
        recordsPage.records(0) shouldEqual RecordSummary("testId", "testName", List())
      }
    }

    it("can update an existing record") { api =>
      val record = Record("testId", "testName", Map())
      Post("/api/0.1/records", record) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val newRecord = record.copy(name = "newName")
      Put("/api/0.1/records/testId", newRecord) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual newRecord
      }

      Get("/api/0.1/records/testId") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[RecordSummary] shouldEqual RecordSummary("testId", "newName", List())
      }
    }

    it("cannot change the ID of an existing record") { api =>
      val record = Record("testId", "testName", Map())
      Put("/api/0.1/records/testId", record) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual record
      }

      val updated = record.copy(id = "foo")
      Put("/api/0.1/records/testId", updated) ~> api.routes ~> check {
        status shouldEqual StatusCodes.BadRequest
        responseAs[BadRequest].message should include ("does not match the record")
      }
    }

    it("supports invalid URL characters in ID") { api =>
      val record = Record("in valid", "testName", Map())
      Put("/api/0.1/records/in%20valid", record) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual record
      }

      Get("/api/0.1/records/in%20valid") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[RecordSummary] shouldEqual RecordSummary("in valid", "testName", List())
      }
    }

    it("can add an aspect") { api =>
      val aspectDefinition = AspectDefinition("test", "test", None)
      Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("testId", "testName", Map())
      Post("/api/0.1/records", record) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val updated = record.copy(aspects = Map("test" -> JsObject()))
      Put("/api/0.1/records/testId", updated) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual updated
      }

      Get("/api/0.1/records/testId?aspect=test") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual updated
      }
    }

    it("can modify an aspect") { api =>
      val aspectDefinition = AspectDefinition("test", "test", None)
      Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))))
      Post("/api/0.1/records", record) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val updated = record.copy(aspects = Map("test" -> JsObject("foo" -> JsString("baz"))))
      Put("/api/0.1/records/testId", updated) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual updated
      }

      Get("/api/0.1/records/testId?aspect=test") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual updated
      }
    }

    it("does not remove aspects simply because they're missing from the PUT payload") { api =>
      val aspectDefinition = AspectDefinition("test", "test", None)
      Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))))
      Post("/api/0.1/records", record) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      // TODO: the PUT should return the real record, not just echo back what the user provided.
      //       i.e. the aspects should be included.  I think.
      val updated = record.copy(aspects = Map())
      Put("/api/0.1/records/testId", updated) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual updated
      }

      Get("/api/0.1/records/testId?aspect=test") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual record
      }
    }
  }

  describe("PATCH") {
    it("returns an error when the record does not exist") { api =>
      val patch = JsonPatch()
      Patch("/api/0.1/records/doesnotexist", patch) ~> api.routes ~> check {
        status shouldEqual StatusCodes.BadRequest
        responseAs[BadRequest].message should include ("exists")
        responseAs[BadRequest].message should include ("ID")
      }
    }

    it("can modify a record's name") { api =>
      val record = Record("testId", "testName", Map())
      Post("/api/0.1/records", record) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val patch = JsonPatch(Replace(Pointer.root / "name", JsString("foo")))
      Patch("/api/0.1/records/testId", patch) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "foo", Map())
      }

      Get("/api/0.1/records/testId") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[RecordSummary] shouldEqual RecordSummary("testId", "foo", List())
      }
    }

    it("cannot modify a record's ID") { api =>
      val record = Record("testId", "testName", Map())
      Post("/api/0.1/records", record) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val patch = JsonPatch(Replace(Pointer.root / "id", JsString("foo")))
      Patch("/api/0.1/records/testId", patch) ~> api.routes ~> check {
        status shouldEqual StatusCodes.BadRequest
        responseAs[BadRequest].message should include ("ID")
      }
    }

    it("can add an aspect") { api =>
      val aspectDefinition = AspectDefinition("test", "test", None)
      Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("testId", "testName", Map())
      Post("/api/0.1/records", record) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val patch = JsonPatch(Add(Pointer.root / "aspects" / "test", JsObject()))
      Patch("/api/0.1/records/testId", patch) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject()))
      }

      Get("/api/0.1/records/testId?aspect=test") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject()))
      }
    }

    it("can modify an aspect") { api =>
      val aspectDefinition = AspectDefinition("test", "test", None)
      Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))))
      Post("/api/0.1/records", record) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val patch = JsonPatch(Replace(Pointer.root / "aspects" / "test" / "foo", JsString("baz")))
      Patch("/api/0.1/records/testId", patch) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("baz"))))
      }

      Get("/api/0.1/records/testId?aspect=test") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("baz"))))
      }
    }

    it("can remove an aspect") { api =>
      val aspectDefinition = AspectDefinition("test", "test", None)
      Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val record = Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))))
      Post("/api/0.1/records", record) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
      }

      val patch = JsonPatch(Remove(Pointer.root / "aspects" / "test"))
      Patch("/api/0.1/records/testId", patch) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "testName", Map())
      }

      Get("/api/0.1/records/testId?optionalAspect=test") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[Record] shouldEqual Record("testId", "testName", Map())
      }
    }
  }
}
