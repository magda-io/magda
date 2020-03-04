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
    """.stripMargin

  describe("without a default policy set") {
    commonTests()

    describe("GET") {
      describe("for a single record") {
        it(
          "if there's no default or specific policy in place, it should deny all access"
        ) { param =>
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

          Get(s"/v0/records/foo") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.NotFound
          }
        }

        describe("with a single linked record") {
          describe("with dereference=false") {
            it(
              "doesn't show an inner record if the user is not authorised to see it"
            ) { param =>
              setup(param)

              // add the inner record
              addRecord(
                param,
                Record(
                  "record-1",
                  "foo",
                  Map(
                    "booleanExample" -> JsObject(
                      "boolean" -> JsFalse
                    )
                  ),
                  authnReadPolicyId = Some("booleanExample.policy")
                )
              )

              // add the outer record
              addRecord(
                param,
                Record(
                  "record-2",
                  "foo",
                  Map(
                    "aspect-with-link" -> JsObject(
                      "innerId" -> JsString("record-1")
                    ),
                    "stringExample" -> JsObject(
                      "nested" -> JsObject("public" -> JsString("true"))
                    )
                  ),
                  authnReadPolicyId = Some("stringExample.policy")
                )
              )

              Get(
                s"/v0/records/record-2?aspect=aspect-with-link&dereference=false"
              ) ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK

                val response = responseAs[Record]

                response.aspects.get("aspect-with-link").isDefined shouldBe true
                println(response.aspects.get("aspect-with-link"))
                response
                  .aspects("aspect-with-link")
                  .fields("innerId") shouldBe JsNull
              }
            }

            it(
              "shows an inner record if the user is authorised to see it"
            ) { param =>
              setup(param)

              // add the inner record
              addRecord(
                param,
                Record(
                  "record-1",
                  "foo",
                  Map(
                    "booleanExample" -> JsObject(
                      "boolean" -> JsTrue
                    )
                  ),
                  authnReadPolicyId = Some("booleanExample.policy")
                )
              )

              // add the outer record
              addRecord(
                param,
                Record(
                  "record-2",
                  "foo",
                  Map(
                    "aspect-with-link" -> JsObject(
                      "innerId" -> JsString("record-1")
                    ),
                    "stringExample" -> JsObject(
                      "nested" -> JsObject("public" -> JsString("true"))
                    )
                  ),
                  authnReadPolicyId = Some("stringExample.policy")
                )
              )

              Get(
                s"/v0/records/record-2?aspect=aspect-with-link&dereference=false"
              ) ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK

                val response = responseAs[Record]

                response.aspects.get("aspect-with-link").isDefined shouldBe true
                println(response.aspects.get("aspect-with-link"))
                response
                  .aspects("aspect-with-link")
                  .fields("innerId") shouldBe JsString("record-1")
              }
            }
          }

          describe("with dereference=true") {
            it(
              "should not display a linked record if that record's policy disallows access"
            ) { param =>
              setup(param)

              // add the inner record
              addRecord(
                param,
                Record(
                  "record-1",
                  "foo",
                  Map(
                    "booleanExample" -> JsObject(
                      "boolean" -> JsFalse
                    )
                  ),
                  authnReadPolicyId = Some("booleanExample.policy")
                )
              )

              // add the outer record
              addRecord(
                param,
                Record(
                  "record-2",
                  "foo",
                  Map(
                    "aspect-with-link" -> JsObject(
                      "innerId" -> JsString("record-1")
                    ),
                    "stringExample" -> JsObject(
                      "nested" -> JsObject("public" -> JsString("true"))
                    )
                  ),
                  authnReadPolicyId = Some("stringExample.policy")
                )
              )

              Get(
                s"/v0/records/record-2?aspect=aspect-with-link&dereference=true"
              ) ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK

                val response = responseAs[Record]

                response.aspects.get("aspect-with-link").isDefined shouldBe true
                println(response.aspects.get("aspect-with-link"))
                response
                  .aspects("aspect-with-link")
                  .fields("innerId") shouldBe JsNull
              }
            }

            it(
              "should only display multiple linked records' ids based on those records' policy"
            ) { param =>
              setup(param)

              val innerRecord = Record(
                "record-1",
                "foo",
                Map(
                  "booleanExample" -> JsObject(
                    "boolean" -> JsTrue
                  )
                ),
                authnReadPolicyId = Some("booleanExample.policy")
              )

              // add the inner record
              addRecord(
                param,
                innerRecord
              )

              // add the outer record
              addRecord(
                param,
                Record(
                  "record-2",
                  "foo",
                  Map(
                    "aspect-with-link" -> JsObject(
                      "innerId" -> JsString("record-1")
                    ),
                    "stringExample" -> JsObject(
                      "nested" -> JsObject("public" -> JsString("true"))
                    )
                  ),
                  authnReadPolicyId = Some("stringExample.policy")
                )
              )

              Get(
                s"/v0/records/record-2?aspect=aspect-with-link&dereference=true"
              ) ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK

                val response = responseAs[Record]

                response.aspects.get("aspect-with-link").isDefined shouldBe true
                println(response.aspects.get("aspect-with-link"))

                val returnedInnerRecord = response
                  .aspects("aspect-with-link")
                  .fields("innerId")
                  .convertTo[Record]

                returnedInnerRecord shouldEqual innerRecord.copy(
                  authnReadPolicyId = None
                )
              }
            }
          }

          it(
            "being able to see an inner record should NOT grant visibility to an outer record"
          ) { param =>
            setup(param)

            // add the inner record
            addRecord(
              param,
              Record(
                "record-1",
                "foo",
                Map(
                  "booleanExample" -> JsObject(
                    "boolean" -> JsTrue
                  )
                ),
                authnReadPolicyId = Some("booleanExample.policy")
              )
            )

            // add the outer record
            addRecord(
              param,
              Record(
                "record-2",
                "foo",
                Map(
                  "aspect-with-link" -> JsObject(
                    "innerId" -> JsString("record-1")
                  ),
                  "stringExample" -> JsObject(
                    "nested" -> JsObject("public" -> JsString("false"))
                  )
                ),
                authnReadPolicyId = Some("stringExample.policy")
              )
            )

            // Make sure we have access to the inner record (thus expect an extra call for boolean policy)
            expectOpaQueryForPolicy(
              param,
              "booleanExample.policy.read",
              policyResponseForBooleanExampleAspect
            )
            Get(
              s"/v0/records/record-1"
            ) ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }

            Get(
              s"/v0/records/record-2?aspect=aspect-with-link&dereference=false"
            ) ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.NotFound
            }

            // Call again with dereference=true, this means more calls to OPA
            expectOpaQueryForPolicy(
              param,
              "booleanExample.policy.read",
              policyResponseForBooleanExampleAspect
            )
            expectOpaQueryForPolicy(
              param,
              "stringExample.policy.read",
              policyResponseForStringExampleAspect
            )

            Get(
              s"/v0/records/record-2?aspect=aspect-with-link&dereference=true"
            ) ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.NotFound
            }
          }

          def setup(param: FixtureParam) = {
            expectOpaQueryForPolicy(
              param,
              "stringExample.policy.read",
              policyResponseForStringExampleAspect
            )
            expectOpaQueryForPolicy(
              param,
              "booleanExample.policy.read",
              policyResponseForBooleanExampleAspect
            )

            addAspectDef(
              param,
              "stringExample"
            )
            addAspectDef(
              param,
              "booleanExample"
            )

            // add an aspect def with a link in it
            addAspectDef(
              param,
              "aspect-with-link",
              Some(
                JsObject(
                  "$schema" -> JsString(
                    "http://json-schema.org/hyper-schema#"
                  ),
                  "title" -> JsString("Test"),
                  "description" -> JsString("Test"),
                  "type" -> JsString("object"),
                  "properties" -> JsObject(
                    "innerId" -> JsObject(
                      "title" -> JsString("A name given to the dataset."),
                      "type" -> JsString("string"),
                      "links" -> JsArray(
                        JsObject(
                          "href" -> JsString("/api/v0/registry/records/{$}"),
                          "rel" -> JsString("item")
                        )
                      )
                    )
                  )
                )
              )
            )
          }
        }

        describe("with an array of linked records") {
          describe("with dereference=false") {
            it("only shows inner records that the user is authorised to see") {
              param =>
                setup(param)

                addInnerRecords(param)

                // add the outer record
                addRecord(
                  param,
                  Record(
                    "record-2",
                    "foo",
                    Map(
                      "aspect-with-link" -> JsObject(
                        "innerIds" -> JsArray(
                          JsString("booleanTrue"),
                          JsString("booleanFalse"),
                          JsString("stringTrue"),
                          JsString("stringFalse")
                        )
                      ),
                      "stringExample" -> JsObject(
                        "nested" -> JsObject("public" -> JsString("true"))
                      )
                    ),
                    authnReadPolicyId = Some("stringExample.policy")
                  )
                )

                // Get the results
                Get(
                  s"/v0/records/record-2?aspect=aspect-with-link&dereference=false"
                ) ~> addTenantIdHeader(
                  TENANT_1
                ) ~> param.api(Full).routes ~> check {
                  status shouldEqual StatusCodes.OK

                  val response = responseAs[Record]

                  response.aspects
                    .get("aspect-with-link")
                    .isDefined shouldBe true

                  val links = response
                    .aspects("aspect-with-link")
                    .fields("innerIds")
                    .convertTo[JsArray]
                    .elements
                    .map {
                      case JsString(string) => string
                      case _ =>
                        throw new Error("Had a link that wasn't a string")
                    }

                  links shouldEqual Vector("booleanTrue", "stringTrue")
                }
            }
          }

          describe("with dereference=true") {
            it("only shows inner records that the user is authorised to see") {
              param =>
                setup(param)

                val matchingInnerRecords = addInnerRecords(param)

                // add the outer record
                addRecord(
                  param,
                  Record(
                    "record-2",
                    "foo",
                    Map(
                      "aspect-with-link" -> JsObject(
                        "innerIds" -> JsArray(
                          JsString("booleanTrue"),
                          JsString("booleanFalse"),
                          JsString("stringTrue"),
                          JsString("stringFalse")
                        )
                      ),
                      "stringExample" -> JsObject(
                        "nested" -> JsObject("public" -> JsString("true"))
                      )
                    ),
                    authnReadPolicyId = Some("stringExample.policy")
                  )
                )

                // Get the results
                Get(
                  s"/v0/records/record-2?aspect=aspect-with-link&dereference=true"
                ) ~> addTenantIdHeader(
                  TENANT_1
                ) ~> param.api(Full).routes ~> check {
                  status shouldEqual StatusCodes.OK

                  val response = responseAs[Record]

                  response.aspects
                    .get("aspect-with-link")
                    .isDefined shouldBe true

                  val records = response
                    .aspects("aspect-with-link")
                    .fields("innerIds")
                    .convertTo[List[Record]]

                  records shouldEqual matchingInnerRecords.map(
                    _.copy(authnReadPolicyId = None)
                  )
                }
            }
          }

          it(
            "being able to see an inner record does NOT grant visibility on the outer record"
          ) { param =>
            setup(param)

            // add some inner records
            addRecord(
              param,
              Record(
                "booleanTrue",
                "foo",
                Map(
                  "booleanExample" -> JsObject(
                    "boolean" -> JsTrue
                  )
                ),
                authnReadPolicyId = Some("booleanExample.policy")
              )
            )
            addRecord(
              param,
              Record(
                "booleanFalse",
                "foo",
                Map(
                  "booleanExample" -> JsObject(
                    "boolean" -> JsFalse
                  )
                ),
                authnReadPolicyId = Some("booleanExample.policy")
              )
            )

            // add the outer record
            addRecord(
              param,
              Record(
                "record-2",
                "foo",
                Map(
                  "aspect-with-link" -> JsObject(
                    "innerIds" -> JsArray(
                      JsString("booleanTrue"),
                      JsString("booleanFalse")
                    )
                  ),
                  "stringExample" -> JsObject(
                    "nested" -> JsObject("public" -> JsString("false"))
                  )
                ),
                authnReadPolicyId = Some("stringExample.policy")
              )
            )

            // Get the results
            Get(
              s"/v0/records/record-2?aspect=aspect-with-link&dereference=false"
            ) ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.NotFound
            }

            // Try again with dereference = true (should be the same result). Expect the OPA calls to happen again.
            expectOpaQueryForPolicy(
              param,
              "stringExample.policy.read",
              policyResponseForStringExampleAspect
            )
            expectOpaQueryForPolicy(
              param,
              "booleanExample.policy.read",
              policyResponseForBooleanExampleAspect
            )
            Get(
              s"/v0/records/record-2?aspect=aspect-with-link&dereference=true"
            ) ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.NotFound
            }
          }

          def setup(param: FixtureParam) = {
            expectOpaQueryForPolicy(
              param,
              "stringExample.policy.read",
              policyResponseForStringExampleAspect
            )
            expectOpaQueryForPolicy(
              param,
              "booleanExample.policy.read",
              policyResponseForBooleanExampleAspect
            )

            addAspectDef(
              param,
              "stringExample"
            )
            addAspectDef(
              param,
              "booleanExample"
            )

            // add an aspect def with an array link in it
            addAspectDef(
              param,
              "aspect-with-link",
              Some(
                JsObject(
                  "$schema" -> JsString(
                    "http://json-schema.org/hyper-schema#"
                  ),
                  "title" -> JsString("Test"),
                  "description" -> JsString("Test"),
                  "type" -> JsString("object"),
                  "properties" -> JsObject(
                    "innerIds" -> JsObject(
                      "title" -> JsString("array of inner ids"),
                      "type" -> JsString("array"),
                      "items" -> JsObject(
                        "title" -> JsString("inner id"),
                        "type" -> JsString("string"),
                        "links" -> JsArray(
                          JsObject(
                            "href" -> JsString("/api/v0/registry/records/{$}"),
                            "rel" -> JsString("item")
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          }

          /** Adds two inner records that should be shown, and two that don't, and returns the two that do */
          def addInnerRecords(param: FixtureParam) = {
            val booleanTrue = Record(
              "booleanTrue",
              "foo",
              Map(
                "booleanExample" -> JsObject(
                  "boolean" -> JsTrue
                )
              ),
              authnReadPolicyId = Some("booleanExample.policy")
            )

            // add some inner records
            addRecord(
              param,
              booleanTrue
            )
            addRecord(
              param,
              Record(
                "booleanFalse",
                "foo",
                Map(
                  "booleanExample" -> JsObject(
                    "boolean" -> JsFalse
                  )
                ),
                authnReadPolicyId = Some("booleanExample.policy")
              )
            )

            val stringTrue = Record(
              "stringTrue",
              "foo",
              Map(
                "stringExample" -> JsObject(
                  "nested" -> JsObject("public" -> JsString("true"))
                )
              ),
              authnReadPolicyId = Some("stringExample.policy")
            )
            addRecord(
              param,
              stringTrue
            )
            addRecord(
              param,
              Record(
                "stringFalse",
                "foo",
                Map(
                  "stringExample" -> JsObject(
                    "nested" -> JsObject("public" -> JsString("false"))
                  )
                ),
                authnReadPolicyId = Some("stringExample.policy")
              )
            )

            List(booleanTrue, stringTrue)
          }
        }
      }

      describe("for multiple records") {
        it(
          "allows access to aspect-less records if default policy resolves to unconditionally allow access to everything"
        ) { param =>
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
                "queries": []
            }
          }"""
          )

          Get(s"/v0/records") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val resPage = responseAs[RecordsPage[Record]]

            resPage.records.length shouldBe 5
          }
        }

        it(
          "denies access to aspect-less records if default policy resolves to unconditionally deny access to them"
        ) { param =>
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
            "result": {}
          }"""
          )

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

          Get(s"/v0/records") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            val resPage = responseAs[RecordsPage[Record]]

            resPage.records.length shouldBe 3
            resPage.records.forall(_.id.startsWith("allow"))
          }
        }

        it(
          "when records have different policies, displays records with matching policies"
        ) { param =>
          addAspectDef(param, "stringExample")
          addAspectDef(param, "numericExample")
          addAspectDef(param, "booleanExample")
          addAspectDef(param, "aspectExistenceExample")
          addAspectDef(param, "existenceExample")

          addStringExampleRecords(param)
          addNumericExampleRecords(param)
          addBooleanExampleRecords(param)
          addAspectExistenceExampleRecords(param)
          addExistenceExampleRecords(param)

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
      }
    }
  }
}
