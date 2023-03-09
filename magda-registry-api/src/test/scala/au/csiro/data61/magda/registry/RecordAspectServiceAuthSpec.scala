package au.csiro.data61.magda.registry

import akka.http.scaladsl.model.{HttpRequest, StatusCodes}
import au.csiro.data61.magda.model.Auth.{
  AuthDecision,
  ConciseExpression,
  ConciseOperand,
  ConciseRule,
  UnconditionalFalseDecision,
  UnconditionalTrueDecision
}
import au.csiro.data61.magda.model.Registry.{Record, _}
import gnieh.diffson._
import gnieh.diffson.sprayJson._
import spray.json._

import java.time.OffsetDateTime

/**
  * auth will not be skipped in this suit by setting `skipOpaQuery` = false
  */
class RecordAspectServiceAuthSpec extends ApiSpec {

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

  def settingUpTestData(param: FixtureParam, records: List[Record]) = {

    val testDataAspects = records
      .flatMap(_.aspects.map(_._1))
      .toSet
      .map(aspectId => AspectDefinition(aspectId, s"${aspectId} aspect", None))

    // setting up testing aspects
    param.authFetcher.setAuthDecision(
      "object/aspect/create",
      UnconditionalTrueDecision
    )

    testDataAspects.foreach { aspect =>
      Post("/v0/aspects", aspect) ~> addUserId() ~> addTenantIdHeader(
        TENANT_1
      ) ~> param.api(Full).routes ~> check {
        status shouldEqual StatusCodes.OK
      }
    }

    // setting up testing records
    param.authFetcher.setAuthDecision(
      "object/record/create",
      UnconditionalTrueDecision
    )

    records.foreach { record =>
      Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
        TENANT_1
      ) ~> param.api(Full).routes ~> check {
        status shouldEqual StatusCodes.OK
      }
    }
    param.authFetcher.resetMock()
  }

  describe("Record Aspect Service Auth Logic") {

    describe(
      "Get by Id {get} /v0/registry/records/{recordId}/aspects/{aspectId}"
    ) {

      endpointStandardAuthTestCase(
        Get(s"/v0/records/test1/aspects/aspectA"),
        List("object/record/read"),
        hasPermissionCheck = param => {
          withClue(responseAs[String]) {
            status shouldEqual StatusCodes.OK
          }
          val aspectData = responseAs[JsObject]
          aspectData.fields.get("a").get shouldEqual JsString("test data 123")
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        },
        noPermissionCheck = param => {
          status shouldEqual StatusCodes.Forbidden
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        },
        beforeRequest = param => {
          // create record
          settingUpTestData(
            param,
            List(
              Record(
                "test1",
                "test record 1",
                aspects = Map(
                  "aspectA" -> JsObject(
                    "a" -> JsString("test data 123")
                  )
                )
              )
            )
          )
        }
      )

    }

    describe(
      "Patch endpoint {patch} /v0/registry/records/{recordId}/aspects/{aspectId}"
    ) {
      describe("with existing record") {
        endpointStandardAuthTestCase(
          Patch(
            s"/v0/records/test1/aspects/aspectA",
            JsonPatch(Replace(Pointer.root / "a", JsString("test data 456")))
          ),
          List("object/record/update"),
          hasPermissionCheck = param => {
            withClue(responseAs[String]) {
              status shouldEqual StatusCodes.OK
            }
            val aspectData = responseAs[JsObject]
            aspectData.fields.get("a").get shouldEqual JsString("test data 456")
            // we will check whether user has permission to both before & after record
            // thus, 2 queries here
            param.authFetcher
              .callTimesByOperationUri("object/record/update") shouldBe 2
          },
          noPermissionCheck = param => {
            status shouldEqual StatusCodes.Forbidden
            param.authFetcher
              .callTimesByOperationUri("object/record/update") shouldBe 1
          },
          beforeRequest = param => {
            settingUpTestData(
              param,
              List(
                Record(
                  "test1",
                  "test record 1",
                  aspects = Map(
                    "aspectA" -> JsObject(
                      "a" -> JsString("test data 123")
                    )
                  )
                )
              )
            )
          },
          requireUserId = true
        )

      }

      describe("without existing record") {
        endpointStandardAuthTestCase(
          Patch(
            s"/v0/records/test1/aspects/aspectA",
            JsonPatch(Replace(Pointer.root / "a", JsString("test data 456")))
          ),
          List("object/record/update"),
          hasPermissionCheck = param => {
            status shouldEqual StatusCodes.BadRequest
            param.authFetcher
              .callTimesByOperationUri("object/record/update") shouldBe 0
          },
          noPermissionCheck = param => {
            status shouldEqual StatusCodes.BadRequest
            param.authFetcher
              .callTimesByOperationUri("object/record/update") shouldBe 0
          },
          skipPolicyRetrieveAndProcessCheck = true,
          requireUserId = true
        )

      }
    }

    describe(
      "Modify endpoint {put} /v0/registry/records/{recordId}/aspects/{aspectId}"
    ) {
      describe("with existing record") {
        endpointStandardAuthTestCase(
          Put(
            s"/v0/records/test1/aspects/aspectA",
            JsObject("a" -> JsString("test data 456"))
          ),
          List("object/record/update"),
          hasPermissionCheck = param => {
            withClue(responseAs[String]) {
              status shouldEqual StatusCodes.OK
            }
            val aspectData = responseAs[JsObject]
            aspectData.fields.get("a").get shouldEqual JsString("test data 456")
            // we will check whether user has permission to both before & after record
            // thus, 2 queries here
            param.authFetcher
              .callTimesByOperationUri("object/record/update") shouldBe 2
          },
          noPermissionCheck = param => {
            status shouldEqual StatusCodes.Forbidden
            param.authFetcher
              .callTimesByOperationUri("object/record/update") shouldBe 1
          },
          beforeRequest = param => {
            settingUpTestData(
              param,
              List(
                Record(
                  "test1",
                  "test record 1",
                  aspects = Map(
                    "aspectA" -> JsObject(
                      "a" -> JsString("test data 123")
                    )
                  )
                )
              )
            )
          },
          requireUserId = true
        )

      }

      describe("without existing record") {
        endpointStandardAuthTestCase(
          Put(
            s"/v0/records/test1/aspects/aspectA",
            JsObject("a" -> JsString("test data 456"))
          ),
          List("object/record/update"),
          hasPermissionCheck = param => {
            status shouldEqual StatusCodes.BadRequest
            param.authFetcher
              .callTimesByOperationUri("object/record/update") shouldBe 0
          },
          noPermissionCheck = param => {
            status shouldEqual StatusCodes.BadRequest
            param.authFetcher
              .callTimesByOperationUri("object/record/update") shouldBe 0
          },
          skipPolicyRetrieveAndProcessCheck = true,
          requireUserId = true
        )

      }
    }

    describe(
      "Delete endpoint {delete} /v0/registry/records/{recordId}/aspects/{aspectId}"
    ) {
      describe("with existing record") {
        endpointStandardAuthTestCase(
          Delete(
            s"/v0/records/test1/aspects/aspectA"
          ),
          List("object/record/update"),
          hasPermissionCheck = param => {
            withClue(responseAs[String]) {
              status shouldEqual StatusCodes.OK
            }
            responseAs[DeleteResult].deleted shouldEqual true
            // we will check whether user has permission to both before & after record
            // thus, 2 queries here
            param.authFetcher
              .callTimesByOperationUri("object/record/update") shouldBe 2
          },
          noPermissionCheck = param => {
            status shouldEqual StatusCodes.Forbidden
            param.authFetcher
              .callTimesByOperationUri("object/record/update") shouldBe 1
          },
          beforeRequest = param => {
            settingUpTestData(
              param,
              List(
                Record(
                  "test1",
                  "test record 1",
                  aspects = Map(
                    "aspectA" -> JsObject(
                      "a" -> JsString("test data 123")
                    ),
                    "aspectB" -> JsObject(
                      "b" -> JsString("b data")
                    )
                  )
                )
              )
            )
          },
          requireUserId = true
        )

      }

      describe("without existing record") {
        endpointStandardAuthTestCase(
          Delete(
            s"/v0/records/test1/aspects/aspectA"
          ),
          List("object/record/update"),
          hasPermissionCheck = param => {
            status shouldEqual StatusCodes.OK
            responseAs[DeleteResult].deleted shouldEqual false
            param.authFetcher
              .callTimesByOperationUri("object/record/update") shouldBe 1
          },
          noPermissionCheck = param => {
            status shouldEqual StatusCodes.Forbidden
            param.authFetcher
              .callTimesByOperationUri("object/record/update") shouldBe 1
          },
          requireUserId = true
        )

      }
    }

  }
}
