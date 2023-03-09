package au.csiro.data61.magda.registry

import akka.http.scaladsl.model.StatusCodes
import au.csiro.data61.magda.model.Auth.UnconditionalTrueDecision
import au.csiro.data61.magda.model.Registry._
import gnieh.diffson._
import gnieh.diffson.sprayJson._
import org.scalatest.BeforeAndAfterEach
import scalikejdbc._
import spray.json._

/**
  * Auth has been turned off in ApiSpec (authorization.skipOpaQuer) for all test cases in this suit as we want to focus on functionality test.
  */
class AspectsServiceMultiTenantSpec extends ApiSpec {

  describe("with role Full") {
    readOnlyTests(Full)
    writeTests(Full)
  }

  describe("with role ReadOnly") {
    readOnlyTests(ReadOnly)
  }

  routesShouldBeNonExistentWithRole(
    ReadOnly,
    List(
      ("POST", Post.apply, "/v0/aspects"),
      ("PUT", Put.apply, "/v0/aspects/1"),
      ("PATCH", Patch.apply, "/v0/aspects/1")
    )
  )

  def readOnlyTests(role: Role) {
    describe("GET") {
      it("starts with no aspects defined") { param =>
        Get("/v0/aspects") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[List[AspectDefinition]].length shouldEqual 0
        }
      }

      it("returns 404 if the given ID does not exist") { param =>
        Get("/v0/aspects/foo") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.NotFound
          responseAs[ApiError].message should include("exist")
        }
      }
    }
  }

  def writeTests(role: Role) {
    describe("POST") {
      it("can add a new aspect definition") { param =>
        val aspectDefinition =
          AspectDefinition("testId", "testName", Some(JsObject()))
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[AspectDefinition] shouldEqual aspectDefinition
        }

        Get("/v0/aspects") ~> addTenantIdHeader(TENANT_1) ~>
          param
            .api(role)
            .routes ~> check {
          status shouldEqual StatusCodes.OK

          val aspectDefinitions = responseAs[List[AspectDefinition]]
          aspectDefinitions.length shouldEqual 1
          aspectDefinitions.head shouldEqual aspectDefinition
        }

        Get("/v0/aspects") ~> addTenantIdHeader(TENANT_2) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK

          val aspectDefinitions = responseAs[List[AspectDefinition]]
          aspectDefinitions.length shouldEqual 0
        }
      }

      it("supports invalid URL characters in ID") { param =>
        val aspectDefinition = AspectDefinition("in valid", "testName", None)
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[AspectDefinition] shouldEqual aspectDefinition

          Get("/v0/aspects/in%20valid") ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[AspectDefinition] shouldEqual aspectDefinition
          }
        }
      }

      it("returns 400 if an aspect definition with the given ID already exists") {
        param =>
          val aspectDefinition = AspectDefinition("testId", "testName", None)
          Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[AspectDefinition] shouldEqual aspectDefinition

            Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.BadRequest
              responseAs[ApiError].message should include(
                "Duplicated aspect id supplied"
              )
            }
          }
      }
    }

    describe("PUT") {
      it("can add a new aspect definition") { param =>
        val aspectDefinition = AspectDefinition("testId", "testName", None)
        Put("/v0/aspects/testId", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[AspectDefinition] shouldEqual aspectDefinition

          Get("/v0/aspects") ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK

            val aspectDefinitions = responseAs[List[AspectDefinition]]
            aspectDefinitions.length shouldEqual 1
            aspectDefinitions.head shouldEqual aspectDefinition
          }
        }
      }

      it("can update an existing aspect definition") { param =>
        val aspectDefinition = AspectDefinition("testId", "testName", None)
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          val newDefinition = aspectDefinition.copy(name = "newName")
          Put("/v0/aspects/testId", newDefinition) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[AspectDefinition] shouldEqual newDefinition
          }
        }
      }

      it("cannot change the ID of an existing aspect definition") { param =>
        val aspectDefinition = AspectDefinition("testId", "testName", None)
        Put("/v0/aspects/testId", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[AspectDefinition] shouldEqual aspectDefinition

          val updated = aspectDefinition.copy(id = "foo")
          Put("/v0/aspects/testId", updated) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.BadRequest
            responseAs[ApiError].message should include("ID")
          }
        }
      }

      it("supports invalid URL characters in ID") { param =>
        val aspectDefinition = AspectDefinition("in valid", "testName", None)
        Put("/v0/aspects/in%20valid", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[AspectDefinition] shouldEqual aspectDefinition

          Get("/v0/aspects/in%20valid") ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[AspectDefinition] shouldEqual aspectDefinition
          }
        }
      }

      it("can add a schema") { param =>
        val aspectDefinition = AspectDefinition("testId", "testName", None)
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          val updated = aspectDefinition.copy(jsonSchema = Some(JsObject()))
          Put("/v0/aspects/testId", updated) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[AspectDefinition] shouldEqual updated
          }
        }
      }

      it("can modify a schema") { param =>
        val aspectDefinition = AspectDefinition(
          "testId",
          "testName",
          Some(JsObject("foo" -> JsString("bar")))
        )
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          val updated = aspectDefinition.copy(
            jsonSchema = Some(JsObject("foo" -> JsString("baz")))
          )
          Put("/v0/aspects/testId", updated) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[AspectDefinition] shouldEqual updated
          }
        }
      }
    }

    describe("PATCH") {
      it("returns an error when the aspect definition does not exist") {
        param =>
          val patch = JsonPatch()
          Patch("/v0/aspects/doesnotexist", patch) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.BadRequest
            responseAs[String] should include(
              "Cannot locate aspect record by id:"
            )
          }
      }

      it("can modify an aspect's name") { param =>
        val aspectDefinition = AspectDefinition("testId", "testName", None)
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          val patch = JsonPatch(Replace(Pointer.root / "name", JsString("foo")))
          Patch("/v0/aspects/testId", patch) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[AspectDefinition] shouldEqual AspectDefinition(
              "testId",
              "foo",
              None
            )
          }
        }
      }

      it("cannot modify an aspect's ID") { param =>
        val aspectDefinition = AspectDefinition("testId", "testName", None)
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          val patch = JsonPatch(Replace(Pointer.root / "id", JsString("foo")))
          Patch("/v0/aspects/testId", patch) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.BadRequest
            responseAs[ApiError].message should include("ID")
          }
        }
      }

      it("can add a schema") { param =>
        val aspectDefinition = AspectDefinition("testId", "testName", None)
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          val patch = JsonPatch(Add(Pointer.root / "jsonSchema", JsObject()))
          Patch("/v0/aspects/testId", patch) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[AspectDefinition] shouldEqual AspectDefinition(
              "testId",
              "testName",
              Some(JsObject())
            )
          }
        }
      }

      it("can modify a schema") { param =>
        val aspectDefinition = AspectDefinition(
          "testId",
          "testName",
          Some(JsObject("foo" -> JsString("bar")))
        )
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          val patch = JsonPatch(
            Replace(Pointer.root / "jsonSchema" / "foo", JsString("baz"))
          )
          Patch("/v0/aspects/testId", patch) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[AspectDefinition] shouldEqual AspectDefinition(
              "testId",
              "testName",
              Some(JsObject("foo" -> JsString("baz")))
            )
          }
        }
      }

      def getLastAspectEventId(
          implicit session: DBSession,
          aspectId: String
      ): Option[Long] = {
        sql"""SELECT e.eventId
          FROM events e
          LEFT JOIN aspects a ON a.lastUpdate = e.eventId
          WHERE a.aspectId=$aspectId
          ORDER BY e.eventId DESC
          LIMIT 1""".map(rs => rs.long("eventId")).headOption().apply()
      }

      it("Only create event if patch makes difference") { param =>
        val aspectDefinition = AspectDefinition(
          "testId",
          "testName",
          Some(JsObject("foo" -> JsString("bar")))
        )
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          DB readOnly { implicit session =>
            val lastEventIdBeforePatch: Option[Long] =
              getLastAspectEventId(session, "testId")
            lastEventIdBeforePatch should not be None
            val patch =
              JsonPatch( //--- useless Patch change to baz and then change it back
                Replace(Pointer.root / "jsonSchema" / "foo", JsString("baz")),
                Replace(Pointer.root / "jsonSchema" / "foo", JsString("bar"))
              )
            Patch("/v0/aspects/testId", patch) ~> addUserId() ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.OK
              val lastEventIdAfterPatch: Option[Long] =
                getLastAspectEventId(session, "testId")
              lastEventIdAfterPatch shouldEqual lastEventIdBeforePatch
              responseAs[AspectDefinition] shouldEqual AspectDefinition(
                "testId",
                "testName",
                Some(JsObject("foo" -> JsString("bar")))
              )
            }
          }
        }
      }
    }
  }
}
