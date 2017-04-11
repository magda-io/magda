package au.csiro.data61.magda.registry

import akka.http.scaladsl.model.StatusCodes
import gnieh.diffson._
import gnieh.diffson.sprayJson._
import spray.json._

class AspectsServiceSpec extends ApiSpec {
  describe("GET") {
    it("starts with no aspects defined") { api =>
      Get("/api/0.1/aspects") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[List[AspectDefinition]].length shouldEqual 0
      }
    }

    it("returns 404 if the given ID does not exist") { api =>
      Get("/api/0.1/aspects/foo") ~> api.routes ~> check {
        status shouldEqual StatusCodes.NotFound
        responseAs[BadRequest].message should include ("exist")
      }
    }
  }

  describe("POST") {
    it("can add a new aspect definition") { api =>
      val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject()))
      Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[AspectDefinition] shouldEqual aspectDefinition

        Get("/api/0.1/aspects") ~> api.routes ~> check {
          status shouldEqual StatusCodes.OK

          val aspectDefinitions = responseAs[List[AspectDefinition]]
          aspectDefinitions.length shouldEqual 1
          aspectDefinitions(0) shouldEqual aspectDefinition
        }
      }
    }

    it("supports invalid URL characters in ID") { api =>
      val aspectDefinition = AspectDefinition("in valid", "testName", None)
      Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[AspectDefinition] shouldEqual aspectDefinition

        Get("/api/0.1/aspects/in%20valid") ~> api.routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[AspectDefinition] shouldEqual aspectDefinition
        }
      }
    }

    it("returns 400 if an aspect definition with the given ID already exists") { api =>
      val aspectDefinition = AspectDefinition("testId", "testName", None)
      Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[AspectDefinition] shouldEqual aspectDefinition

        val updated = aspectDefinition.copy(name = "foo")
        Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          responseAs[BadRequest].message should include ("already exists")
        }
      }
    }
  }

  describe("PUT") {
    it("can add a new aspect definition") { api =>
      val aspectDefinition = AspectDefinition("testId", "testName", None)
      Put("/api/0.1/aspects/testId", aspectDefinition) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[AspectDefinition] shouldEqual aspectDefinition

        Get("/api/0.1/aspects") ~> api.routes ~> check {
          status shouldEqual StatusCodes.OK

          val aspectDefinitions = responseAs[List[AspectDefinition]]
          aspectDefinitions.length shouldEqual 1
          aspectDefinitions(0) shouldEqual aspectDefinition
        }
      }
    }

    it("can update an existing aspect definition") { api =>
      val aspectDefinition = AspectDefinition("testId", "testName", None)
      Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
        val newDefinition = aspectDefinition.copy(name = "newName")
        Put("/api/0.1/aspects/testId", newDefinition) ~> api.routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[AspectDefinition] shouldEqual newDefinition
        }
      }
    }

    it("cannot change the ID of an existing aspect definition") { api =>
      val aspectDefinition = AspectDefinition("testId", "testName", None)
      Put("/api/0.1/aspects/testId", aspectDefinition) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[AspectDefinition] shouldEqual AspectDefinition("testId", "testName", None)

        val updated = aspectDefinition.copy(id = "foo")
        Put("/api/0.1/aspects/testId", updated) ~> api.routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          responseAs[BadRequest].message should include ("ID")
        }
      }
    }

    it("supports invalid URL characters in ID") { api =>
      val aspectDefinition = AspectDefinition("in valid", "testName", None)
      Put("/api/0.1/aspects/in%20valid", aspectDefinition) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[AspectDefinition] shouldEqual aspectDefinition

        Get("/api/0.1/aspects/in%20valid") ~> api.routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[AspectDefinition] shouldEqual aspectDefinition
        }
      }
    }

    it("can add a schema") { api =>
      val aspectDefinition = AspectDefinition("testId", "testName", None)
      Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
        val updated = aspectDefinition.copy(jsonSchema = Some(JsObject()))
        Put("/api/0.1/aspects/testId", updated) ~> api.routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[AspectDefinition] shouldEqual updated
        }
      }
    }

    it("can modify a schema") { api =>
      val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject("foo" -> JsString("bar"))))
      Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
        val updated = aspectDefinition.copy(jsonSchema = Some(JsObject("foo" -> JsString("baz"))))
        Put("/api/0.1/aspects/testId", updated) ~> api.routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[AspectDefinition] shouldEqual updated
        }
      }
    }
  }

  describe("PATCH") {
    it("returns an error when the aspect definition does not exist") { api =>
      val patch = JsonPatch()
      Patch("/api/0.1/aspects/doesnotexist", patch) ~> api.routes ~> check {
        status shouldEqual StatusCodes.BadRequest
        responseAs[BadRequest].message should include ("exists")
        responseAs[BadRequest].message should include ("ID")
      }
    }

    it("can modify an aspect's name") { api =>
      val aspectDefinition = AspectDefinition("testId", "testName", None)
      Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
        val patch = JsonPatch(Replace(Pointer.root / "name", JsString("foo")))
        Patch("/api/0.1/aspects/testId", patch) ~> api.routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[AspectDefinition] shouldEqual AspectDefinition("testId", "foo", None)
        }
      }
    }

    it("cannot modify an aspect's ID") { api =>
      val aspectDefinition = AspectDefinition("testId", "testName", None)
      Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
        val patch = JsonPatch(Replace(Pointer.root / "id", JsString("foo")))
        Patch("/api/0.1/aspects/testId", patch) ~> api.routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          responseAs[BadRequest].message should include ("ID")
        }
      }
    }

    it("can add a schema") { api =>
      val aspectDefinition = AspectDefinition("testId", "testName", None)
      Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
        val patch = JsonPatch(Add(Pointer.root / "jsonSchema", JsObject()))
        Patch("/api/0.1/aspects/testId", patch) ~> api.routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[AspectDefinition] shouldEqual AspectDefinition("testId", "testName", Some(JsObject()))
        }
      }
    }

    it("can modify a schema") { api =>
      val aspectDefinition = AspectDefinition("testId", "testName", Some(JsObject("foo" -> JsString("bar"))))
      Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
        val patch = JsonPatch(Replace(Pointer.root / "jsonSchema" / "foo", JsString("baz")))
        Patch("/api/0.1/aspects/testId", patch) ~> api.routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[AspectDefinition] shouldEqual AspectDefinition("testId", "testName", Some(JsObject("foo" -> JsString("baz"))))
        }
      }
    }
  }
}
