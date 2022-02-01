package au.csiro.data61.magda.registry

import akka.http.scaladsl.model.StatusCodes
import au.csiro.data61.magda.model.Auth.{
  UnconditionalFalseDecision,
  UnconditionalTrueDecision
}
import au.csiro.data61.magda.model.Registry._
import gnieh.diffson._
import gnieh.diffson.sprayJson._
import spray.json._

/**
  * auth will not be skipped in this suit by setting `skipOpaQuery` = false
  */
class AspectsServiceAuthSpec extends ApiSpec {

  override def testConfigSource =
    s"""
       |db.default.url = "${databaseUrl}?currentSchema=test"
       |authorization.skip = false
       |authorization.skipOpaQuery = false
       |akka.loglevel = ERROR
       |authApi.baseUrl = "http://localhost:6104"
       |webhooks.actorTickRate=0
       |webhooks.eventPageSize=10
       |akka.test.timefactor=20.0
       |trimBySourceTagTimeoutThreshold=500
    """.stripMargin

  describe("Aspect Service Auth Logic") {

    describe("Get All endpoint {get} /v0/registry/aspects: ") {
      endpointStandardAuthTestCase(
        Get("/v0/aspects"),
        List("object/aspect/read"),
        hasPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          responseAs[List[AspectDefinition]].length shouldEqual 1
          param.authFetcher
            .callTimesByOperationUri("object/aspect/read") shouldBe 1
        },
        noPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          responseAs[List[AspectDefinition]].length shouldEqual 0
          param.authFetcher
            .callTimesByOperationUri("object/aspect/read") shouldBe 1
        },
        beforeRequest = param => {
          param.authFetcher.setAuthDecision(
            "object/aspect/create",
            UnconditionalTrueDecision
          )
          val aspectDefinition = AspectDefinition("testId", "testName", None)
          Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          param.authFetcher.resetMock()
        }
      )
    }

    describe("Create endpoint {post} /v0/registry/aspects: ") {

      val aspectDefinition =
        AspectDefinition("testId", "testName", Some(JsObject()))

      endpointStandardAuthTestCase(
        Post("/v0/aspects", aspectDefinition),
        List("object/aspect/create"),
        hasPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          responseAs[AspectDefinition] shouldEqual aspectDefinition

          param.authFetcher.setAuthDecision(
            "object/aspect/read",
            UnconditionalTrueDecision
          )

          Get("/v0/aspects") ~> addTenantIdHeader(TENANT_1) ~> param
            .api(Full)
            .routes ~> check {
            status shouldEqual StatusCodes.OK

            val aspectDefinitions = responseAs[List[AspectDefinition]]
            aspectDefinitions.length shouldEqual 1
            aspectDefinitions.head shouldEqual aspectDefinition
          }

          param.authFetcher
            .callTimesByOperationUri("object/aspect/create") shouldBe 1
          param.authFetcher
            .callTimesByOperationUri("object/aspect/read") shouldBe 1
        },
        noPermissionCheck = param => {
          status shouldEqual StatusCodes.Forbidden
          param.authFetcher
            .callTimesByOperationUri("object/aspect/create") shouldBe 1
        },
        requireUserId = true
      )
    }

    describe("Modify endpoint {put} /v0/registry/aspects/{id}: ") {

      describe("When there is an existing aspect:") {

        val aspectDefinition =
          AspectDefinition(
            "testId",
            "testNameModified",
            Some(JsObject("foo" -> JsString("bar")))
          )

        endpointStandardAuthTestCase(
          Put(s"/v0/aspects/testId", aspectDefinition),
          List("object/aspect/update"),
          hasPermissionCheck = param => {
            status shouldEqual StatusCodes.OK
            responseAs[AspectDefinition] shouldEqual aspectDefinition

            // endpoint will query policy engine re: "object/aspect/update" twice
            // as we want to make sure the user has access to both before-update & after-update aspect record
            param.authFetcher
              .callTimesByOperationUri("object/aspect/update") shouldBe 2

            param.authFetcher.setAuthDecision(
              "object/aspect/read",
              UnconditionalTrueDecision
            )

            Get("/v0/aspects/testId") ~> addTenantIdHeader(TENANT_1) ~> param
              .api(Full)
              .routes ~> check {
              status shouldEqual StatusCodes.OK
              responseAs[AspectDefinition] shouldEqual aspectDefinition
            }

            param.authFetcher
              .callTimesByOperationUri("object/aspect/read") shouldBe 1
          },
          noPermissionCheck = param => {
            status shouldEqual StatusCodes.Forbidden
            param.authFetcher
              .callTimesByOperationUri("object/aspect/update") shouldBe 1
          },
          beforeRequest = param => {
            // create aspect before modify it
            param.authFetcher.setAuthDecision(
              "object/aspect/create",
              UnconditionalTrueDecision
            )
            val aspectDefinition =
              AspectDefinition("testId", "testName", Some(JsObject()))
            Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }
            param.authFetcher.resetMock()
          },
          requireUserId = true
        )

      }

      describe("When the aspect doesn't exist:") {

        val aspectDefinition =
          AspectDefinition(
            "testId",
            "testNameModified",
            Some(JsObject("foo" -> JsString("bar")))
          )

        endpointStandardAuthTestCase(
          Put(s"/v0/aspects/testId", aspectDefinition),
          List("object/aspect/create", "object/aspect/update"),
          hasPermissionCheck = param => {
            status shouldEqual StatusCodes.OK
            responseAs[AspectDefinition] shouldEqual aspectDefinition

            // as the aspect doesn't existing, the endpoint actually performed a "create" operation
            // thus, the endpoint should ask an auth decision for "object/aspect/create" instead
            param.authFetcher
              .callTimesByOperationUri("object/aspect/create") shouldBe 1
            param.authFetcher
              .callTimesByOperationUri("object/aspect/update") shouldBe 0

            param.authFetcher.setAuthDecision(
              "object/aspect/read",
              UnconditionalTrueDecision
            )

            Get("/v0/aspects/testId") ~> addTenantIdHeader(TENANT_1) ~> param
              .api(Full)
              .routes ~> check {
              status shouldEqual StatusCodes.OK
              responseAs[AspectDefinition] shouldEqual aspectDefinition
            }

            param.authFetcher
              .callTimesByOperationUri("object/aspect/read") shouldBe 1
          },
          noPermissionCheck = param => {
            status shouldEqual StatusCodes.Forbidden
            param.authFetcher
              .callTimesByOperationUri("object/aspect/create") shouldBe 1
          },
          requireUserId = true
        )

      }

    }

    describe("Patch API {patch} /v0/registry/aspects/{id}") {

      endpointStandardAuthTestCase(
        Patch(
          "/v0/aspects/testId",
          JsonPatch(Replace(Pointer.root / "name", JsString("foo")))
        ),
        List("object/aspect/update"),
        hasPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          responseAs[AspectDefinition] shouldEqual AspectDefinition(
            "testId",
            "foo",
            None
          )
          // check whether user has both before & after update aspect access
          param.authFetcher
            .callTimesByOperationUri("object/aspect/update") shouldBe 2
        },
        noPermissionCheck = param => {
          status shouldEqual StatusCodes.Forbidden
          param.authFetcher
            .callTimesByOperationUri("object/aspect/update") shouldBe 1
        },
        beforeRequest = param => {
          param.authFetcher.setAuthDecision(
            "object/aspect/create",
            UnconditionalTrueDecision
          )
          val aspectDefinition = AspectDefinition("testId", "testName", None)
          Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          param.authFetcher.resetMock()
        },
        requireUserId = true
      )

      it("should response BadRequest 400 error as can't construct context data") {
        param =>
          param.authFetcher.setAuthDecision(
            "object/aspect/update",
            UnconditionalTrueDecision
          )
          param.authFetcher.setAuthDecision(
            "object/aspect/create",
            UnconditionalTrueDecision
          )
          Patch(
            "/v0/aspects/testId",
            JsonPatch(Replace(Pointer.root / "name", JsString("foo")))
          ) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.BadRequest
            responseAs[String] should include(
              "Cannot locate aspect record by id"
            )
          }
      }

    }

  }
}
