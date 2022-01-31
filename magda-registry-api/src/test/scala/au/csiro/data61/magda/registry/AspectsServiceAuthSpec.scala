package au.csiro.data61.magda.registry

import akka.http.scaladsl.model.StatusCodes
import au.csiro.data61.magda.model.Auth.{
  UnconditionalFalseDecision,
  UnconditionalTrueDecision
}
import au.csiro.data61.magda.model.Registry._
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
    describe("Create endpoint: ") {
      it("should respond 200 when user has permission") { param =>
        param.authFetcher.setAuthDecision(
          "object/aspect/create",
          UnconditionalTrueDecision
        )
        param.authFetcher.setAuthDecision(
          "object/aspect/read",
          UnconditionalTrueDecision
        )
        val aspectDefinition =
          AspectDefinition("testId", "testName", Some(JsObject()))
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[AspectDefinition] shouldEqual aspectDefinition

          Get("/v0/aspects") ~> addTenantIdHeader(TENANT_1) ~> param
            .api(Full)
            .routes ~> check {
            status shouldEqual StatusCodes.OK

            val aspectDefinitions = responseAs[List[AspectDefinition]]
            aspectDefinitions.length shouldEqual 1
            aspectDefinitions.head shouldEqual aspectDefinition
          }
        }
        param.authFetcher.callTimesByOperationUri("object/aspect/create") shouldBe 1
        param.authFetcher.callTimesByOperationUri("object/aspect/read") shouldBe 1
      }

      it("should respond 403 (Forbidden) when user has no permission") {
        param =>
          param.authFetcher.setAuthDecision(
            "object/aspect/create",
            UnconditionalFalseDecision
          )
          val aspectDefinition =
            AspectDefinition("testId", "testName", Some(JsObject()))
          Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.Forbidden
          }
          param.authFetcher.callTimesByOperationUri("object/aspect/create") shouldBe 1
      }

      it(
        "should respond 500 when failed to retrieve auth decision from policy engine"
      ) { param =>
        param.authFetcher
          .setResponse(StatusCodes.InternalServerError, "Something wrong.")
        val aspectDefinition =
          AspectDefinition("testId", "testName", Some(JsObject()))
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.InternalServerError
        }
      }

      it(
        "should respond 500 when failed to process auth decision from policy engine"
      ) { param =>
        param.authFetcher.setError(new Exception("something wrong"))
        val aspectDefinition =
          AspectDefinition("testId", "testName", Some(JsObject()))
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.InternalServerError
        }
      }
    }
  }
}
