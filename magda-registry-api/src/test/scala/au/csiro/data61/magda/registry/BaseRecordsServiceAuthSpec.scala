package au.csiro.data61.magda.registry

import akka.event.LoggingAdapter
import akka.http.scaladsl.model.StatusCodes
import gnieh.diffson._
import gnieh.diffson.sprayJson._
import scalikejdbc.DBSession
import spray.json._
import akka.http.scaladsl.marshalling.Marshal

import scala.util.Success
import akka.http.scaladsl.model.HttpHeader
import akka.http.scaladsl.model.HttpResponse
import scala.concurrent.Future
import akka.http.scaladsl.model.HttpEntity
import akka.http.scaladsl.model.ResponseEntity
import akka.http.scaladsl.model.ContentTypes
import akka.http.scaladsl.marshalling.ToEntityMarshaller
import au.csiro.data61.magda.model.Registry._
import akka.http.scaladsl.model.StatusCode

abstract class BaseRecordsServiceAuthSpec extends ApiSpec {

  def commonTests() = {

    describe("with a policy set on the record") {
      it(
        "allows access to an aspect-less record if default policy resolves to unconditionally allow access"
      ) { param =>
        val recordId = "foo"
        addRecord(
          param,
          Record(
            recordId,
            "foo",
            Map(),
            authnReadPolicyId = Some("not.default.policyid")
          )
        )
        expectOpaQueryForPolicy(
          param,
          "not.default.policyid.read",
          """{
            "result": {
                "queries": []
            }
          }"""
        )

        Get(s"/v0/records/foo") ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
          val resRecord = responseAs[Record]

          resRecord.id shouldBe "foo"
          resRecord.authnReadPolicyId shouldBe Some("not.default.policyid")
        }
      }

      it(
        "disallows access to an aspect-less record if default policy resolves to unconditionally disallow access"
      ) { param =>
        val recordId = "foo"

        addRecord(
          param,
          Record(
            recordId,
            "foo",
            Map(),
            authnReadPolicyId = Some("not.default.policyid")
          )
        )
        expectOpaQueryForPolicy(param, "not.default.policyid.read", """{
            "result": {}
          }""")

        Get(s"/v0/records/foo") ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it(
        "allows access to an record if specific policy resolves to allow"
      ) { param =>
        addExampleAspectDef(param)
        val recordId = "foo"
        addRecord(
          param,
          Record(
            recordId,
            "foo",
            Map(
              "example" -> JsObject(
                "nested" -> JsObject("public" -> JsString("true"))
              )
            ),
            authnReadPolicyId = Some("not.default.policyid")
          )
        )

        expectOpaQueryForPolicy(
          param,
          "not.default.policyid.read",
          defaultPolicyResponse
        )

        Get(s"/v0/records/foo") ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }
      }

      it(
        "does not allow access to an record if specific policy resolves to refuse"
      ) { param =>
        addExampleAspectDef(param)
        val recordId = "foo"
        addRecord(
          param,
          Record(
            recordId,
            "foo",
            Map(
              "example" -> JsObject(
                "nested" -> JsObject("public" -> JsString("false"))
              )
            ),
            authnReadPolicyId = Some("not.default.policyid")
          )
        )

        expectOpaQueryForPolicy(
          param,
          "not.default.policyid.read",
          defaultPolicyResponse
        )

        Get(s"/v0/records/foo") ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }
    }

    it("if OPA responds with an error, registry should respond with an error") {
      param =>
        addExampleAspectDef(param)
        val recordId = "foo"
        addRecord(
          param,
          Record(
            recordId,
            "foo",
            Map(
              "example" -> JsObject(
                "nested" -> JsObject("public" -> JsString("true"))
              )
            ),
            authnReadPolicyId = Some("not.default.policyid")
          )
        )

        expectOpaQueryForPolicy(
          param,
          "not.default.policyid.read",
          "ERROR: Not found",
          StatusCodes.InternalServerError
        )

        Get(s"/v0/records/foo") ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.InternalServerError
        }

    }
  }

  val defaultPolicyResponse = """
      {
        "result": {
          "queries": [
            [
              {
                "index": 0,
                "terms": [
                  {
                    "type": "ref",
                    "value": [
                      {
                        "type": "var",
                        "value": "eq"
                      }
                    ]
                  },
                  {
                    "type": "ref",
                    "value": [
                      {
                        "type": "var",
                        "value": "input"
                      },
                      {
                        "type": "string",
                        "value": "object"
                      },
                      {
                        "type": "string",
                        "value": "registry"
                      },
                      {
                        "type": "string",
                        "value": "record"
                      },
                      {
                        "type": "string",
                        "value": "example"
                      },
                      {
                        "type": "string",
                        "value": "nested"
                      },
                      {
                        "type": "string",
                        "value": "public"
                      }
                    ]
                  },
                  {
                    "type": "string",
                    "value": "true"
                  }
                ]
              }
            ]
          ]
        }
      }
  """

  def addExampleAspectDef(param: FixtureParam) =
    param.asAdmin(
      Post(
        "/v0/aspects",
        AspectDefinition(
          "example",
          "an example",
          None
        )
      )
    ) ~> addTenantIdHeader(
      TENANT_1
    ) ~> param
      .api(Full)
      .routes ~> check {
      status shouldEqual StatusCodes.OK
    }

  def expectOpaQueryForPolicy(
      param: FixtureParam,
      policyId: String,
      response: String,
      statusCode: StatusCode = StatusCodes.OK
  ) =
    (param.authFetcher
      .post(
        _: String,
        _: HttpEntity.Strict,
        _: List[HttpHeader]
      )(
        _: ToEntityMarshaller[HttpEntity.Strict]
      ))
      .expects(
        "/v0/opa/compile",
        HttpEntity(
          ContentTypes.`application/json`,
          s"""{
             |  "query": "data.$policyId",
             |  "unknowns": ["input.object"]
             |}""".stripMargin
        ),
        *,
        *
      )
      .returning(
        Marshal(response)
          .to[ResponseEntity]
          .map(
            HttpResponse(
              statusCode,
              Nil,
              _
            )
          )
      )

  def addRecord(param: FixtureParam, record: Record) {
    param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(
      TENANT_1
    ) ~> param.api(Full).routes ~> check {
      status shouldEqual StatusCodes.OK
    }
  }
}
