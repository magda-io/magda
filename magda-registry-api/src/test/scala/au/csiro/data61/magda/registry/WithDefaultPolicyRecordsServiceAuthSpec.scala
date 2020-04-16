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

class WithDefaultPolicyRecordsServiceAuthSpec
    extends BaseRecordsServiceAuthSpec {
  override def testConfigSource =
    s"""
       |db.default.url = "${databaseUrl}?currentSchema=test"
       |authorization.skip = false
       |authorization.skipOpaQuery = false
       |opa.recordPolicyId = "default.policy"
       |akka.loglevel = ERROR
    """.stripMargin

  describe("with default policy set") {
    describe("GET") {
      describe("for a single record") {
        describe("with a policy set on the record") {
          commonSingleRecordTests(Some("default.policy"), true)
        }

        describe("with no policy set on the record") {
          commonSingleRecordTests(Some("default.policy"), false)

          it(
            "allows access to an aspect-less record if default policy resolves to unconditionally allow access"
          ) { param =>
            //   val recordId = "foo"
            //   addRecord(param, Record(recordId, "foo", Map(), None))
            //   expectOpaQueryForPolicy(
            //     param,
            //     "default.policy.read",
            //     """{
            //   "result": {
            //       "queries": [[]]
            //   }
            // }"""
            //   )

            setupRecord(
              param,
              None,
              "default.policy.read",
              policyResponseForUnconditionallyAllowed
            )

            Get(s"/v0/records/foo") ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
              val resRecord = responseAs[Record]

              resRecord.id shouldBe "foo"
              resRecord.authnReadPolicyId shouldBe None
            }
          }

          it(
            "disallows access to an aspect-less record if default policy resolves to unconditionally disallow access"
          ) { param =>
            //   val recordId = "foo"

            //   addRecord(param, Record(recordId, "foo", Map(), None))
            //   expectOpaQueryForPolicy(param, "default.policy.read", """{
            //   "result": {}
            // }""")
            setupRecord(
              param,
              None,
              "default.policy.read",
              policyResponseForUnconditionallyDisallowed
            )

            Get(s"/v0/records/foo") ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.NotFound
            }
          }

          describe("based on the value in an aspect") {
            it(
              "allows access to a record if policy resolves true"
            ) { param =>
              addExampleAspectDef(param)

              setupRecord(
                param,
                None,
                "default.policy.read",
                policyResponseForStringExampleAspect,
                Map(
                  "stringExample" -> JsObject(
                    "nested" -> JsObject("public" -> JsString("true"))
                  )
                )
              )

              Get(s"/v0/records/foo") ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK
              }
            }

            it(
              "denies access to a record if policy resolves false"
            ) { param =>
              addExampleAspectDef(param)
              setupRecord(
                param,
                None,
                "default.policy.read",
                policyResponseForStringExampleAspect,
                Map(
                  "stringExample" -> JsObject(
                    "nested" -> JsObject("public" -> JsString("false"))
                  )
                )
              )

              Get(s"/v0/records/foo") ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.NotFound
              }
            }

            it(
              "denies access to a record if required aspect is not present"
            ) { param =>
              addExampleAspectDef(param)
              setupRecord(
                param,
                None,
                "default.policy.read",
                policyResponseForStringExampleAspect
              )

              Get(s"/v0/records/foo") ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.NotFound
              }
            }
          }
        }

        describe("with links") {
          describe("with a policy set on the outer record") {
            doLinkTests(
              None,
              Some("stringPolicy.example"),
              "default.policy.read",
              "stringPolicy.example.read"
            )
          }

          describe("with a policy set on the inner record") {
            doLinkTests(
              Some("stringPolicy.example"),
              None,
              "stringPolicy.example.read",
              "default.policy.read"
            )
          }
        }
      }

      describe("for a single record summary") {
        describe("with a policy set on the record") {
          commonSingleRecordSummaryTests(Some("default.policy"), true)
        }

        describe("with no policy set on the record") {
          commonSingleRecordSummaryTests(Some("default.policy"), false)

          it(
            "allows access to an aspect-less record if default policy resolves to unconditionally allow access"
          ) { param =>
            setupRecord(
              param,
              None,
              "default.policy.read",
              policyResponseForUnconditionallyAllowed
            )

            Get(s"/v0/records/summary/foo") ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
              val resRecord = responseAs[RecordSummary]

              resRecord.id shouldBe "foo"
            }
          }

          it(
            "disallows access to an aspect-less record if default policy resolves to unconditionally disallow access"
          ) { param =>
            setupRecord(
              param,
              None,
              "default.policy.read",
              policyResponseForUnconditionallyDisallowed
            )

            Get(s"/v0/records/summary/foo") ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.NotFound
            }
          }

          describe("based on the value in an aspect") {
            it(
              "allows access to a record if policy resolves true"
            ) { param =>
              addExampleAspectDef(param)

              setupRecord(
                param,
                None,
                "default.policy.read",
                policyResponseForStringExampleAspect,
                Map(
                  "stringExample" -> JsObject(
                    "nested" -> JsObject("public" -> JsString("true"))
                  )
                )
              )

              Get(s"/v0/records/summary/foo") ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK
                val summary = responseAs[RecordSummary]
                summary.aspects shouldEqual List("stringExample")
              }
            }

            it(
              "denies access to a record if policy resolves false"
            ) { param =>
              addExampleAspectDef(param)
              setupRecord(
                param,
                None,
                "default.policy.read",
                policyResponseForStringExampleAspect,
                Map(
                  "stringExample" -> JsObject(
                    "nested" -> JsObject("public" -> JsString("false"))
                  )
                )
              )

              Get(s"/v0/records/summary/foo") ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.NotFound
              }
            }

            it(
              "denies access to a record if required aspect is not present"
            ) { param =>
              addExampleAspectDef(param)
              setupRecord(
                param,
                None,
                "default.policy.read",
                policyResponseForStringExampleAspect
              )

              Get(s"/v0/records/summary/foo") ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.NotFound
              }
            }
          }
        }
      }

      describe("for record history") {
        describe("with a policy set on the record") {
          commonRecordHistoryTests(Some("default.policy"), true)
        }

        describe("with no policy set on the record") {
          commonRecordHistoryTests(Some("default.policy"), false)

          it(
            "shows events from an aspect-less record if default policy resolves to unconditionally allow access"
          ) { param =>
            setupRecord(
              param,
              None,
              "default.policy.read",
              policyResponseForUnconditionallyAllowed
            )

            Get(s"/v0/records/foo/history") ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
              val resRecord = responseAs[EventsPage]

              resRecord.events.head.data
                .fields("recordId") shouldEqual JsString("foo")
            }
          }

          it(
            "doesn't show events from an aspect-less record if default policy resolves to unconditionally disallow access"
          ) { param =>
            setupRecord(
              param,
              None,
              "default.policy.read",
              policyResponseForUnconditionallyDisallowed
            )

            Get(s"/v0/records/foo/history") ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
              val resRecord = responseAs[EventsPage]
              resRecord.events.length shouldBe 0
            }
          }

          describe("based on the value in an aspect") {
            it(
              "shows events from a record if policy resolves true"
            ) { param =>
              addExampleAspectDef(param)

              setupRecord(
                param,
                None,
                "default.policy.read",
                policyResponseForStringExampleAspect,
                Map(
                  "stringExample" -> JsObject(
                    "nested" -> JsObject("public" -> JsString("true"))
                  )
                )
              )

              Get(s"/v0/records/foo/history") ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK
                val resRecord = responseAs[EventsPage]
                resRecord.events.head.data
                  .fields("recordId") shouldEqual JsString("foo")
              }
            }

            it(
              "shows no events from a record if policy resolves false"
            ) { param =>
              addExampleAspectDef(param)
              setupRecord(
                param,
                None,
                "default.policy.read",
                policyResponseForStringExampleAspect,
                Map(
                  "stringExample" -> JsObject(
                    "nested" -> JsObject("public" -> JsString("false"))
                  )
                )
              )

              Get(s"/v0/records/foo/history") ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK
                val resRecord = responseAs[EventsPage]
                resRecord.events.length shouldBe 0
              }
            }

            it(
              "shows no events from a record if required aspect is not present"
            ) { param =>
              addExampleAspectDef(param)
              setupRecord(
                param,
                None,
                "default.policy.read",
                policyResponseForStringExampleAspect
              )

              Get(s"/v0/records/foo/history") ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK
                val resRecord = responseAs[EventsPage]
                resRecord.events.length shouldBe 0
              }
            }
          }
        }
      }

      describe("for record version (time-travel)") {
        describe("with a policy set on the record") {
          commonVersionTests(Some("default.policy"), true)
        }

        describe("with no policy set on the record") {
          commonVersionTests(Some("default.policy"), false)

          it(
            "shows an aspect-less record if default policy resolves to unconditionally allow access"
          ) { param =>
            setupRecord(
              param,
              None,
              "default.policy.read",
              policyResponseForUnconditionallyAllowed
            )

            Get(s"/v0/records/foo/history/${Integer.MAX_VALUE}") ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
              val resRecord = responseAs[Record]

              resRecord.id shouldEqual "foo"
            }
          }

          it(
            "returns 404 for a record if default policy resolves to unconditionally disallow access"
          ) { param =>
            setupRecord(
              param,
              None,
              "default.policy.read",
              policyResponseForUnconditionallyDisallowed
            )

            Get(s"/v0/records/foo/history/${Integer.MAX_VALUE}") ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.NotFound
            }
          }

          describe("based on the value in an aspect") {
            it(
              "shows a record if default policy resolves true"
            ) { param =>
              addExampleAspectDef(param)

              setupRecord(
                param,
                None,
                "default.policy.read",
                policyResponseForStringExampleAspect,
                Map(
                  "stringExample" -> JsObject(
                    "nested" -> JsObject("public" -> JsString("true"))
                  )
                )
              )

              Get(s"/v0/records/foo/history/${Integer.MAX_VALUE}") ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK
                val resRecord = responseAs[Record]
                resRecord.id shouldEqual "foo"
                resRecord.aspects shouldEqual Map(
                  "stringExample" -> JsObject(
                    "nested" -> JsObject("public" -> JsString("true"))
                  )
                )
              }
            }

            it(
              "returns 404 for a record if default policy resolves false"
            ) { param =>
              addExampleAspectDef(param)
              setupRecord(
                param,
                None,
                "default.policy.read",
                policyResponseForStringExampleAspect,
                Map(
                  "stringExample" -> JsObject(
                    "nested" -> JsObject("public" -> JsString("false"))
                  )
                )
              )

              Get(s"/v0/records/foo/history/${Integer.MAX_VALUE}") ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.NotFound
              }
            }

            it(
              "returns 404 for a record if required aspect for the default policy is not present"
            ) { param =>
              addExampleAspectDef(param)
              setupRecord(
                param,
                None,
                "default.policy.read",
                policyResponseForStringExampleAspect
              )

              Get(s"/v0/records/foo/history/${Integer.MAX_VALUE}") ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.NotFound
              }
            }
          }
        }
      }

      describe("for multiple records") {
        it(
          "falls back to the default policy when records don't have a policy set"
        ) { param =>
          setupMultipleRecords(param)

          Get(s"/v0/records") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val resPage = responseAs[RecordsPage[Record]]

            resPage.records.map(_.id).toSet shouldEqual Set(
              "allowStringExample",
              "allowDefaultExample"
            )
          }
        }
      }

      describe("for multiple record summaries") {
        it(
          "falls back to the default policy when records don't have a policy set"
        ) { param =>
          setupMultipleRecords(param)

          Get(s"/v0/records/summary") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val resPage = responseAs[RecordsPage[RecordSummary]]

            resPage.records.map(_.id).toSet shouldEqual Set(
              "allowStringExample",
              "allowDefaultExample"
            )
          }
        }
      }

      /**
        * Sets up stringExample and numericExample aspects, adds two records with the stringExample policy set,
        * and two records with no authnReadPolicyId, and returns the numeric policy when opa is asked for the
        * default policy id (i.e. the numeric policy is default).
        */
      def setupMultipleRecords(param: FixtureParam) = {
        addAspectDef(param, "stringExample")
        addAspectDef(param, "numericExample")

        // Add records with an authnReadPolicyId set to string policy
        addStringExampleRecords(Some("stringExample.policy"))(param)

        // Add records with no authnReadPolicyId (these should default back to the default policy)
        addRecord(
          param,
          Record(
            "allowDefaultExample",
            "allowDefaultExample",
            Map(
              "numericExample" -> JsObject(
                "number" ->
                  JsNumber(-1)
              )
            ),
            authnReadPolicyId = None
          )
        )
        addRecord(
          param,
          Record(
            "denyDefaultExample",
            "denyDefaultExample",
            Map(
              "numericExample" -> JsObject(
                "number" ->
                  JsNumber(2)
              )
            ),
            authnReadPolicyId = None
          )
        )

        expectOpaQueryForPolicy(
          param,
          "stringExample.policy.read",
          policyResponseForStringExampleAspect
        )

        // Respond with the numeric policy for the default
        expectOpaQueryForPolicy(
          param,
          "default.policy.read",
          policyResponseForNumericExampleAspect
        )
      }
    }
  }
}
