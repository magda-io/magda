package au.csiro.data61.magda.registry

import akka.event.LoggingAdapter
import akka.http.scaladsl.model.StatusCodes
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.model.TenantId._
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

class RecordsServiceAuthSpec extends BaseRecordsServiceAuthSpec {
  override def testConfigSource =
    s"""
       |db.default.url = "${databaseUrl}?currentSchema=test"
       |authorization.skip = false
       |authorization.skipOpaQuery = false
       |akka.loglevel = ERROR
    """.stripMargin

  describe("without a default policy set") {
    describe("GET") {
      describe("for a single record") {
        commonSingleRecordTests(None, true)

        it(
          "if there's no default or specific policy in place, it should deny all access"
        ) { param =>
          Get(s"/v0/records/foo") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.NotFound
          }
        }
      }

      describe("for a single record summary") {
        commonSingleRecordSummaryTests(None, true)

        it(
          "if there's no default or specific policy in place, it should deny all access"
        ) { param =>
          setupNullPolicyRecord(param)

          Get(s"/v0/records/summary/foo") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.NotFound
          }
        }
      }

      describe("for record history") {
        commonRecordHistoryTests(None, true)

        it(
          "if there's no default or specific policy in place, it should deny all access"
        ) { param =>
          setupNullPolicyRecord(param)

          Get(s"/v0/records/foo/history") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val resRecord = responseAs[EventsPage]
            resRecord.events.length shouldBe 0
          }
        }
      }

      describe("for multiple records") {
        it(
          "allows access to aspect-less records if default policy resolves to unconditionally allow access to everything"
        ) { param =>
          setupUnauthedRecords(param)

          Get(s"/v0/records") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val resPage = responseAs[RecordsPage[Record]]

            resPage.records.length shouldBe 5
            resPage.records.map(_.id) shouldEqual List(
              "foo1",
              "foo2",
              "foo3",
              "foo4",
              "foo5"
            )
            resPage.records.flatMap(_.aspects) shouldEqual List()
          }
        }

        it(
          "denies access to aspect-less records if default policy resolves to unconditionally deny access to them"
        ) { param =>
          setupDisallowedRecords(param)

          Get(s"/v0/records") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val resPage = responseAs[RecordsPage[Record]]

            resPage.records.length shouldBe 0
          }
        }

        it(
          "for records with the same policy, denies access to those that don't meet the policy and allows access to those that do"
        ) { param =>
          addExampleAspectDef(param)

          setupMixedAuthResultRecordsSamePolicy(param)

          Get(s"/v0/records?optionalAspect=stringExample") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val resPage = responseAs[RecordsPage[Record]]

            resPage.records.length shouldBe 3
            resPage.records.forall(_.id.startsWith("allow")) shouldBe true
            resPage.records
              .map(_.aspects)
              .forall(
                aspects =>
                  aspects == Map(
                    "stringExample" -> JsObject(
                      "nested" -> JsObject("public" -> JsString("true"))
                    )
                  )
              )
          }
        }

        it(
          "when records have different policies, displays records with matching policies"
        ) { param =>
          setupMixedAuthResultRecordsMixedPolicies(param)

          Get(s"/v0/records") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val resPage = responseAs[RecordsPage[Record]]

            resPage.records.map(_.id).toSet shouldEqual Set(
              "allowStringExample",
              "allowNumericExample",
              "allowBooleanExample",
              "allowAspectExistenceExample",
              "allowExistenceExample"
            )
          }
        }

        it(
          "if OPA responds with an error, registry should respond with an error"
        ) { param =>
          setupError(param)

          Get(s"/v0/records") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.InternalServerError
          }

        }

        it(
          "if there's no default or specific policy in place, it should deny all access"
        ) { param =>
          setupNullPolicyRecord(param)

          Get(s"/v0/records") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val resPage = responseAs[RecordsPage[Record]]
            resPage.records.length shouldBe 0
          }
        }

        doLinkTestsOnRecordsEndpoint(Some("a"), Some("b"), "a.read", "b.read")
      }

      describe("for multiple record summaries") {
        it(
          "allows access to aspect-less records if default policy resolves to unconditionally allow access to everything"
        ) { param =>
          setupUnauthedRecords(param)

          Get(s"/v0/records/summary") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val resPage = responseAs[RecordsPage[RecordSummary]]

            resPage.records.length shouldBe 5
            resPage.records.map(_.id) shouldEqual List(
              "foo1",
              "foo2",
              "foo3",
              "foo4",
              "foo5"
            )
            resPage.records.flatMap(_.aspects) shouldEqual List()
          }
        }

        it(
          "denies access to aspect-less records if default policy resolves to unconditionally deny access to them"
        ) { param =>
          setupDisallowedRecords(param)

          Get(s"/v0/records/summary") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val resPage = responseAs[RecordsPage[RecordSummary]]

            resPage.records.length shouldBe 0
          }
        }

        it(
          "for records with the same policy, denies access to those that don't meet the policy and allows access to those that do"
        ) { param =>
          addExampleAspectDef(param)

          setupMixedAuthResultRecordsSamePolicy(param)

          Get(s"/v0/records/summary") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val resPage = responseAs[RecordsPage[RecordSummary]]

            resPage.records.length shouldBe 3
            resPage.records.forall(_.id.startsWith("allow")) shouldBe true
            resPage.records.forall(_.aspects == List("stringExample")) shouldBe true
          }
        }

        it(
          "when records have different policies, displays records with matching policies"
        ) { param =>
          setupMixedAuthResultRecordsMixedPolicies(param)

          Get(s"/v0/records/summary") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val resPage = responseAs[RecordsPage[RecordSummary]]

            resPage.records.map(_.id).toSet shouldEqual Set(
              "allowStringExample",
              "allowNumericExample",
              "allowBooleanExample",
              "allowAspectExistenceExample",
              "allowExistenceExample"
            )
          }
        }

        it(
          "if OPA responds with an error, registry should respond with an error"
        ) { param =>
          setupError(param)

          Get(s"/v0/records/summary") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.InternalServerError
          }
        }

        it(
          "if there's no default or specific policy in place, it should deny all access"
        ) { param =>
          setupNullPolicyRecord(param)

          Get(s"/v0/records") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val resPage = responseAs[RecordsPage[RecordSummary]]
            resPage.records.length shouldBe 0
          }
        }
      }

      /** Creates a record with no policy */
      def setupNullPolicyRecord(param: FixtureParam) = {
        addExampleAspectDef(param)
        val recordId = "foo"
        addRecord(
          param,
          Record(
            recordId,
            "foo",
            Map(
              "stringExample" -> JsObject(
                "nested" -> JsObject("public" -> JsString("true"))
              )
            ),
            authnReadPolicyId = None
          )
        )
      }

      /** Sets up 5 public records with no aspects */
      def setupUnauthedRecords(param: FixtureParam) = {
        val recordId = "foo"

        for (i <- 1 to 5) {
          addRecord(
            param,
            Record(
              recordId + i,
              recordId + i,
              Map(),
              authnReadPolicyId = Some("not.default.policyid")
            )
          )
        }

        expectOpaQueryForPolicy(
          param,
          "not.default.policyid.read",
          """{
            "result": {
                "queries": [[]]
            }
          }"""
        )
      }

      /** Sets up 5 records with no aspects, that should not be allowed to be accessed */
      def setupDisallowedRecords(param: FixtureParam) = {
        val recordId = "foo"

        for (i <- 1 to 5) {
          addRecord(
            param,
            Record(
              recordId + i,
              recordId + i,
              Map(),
              authnReadPolicyId = Some("not.default.policyid")
            )
          )
        }

        expectOpaQueryForPolicy(
          param,
          "not.default.policyid.read",
          policyResponseForUnconditionallyDisallowed
        )
      }

      /** Sets up 3 records that can be seen, and 3 that can't */
      def setupMixedAuthResultRecordsSamePolicy(param: FixtureParam) = {
        for (i <- 1 to 3) {
          addRecord(
            param,
            Record(
              "allow" + i,
              "allow" + i,
              Map(
                "stringExample" -> JsObject(
                  "nested" -> JsObject("public" -> JsString("true"))
                )
              ),
              authnReadPolicyId = Some("not.default.policyid")
            )
          )
        }

        // Record with the exact path set to false
        addRecord(
          param,
          Record(
            "deny1",
            "deny1",
            Map(
              "stringExample" -> JsObject(
                "nested" -> JsObject("public" -> JsString("false"))
              )
            ),
            authnReadPolicyId = Some("not.default.policyid")
          )
        )

        // Record missing the last value
        addRecord(
          param,
          Record(
            "deny2",
            "deny2",
            Map(
              "stringExample" -> JsObject("nested" -> JsObject())
            ),
            authnReadPolicyId = Some("not.default.policyid")
          )
        )

        // Record with no value for this aspect at all
        addRecord(
          param,
          Record(
            "deny3",
            "deny3",
            Map(),
            authnReadPolicyId = Some("not.default.policyid")
          )
        )

        expectOpaQueryForPolicy(
          param,
          "not.default.policyid.read",
          policyResponseForStringExampleAspect
        )
      }

      /** Sets up records for 5 different policies, with a record that can and can't be accessed for each */
      def setupMixedAuthResultRecordsMixedPolicies(param: FixtureParam) = {
        addAspectDef(param, "stringExample")
        addAspectDef(param, "numericExample")
        addAspectDef(param, "booleanExample")
        addAspectDef(param, "aspectExistenceExample")
        addAspectDef(param, "existenceExample")

        addStringExampleRecords(Some("stringExample.policy"))(param)
        addNumericExampleRecords(Some("numericExample.policy"))(param)
        addBooleanExampleRecords(Some("booleanExample.policy"))(param)
        addAspectExistenceExampleRecords(
          Some("aspectExistenceExample.policy")
        )(param)
        addExistenceExampleRecords(Some("existenceExample.policy"))(
          param
        )

        expectOpaQueryForPolicy(
          param,
          "stringExample.policy.read",
          policyResponseForStringExampleAspect
        )

        expectOpaQueryForPolicy(
          param,
          "numericExample.policy.read",
          policyResponseForNumericExampleAspect
        )

        expectOpaQueryForPolicy(
          param,
          "booleanExample.policy.read",
          policyResponseForBooleanExampleAspect
        )

        expectOpaQueryForPolicy(
          param,
          "aspectExistenceExample.policy.read",
          policyResponseForAspectExistenceExampleAspect
        )

        expectOpaQueryForPolicy(
          param,
          "existenceExample.policy.read",
          policyResponseForExistenceExampleAspect
        )
      }

      /** Sets up a record that when OPA is called for it, makes OPA fail with an internal server error */
      def setupError(param: FixtureParam) = {
        addExampleAspectDef(param)
        val recordId = "foo"
        addRecord(
          param,
          Record(
            recordId,
            "foo",
            Map(
              "stringExample" -> JsObject(
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
      }
    }
  }
}
