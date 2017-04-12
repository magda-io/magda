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
