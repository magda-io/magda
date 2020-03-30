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

  /**
    * Performs tests for the single record endpoint (/records/${recordId}) that should be done under
    * three sets of conditions:
    * 1. The record being requested has no policy set, and there is a default policy (default policy should be used)
    *    (defaultPolicy=Some, recordHasPolicy=false)
    * 2. The record being requested has a policy set, and there is ALSO a default policy (record policy should be used)
    *    (defaultPolicy=Some, recordHasPolicy=true)
    * 3. The record being requested has a policy set, and there is NO default policy (record policy should be used)
    *    (defaultPolicy=None, recordHasPolicy=true)
    *
    * @param defaultPolicy The default policy that's been set in settings, or None if no policy has been set
    * @param recordHasPolicy Whether a policy should be set on the record
    */
  def commonSingleRecordTests(
      defaultPolicy: Option[String],
      recordHasPolicy: Boolean
  ) = {
    val recordPolicy = if (recordHasPolicy) Some("nonDefaultPolicy") else None
    val expectedReadPolicy = recordPolicy.orElse(defaultPolicy).get + ".read"

    it(
      "allows access to an aspect-less record if policy resolves to unconditionally allow access"
    ) { param =>
      setupNoAspectRecord(
        param,
        recordPolicy,
        expectedReadPolicy,
        """{ "queries": [[]] }"""
      )

      Get(s"/v0/records/foo") ~> addTenantIdHeader(
        TENANT_1
      ) ~> param.api(Full).routes ~> check {
        status shouldEqual StatusCodes.OK
        val resRecord = responseAs[Record]

        resRecord.id shouldBe "foo"
      }
    }

    it(
      "disallows access to an aspect-less record if policy resolves to unconditionally disallow access"
    ) { param =>
      setupNoAspectRecord(param, recordPolicy, expectedReadPolicy, """{}""")

      Get(s"/v0/records/foo") ~> addTenantIdHeader(
        TENANT_1
      ) ~> param.api(Full).routes ~> check {
        status shouldEqual StatusCodes.NotFound
      }
    }

    it(
      "allows access to an record if record matches policy"
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
          authnReadPolicyId = recordPolicy
        )
      )

      expectOpaQueryForPolicy(
        param,
        expectedReadPolicy,
        policyResponseForStringExampleAspect
      )

      Get(s"/v0/records/foo") ~> addTenantIdHeader(
        TENANT_1
      ) ~> param.api(Full).routes ~> check {
        status shouldEqual StatusCodes.OK
      }
    }

    it(
      "does not allow access to an record if record does not match policy"
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
              "nested" -> JsObject("public" -> JsString("false"))
            )
          ),
          authnReadPolicyId = recordPolicy
        )
      )

      expectOpaQueryForPolicy(
        param,
        expectedReadPolicy,
        policyResponseForStringExampleAspect
      )

      Get(s"/v0/records/foo") ~> addTenantIdHeader(
        TENANT_1
      ) ~> param.api(Full).routes ~> check {
        status shouldEqual StatusCodes.NotFound
      }
    }

    describe("policies successfully allow and deny for") {
      it("a string-based policy") { param =>
        doPolicyTest(
          param,
          "stringExample",
          addStringExampleRecords(recordPolicy),
          policyResponseForStringExampleAspect
        )
      }

      it("a boolean-based policy") { param =>
        doPolicyTest(
          param,
          "booleanExample",
          addBooleanExampleRecords(recordPolicy),
          policyResponseForBooleanExampleAspect
        )
      }

      it("a numeric-based policy") { param =>
        doPolicyTest(
          param,
          "numericExample",
          addNumericExampleRecords(recordPolicy),
          policyResponseForNumericExampleAspect
        )
      }

      it("a policy that tests for the existence of an aspect") { param =>
        doPolicyTest(
          param,
          "aspectExistenceExample",
          addAspectExistenceExampleRecords(recordPolicy),
          policyResponseForAspectExistenceExampleAspect
        )
      }

      it(
        "a policy that tests for the existence of a field within an aspect"
      ) { param =>
        doPolicyTest(
          param,
          "existenceExample",
          addExistenceExampleRecords(recordPolicy),
          policyResponseForExistenceExampleAspect
        )
      }

      it(
        "a policy that involves checking if one array and another array have a value in common (a la esri)"
      ) { param =>
        doPolicyTest(
          param,
          "arrayComparisonExample",
          addArrayComparisonExampleRecords(recordPolicy),
          policyResponseForArrayComparisonAspect
        )
      }

      def doPolicyTest(
          param: FixtureParam,
          exampleId: String,
          addRecords: FixtureParam => Unit,
          policyResponse: String
      ) = {
        val PascalCaseId = exampleId.charAt(0).toUpper + exampleId
          .substring(1)
        val camelCaseId = exampleId.charAt(0).toLower + exampleId.substring(
          1
        )

        addAspectDef(param, camelCaseId)
        addRecords(param)

        expectOpaQueryForPolicy(
          param,
          expectedReadPolicy,
          policyResponse
        ).twice()

        Get(s"/v0/records/allow$PascalCaseId") ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Get(s"/v0/records/deny$PascalCaseId") ~> addTenantIdHeader(
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
              "stringExample" -> JsObject(
                "nested" -> JsObject("public" -> JsString("true"))
              )
            ),
            authnReadPolicyId = recordPolicy
          )
        )

        expectOpaQueryForPolicy(
          param,
          expectedReadPolicy,
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

  /**
    *
    */
  def commonSingleRecordSummaryTests(
      defaultPolicy: Option[String],
      recordHasPolicy: Boolean
  ) = {
    val recordPolicy = if (recordHasPolicy) Some("nonDefaultPolicy") else None
    val expectedReadPolicy = recordPolicy.orElse(defaultPolicy).get + ".read"

    it(
      "allows access to an aspect-less record if policy resolves to unconditionally allow access"
    ) { param =>
      setupNoAspectRecord(
        param,
        recordPolicy,
        expectedReadPolicy,
        """{ "queries": [[]] }"""
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
      "disallows access to an aspect-less record if policy resolves to unconditionally disallow access"
    ) { param =>
      setupNoAspectRecord(param, recordPolicy, expectedReadPolicy, """{}""")

      Get(s"/v0/records/summary/foo") ~> addTenantIdHeader(
        TENANT_1
      ) ~> param.api(Full).routes ~> check {
        status shouldEqual StatusCodes.NotFound
      }
    }

    it(
      "allows access to an record if record matches policy"
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
          authnReadPolicyId = recordPolicy
        )
      )

      expectOpaQueryForPolicy(
        param,
        expectedReadPolicy,
        policyResponseForStringExampleAspect
      )

      Get(s"/v0/records/summary/foo") ~> addTenantIdHeader(
        TENANT_1
      ) ~> param.api(Full).routes ~> check {
        status shouldEqual StatusCodes.OK
      }
    }

    it(
      "does not allow access to an record if record does not match policy"
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
              "nested" -> JsObject("public" -> JsString("false"))
            )
          ),
          authnReadPolicyId = recordPolicy
        )
      )

      expectOpaQueryForPolicy(
        param,
        expectedReadPolicy,
        policyResponseForStringExampleAspect
      )

      Get(s"/v0/records/summary/foo") ~> addTenantIdHeader(
        TENANT_1
      ) ~> param.api(Full).routes ~> check {
        status shouldEqual StatusCodes.NotFound
      }
    }

    describe("policies successfully allow and deny for") {
      it("a string-based policy") { param =>
        doPolicyTestSummary(
          param,
          "stringExample",
          addStringExampleRecords(recordPolicy),
          policyResponseForStringExampleAspect
        )
      }

      it("a boolean-based policy") { param =>
        doPolicyTestSummary(
          param,
          "booleanExample",
          addBooleanExampleRecords(recordPolicy),
          policyResponseForBooleanExampleAspect
        )
      }

      it("a numeric-based policy") { param =>
        doPolicyTestSummary(
          param,
          "numericExample",
          addNumericExampleRecords(recordPolicy),
          policyResponseForNumericExampleAspect
        )
      }

      it("a policy that tests for the existence of an aspect") { param =>
        doPolicyTestSummary(
          param,
          "aspectExistenceExample",
          addAspectExistenceExampleRecords(recordPolicy),
          policyResponseForAspectExistenceExampleAspect
        )
      }

      it(
        "a policy that tests for the existence of a field within an aspect"
      ) { param =>
        doPolicyTestSummary(
          param,
          "existenceExample",
          addExistenceExampleRecords(recordPolicy),
          policyResponseForExistenceExampleAspect
        )
      }

      it(
        "a policy that involves checking if one array and another array have a value in common (a la esri)"
      ) { param =>
        doPolicyTestSummary(
          param,
          "arrayComparisonExample",
          addArrayComparisonExampleRecords(recordPolicy),
          policyResponseForArrayComparisonAspect
        )
      }

      def doPolicyTestSummary(
          param: FixtureParam,
          exampleId: String,
          addRecords: FixtureParam => Unit,
          policyResponse: String
      ) = {
        val PascalCaseId = exampleId.charAt(0).toUpper + exampleId
          .substring(1)
        val camelCaseId = exampleId.charAt(0).toLower + exampleId.substring(
          1
        )

        addAspectDef(param, camelCaseId)
        addRecords(param)

        expectOpaQueryForPolicy(
          param,
          expectedReadPolicy,
          policyResponse
        ).twice()

        Get(s"/v0/records/summary/allow$PascalCaseId") ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Get(s"/v0/records/summary/deny$PascalCaseId") ~> addTenantIdHeader(
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
              "stringExample" -> JsObject(
                "nested" -> JsObject("public" -> JsString("true"))
              )
            ),
            authnReadPolicyId = recordPolicy
          )
        )

        expectOpaQueryForPolicy(
          param,
          expectedReadPolicy,
          "ERROR: Not found",
          StatusCodes.InternalServerError
        )

        Get(s"/v0/records/summary/foo") ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.InternalServerError
        }
    }
  }

  def setupNoAspectRecord(
      param: FixtureParam,
      recordPolicy: Option[String],
      expectedReadPolicy: String,
      result: String
  ) = {
    addRecord(
      param,
      Record(
        "foo",
        "foo",
        Map(),
        authnReadPolicyId = recordPolicy
      )
    )
    expectOpaQueryForPolicy(
      param,
      expectedReadPolicy,
      s"""{
            "result": ${result}
          }"""
    )
  }

  /**
    * Does tests for one record linking to another, with and without dereferencing
    *
    * @param innerRecordPolicy The policy to set on inner records (i.e. the record that gets linked TO)
    * @param outerRecordPolicy The policy to set on outer records (i.e. the record that gets linked FROM). This is also used for some inner records in arrays
    * @param expectedInnerReadPolicy The policy to expect a call to OPA for, for inner records
    * @param expectedOuterReadPolicy The policy to expect a call to OPA for, for outer records
    */
  def doLinkTests(
      innerRecordPolicy: Option[String],
      outerRecordPolicy: Option[String],
      expectedInnerReadPolicy: String,
      expectedOuterReadPolicy: String
  ) = {
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
              authnReadPolicyId = innerRecordPolicy
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
              authnReadPolicyId = outerRecordPolicy
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
              authnReadPolicyId = innerRecordPolicy
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
              authnReadPolicyId = outerRecordPolicy
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
              authnReadPolicyId = innerRecordPolicy
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
              authnReadPolicyId = outerRecordPolicy
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
            authnReadPolicyId = innerRecordPolicy
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
              authnReadPolicyId = outerRecordPolicy
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

            val returnedInnerRecord = response
              .aspects("aspect-with-link")
              .fields("innerId")
              .convertTo[Record]

            returnedInnerRecord shouldEqual innerRecord
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
            authnReadPolicyId = innerRecordPolicy
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
            authnReadPolicyId = outerRecordPolicy
          )
        )

        // Make sure we have access to the inner record (thus expect an extra call for inner policy)
        expectOpaQueryForPolicy(
          param,
          expectedInnerReadPolicy,
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
          expectedInnerReadPolicy,
          policyResponseForBooleanExampleAspect
        )
        expectOpaQueryForPolicy(
          param,
          expectedOuterReadPolicy,
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
          expectedOuterReadPolicy,
          policyResponseForStringExampleAspect
        )
        expectOpaQueryForPolicy(
          param,
          expectedInnerReadPolicy,
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
                      JsString("policyATrue"),
                      JsString("policyAFalse"),
                      JsString("policyBTrue"),
                      JsString("policyBFalse")
                    )
                  ),
                  "stringExample" -> JsObject(
                    "nested" -> JsObject("public" -> JsString("true"))
                  )
                ),
                authnReadPolicyId = outerRecordPolicy
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

              links shouldEqual Vector("policyATrue", "policyBTrue")
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
                      JsString("policyATrue"),
                      JsString("policyAFalse"),
                      JsString("policyBTrue"),
                      JsString("policyBFalse")
                    )
                  ),
                  "stringExample" -> JsObject(
                    "nested" -> JsObject("public" -> JsString("true"))
                  )
                ),
                authnReadPolicyId = outerRecordPolicy
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

              records shouldEqual matchingInnerRecords
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
            "policyATrue",
            "foo",
            Map(
              "booleanExample" -> JsObject(
                "boolean" -> JsTrue
              )
            ),
            authnReadPolicyId = innerRecordPolicy
          )
        )
        addRecord(
          param,
          Record(
            "policyAFalse",
            "foo",
            Map(
              "booleanExample" -> JsObject(
                "boolean" -> JsFalse
              )
            ),
            authnReadPolicyId = innerRecordPolicy
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
                  JsString("policyATrue"),
                  JsString("policyAFalse")
                )
              ),
              "stringExample" -> JsObject(
                "nested" -> JsObject("public" -> JsString("false"))
              )
            ),
            authnReadPolicyId = outerRecordPolicy
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
          expectedOuterReadPolicy,
          policyResponseForStringExampleAspect
        )
        expectOpaQueryForPolicy(
          param,
          expectedInnerReadPolicy,
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
          expectedOuterReadPolicy,
          policyResponseForStringExampleAspect
        )
        expectOpaQueryForPolicy(
          param,
          expectedInnerReadPolicy,
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
        val policyATrue = Record(
          "policyATrue",
          "foo",
          Map(
            "booleanExample" -> JsObject(
              "boolean" -> JsTrue
            )
          ),
          authnReadPolicyId = innerRecordPolicy
        )

        // add some inner records
        addRecord(
          param,
          policyATrue
        )
        addRecord(
          param,
          Record(
            "policyAFalse",
            "foo",
            Map(
              "booleanExample" -> JsObject(
                "boolean" -> JsFalse
              )
            ),
            authnReadPolicyId = innerRecordPolicy
          )
        )

        val policyBTrue = Record(
          "policyBTrue",
          "foo",
          Map(
            "stringExample" -> JsObject(
              "nested" -> JsObject("public" -> JsString("true"))
            )
          ),
          authnReadPolicyId = outerRecordPolicy
        )
        addRecord(
          param,
          policyBTrue
        )
        addRecord(
          param,
          Record(
            "policyBFalse",
            "foo",
            Map(
              "stringExample" -> JsObject(
                "nested" -> JsObject("public" -> JsString("false"))
              )
            ),
            authnReadPolicyId = outerRecordPolicy
          )
        )

        List(policyATrue, policyBTrue)
      }
    }
  }

  /**
    * Does tests for getting multiple records via /record that have links in them
    *
    * @param policyA
    * @param policyB
    * @param expectedRequestedPolicyA
    * @param expectedRequestedPolicyB
    */
  def doLinkTestsOnRecordsEndpoint(
      policyA: Option[String],
      policyB: Option[String],
      expectedRequestedPolicyA: String,
      expectedRequestedPolicyB: String
  ) = {
    describe("with single linked records") {
      describe("with dereference=false") {
        it(
          "should only display a linked record if that record's policy allows access"
        ) { param =>
          setup(param)

          val addedInnerRecords = addRecords(param)

          Get(
            s"/v0/records?aspect=aspect-with-link&dereference=false"
          ) ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK

            val response = responseAs[RecordsPage[Record]]
            response.records.map(_.id) shouldBe List(
              "record-outer-1",
              "record-outer-2",
              "record-outer-3",
              "record-outer-4"
            )

            val innerRecords = response.records.map(
              record =>
                record
                  .aspects("aspect-with-link")
                  .fields("innerId")
            )

            for (number <- 0 to 1) {
              (innerRecords(number)) shouldEqual JsString(
                addedInnerRecords(
                  number
                ).id
              )
            }

            for (number <- 2 to 3) {
              innerRecords(number) shouldEqual JsNull
            }
          }
        }
      }

      describe("with dereference=true") {
        it(
          "should only display a linked record if that record's policy allows access"
        ) { param =>
          setup(param)

          val addedInnerRecords = addRecords(param)

          Get(
            s"/v0/records?aspect=aspect-with-link&dereference=true"
          ) ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK

            val response = responseAs[RecordsPage[Record]]
            response.records.map(_.id) shouldBe List(
              "record-outer-1",
              "record-outer-2",
              "record-outer-3",
              "record-outer-4"
            )

            val innerRecords = response.records.map(
              record =>
                record
                  .aspects("aspect-with-link")
                  .fields("innerId")
            )

            for (number <- 0 to 1) {
              (innerRecords(number)
                .convertTo[Record]) shouldEqual addedInnerRecords(
                number
              )
            }

            for (number <- 2 to 3) {
              innerRecords(number) shouldEqual JsNull
            }
          }
        }
      }

      it(
        "being able to see inner records should NOT grant visibility to outer records"
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
            authnReadPolicyId = policyA
          )
        )

        // Make sure we can see the inner record
        expectOpaQueryForPolicy(
          param,
          expectedRequestedPolicyA,
          policyResponseForBooleanExampleAspect
        )
        Get(
          s"/v0/records/record-1"
        ) ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

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
            authnReadPolicyId = policyB
          )
        )

        Get(
          s"/v0/records?aspect=aspect-with-link&dereference=false"
        ) ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
          val response = responseAs[RecordsPage[Record]]

          response.records.size shouldEqual 0
        }

        // Call again with dereference=true, this means more calls to OPA
        expectOpaQueryForPolicy(
          param,
          expectedRequestedPolicyA,
          policyResponseForBooleanExampleAspect
        )
        expectOpaQueryForPolicy(
          param,
          expectedRequestedPolicyB,
          policyResponseForStringExampleAspect
        )

        Get(
          s"/v0/records?aspect=aspect-with-link&dereference=true"
        ) ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
          val response = responseAs[RecordsPage[Record]]

          response.records.size shouldEqual 0
        }
      }

      def setup(param: FixtureParam) = {
        expectOpaQueryForPolicy(
          param,
          expectedRequestedPolicyB,
          policyResponseForStringExampleAspect
        )
        expectOpaQueryForPolicy(
          param,
          expectedRequestedPolicyA,
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

      /**
        * Adds two records that link to inner records, with the inner records being allowed by their policies
        *
        * @return The two inner records that are allowed
        */
      def addRecords(param: FixtureParam) = {
        val inner1 = Record(
          "record-inner-allowed-1",
          "foo",
          Map(
            "booleanExample" -> JsObject(
              "boolean" -> JsTrue
            )
          ),
          authnReadPolicyId = policyA
        )

        // add inner records
        addRecord(
          param,
          inner1
        )

        val inner2 = Record(
          "record-inner-allowed-2",
          "foo",
          Map(
            "stringExample" -> JsObject(
              "nested" -> JsObject("public" -> JsString("true"))
            )
          ),
          authnReadPolicyId = policyB
        )

        addRecord(
          param,
          inner2
        )

        addRecord(
          param,
          Record(
            "record-inner-not-allowed-1",
            "foo",
            Map(
              "booleanExample" -> JsObject(
                "boolean" -> JsFalse
              )
            ),
            authnReadPolicyId = policyA
          )
        )
        addRecord(
          param,
          Record(
            "record-inner-not-allowed-2",
            "foo",
            Map(
              "stringExample" -> JsObject(
                "nested" -> JsObject("public" -> JsString("false"))
              )
            ),
            authnReadPolicyId = policyB
          )
        )

        // add outer records
        addRecord(
          param,
          Record(
            "record-outer-1",
            "foo",
            Map(
              "aspect-with-link" -> JsObject(
                "innerId" -> JsString("record-inner-allowed-1")
              ),
              "stringExample" -> JsObject(
                "nested" -> JsObject("public" -> JsString("true"))
              )
            ),
            authnReadPolicyId = policyB
          )
        )
        addRecord(
          param,
          Record(
            "record-outer-2",
            "foo",
            Map(
              "aspect-with-link" -> JsObject(
                "innerId" -> JsString("record-inner-allowed-2")
              ),
              "booleanExample" -> JsObject(
                "boolean" -> JsTrue
              )
            ),
            authnReadPolicyId = policyA
          )
        )
        addRecord(
          param,
          Record(
            "record-outer-3",
            "foo",
            Map(
              "aspect-with-link" -> JsObject(
                "innerId" -> JsString("record-inner-allowed-3")
              ),
              "booleanExample" -> JsObject(
                "boolean" -> JsTrue
              )
            ),
            authnReadPolicyId = policyA
          )
        )
        addRecord(
          param,
          Record(
            "record-outer-4",
            "foo",
            Map(
              "aspect-with-link" -> JsObject(
                "innerId" -> JsString("record-inner-not-allowed-4")
              ),
              "stringExample" -> JsObject(
                "nested" -> JsObject("public" -> JsString("true"))
              )
            ),
            authnReadPolicyId = policyB
          )
        )

        List(inner1, inner2)
      }
    }

    describe("with an array of linked records") {
      describe("with dereference=false") {
        it("only shows inner records that the user is authorised to see") {
          param =>
            setup(param)

            addInnerRecords(param)
            addOuterRecords(param)

            // Get the results
            Get(
              s"/v0/records?aspect=aspect-with-link&dereference=false"
            ) ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
              val response = responseAs[RecordsPage[Record]]

              response.records.map(_.id) shouldEqual List(
                "record-outer-all",
                "record-outer-as",
                "record-outer-bs"
              )

              def checkRecordContains(record: Record, recordIds: String*) = {
                record.aspects
                  .get("aspect-with-link")
                  .isDefined shouldBe true

                val links = record
                  .aspects("aspect-with-link")
                  .fields("innerIds")
                  .convertTo[JsArray]
                  .elements
                  .map {
                    case JsString(string) => string
                    case _ =>
                      throw new Error("Had a link that wasn't a string")
                  }

                links shouldEqual recordIds.toVector
              }

              checkRecordContains(
                response.records(0),
                "policyATrue",
                "policyBTrue"
              )
              checkRecordContains(response.records(1), "policyATrue")
              checkRecordContains(response.records(2), "policyBTrue")
            }
        }
      }

      describe("with dereference=true") {
        it("only shows inner records that the user is authorised to see") {
          param =>
            setup(param)

            val innerVisibleRecords = addInnerRecords(param)
            addOuterRecords(param)

            // Get the results
            Get(
              s"/v0/records?aspect=aspect-with-link&dereference=true"
            ) ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
              val response = responseAs[RecordsPage[Record]]

              response.records.map(_.id) shouldEqual List(
                "record-outer-all",
                "record-outer-as",
                "record-outer-bs"
              )

              def checkRecordContains(
                  outerRecord: Record,
                  innerRecordsToMatch: Record*
              ) = {
                outerRecord.aspects
                  .get("aspect-with-link")
                  .isDefined shouldBe true

                val innerRecords = outerRecord
                  .aspects("aspect-with-link")
                  .fields("innerIds")
                  .convertTo[List[Record]]

                innerRecords shouldEqual innerRecordsToMatch.toVector
              }

              checkRecordContains(
                response.records(0),
                innerVisibleRecords: _*
              )
              checkRecordContains(response.records(1), innerVisibleRecords(0))
              checkRecordContains(response.records(2), innerVisibleRecords(1))
            }
        }
      }

      it(
        "being able to see inner records does NOT grant visibility on outer records"
      ) { param =>
        setup(param)

        addInnerRecords(param)

        // add outer records
        addRecord(
          param,
          Record(
            "record-true-and-false",
            "foo",
            Map(
              "aspect-with-link" -> JsObject(
                "innerIds" -> JsArray(
                  JsString("policyATrue"),
                  JsString("policyAFalse")
                )
              ),
              "stringExample" -> JsObject(
                "nested" -> JsObject("public" -> JsString("false"))
              )
            ),
            authnReadPolicyId = policyB
          )
        )
        addRecord(
          param,
          Record(
            "record-all-true",
            "foo",
            Map(
              "aspect-with-link" -> JsObject(
                "innerIds" -> JsArray(
                  JsString("policyATrue"),
                  JsString("policyBTrue")
                )
              ),
              "booleanExample" -> JsObject(
                "boolean" -> JsFalse
              )
            ),
            authnReadPolicyId = policyA
          )
        )

        // Get the results
        Get(
          s"/v0/records?aspect=aspect-with-link&dereference=false"
        ) ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
          val response = responseAs[RecordsPage[Record]]
          response.records.size shouldBe 0
        }

        // Try again with dereference = true (should be the same result). Expect the OPA calls to happen again.
        expectOpaQueryForPolicy(
          param,
          expectedRequestedPolicyB,
          policyResponseForStringExampleAspect
        )
        expectOpaQueryForPolicy(
          param,
          expectedRequestedPolicyA,
          policyResponseForBooleanExampleAspect
        )
        Get(
          s"/v0/records?aspect=aspect-with-link&dereference=true"
        ) ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
          val response = responseAs[RecordsPage[Record]]
          response.records.size shouldBe 0
        }
      }

      def setup(param: FixtureParam) = {
        expectOpaQueryForPolicy(
          param,
          expectedRequestedPolicyB,
          policyResponseForStringExampleAspect
        )
        expectOpaQueryForPolicy(
          param,
          expectedRequestedPolicyA,
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
        val policyATrue = Record(
          "policyATrue",
          "foo",
          Map(
            "booleanExample" -> JsObject(
              "boolean" -> JsTrue
            )
          ),
          authnReadPolicyId = policyA
        )

        // add some inner records
        addRecord(
          param,
          policyATrue
        )
        addRecord(
          param,
          Record(
            "policyAFalse",
            "foo",
            Map(
              "booleanExample" -> JsObject(
                "boolean" -> JsFalse
              )
            ),
            authnReadPolicyId = policyA
          )
        )

        val policyBTrue = Record(
          "policyBTrue",
          "foo",
          Map(
            "stringExample" -> JsObject(
              "nested" -> JsObject("public" -> JsString("true"))
            )
          ),
          authnReadPolicyId = policyB
        )
        addRecord(
          param,
          policyBTrue
        )
        addRecord(
          param,
          Record(
            "policyBFalse",
            "foo",
            Map(
              "stringExample" -> JsObject(
                "nested" -> JsObject("public" -> JsString("false"))
              )
            ),
            authnReadPolicyId = policyB
          )
        )

        List(policyATrue, policyBTrue)
      }

      /** Adds outer records, that link to the ones created in addInnerRecords */
      def addOuterRecords(param: FixtureParam) = {
        addRecord(
          param,
          Record(
            "record-outer-all",
            "foo",
            Map(
              "aspect-with-link" -> JsObject(
                "innerIds" -> JsArray(
                  JsString("policyATrue"),
                  JsString("policyAFalse"),
                  JsString("policyBTrue"),
                  JsString("policyBFalse")
                )
              ),
              "stringExample" -> JsObject(
                "nested" -> JsObject("public" -> JsString("true"))
              )
            ),
            authnReadPolicyId = policyB
          )
        )
        addRecord(
          param,
          Record(
            "record-outer-as",
            "foo",
            Map(
              "aspect-with-link" -> JsObject(
                "innerIds" -> JsArray(
                  JsString("policyATrue"),
                  JsString("policyAFalse")
                )
              ),
              "stringExample" -> JsObject(
                "nested" -> JsObject("public" -> JsString("true"))
              )
            ),
            authnReadPolicyId = policyB
          )
        )
        addRecord(
          param,
          Record(
            "record-outer-bs",
            "foo",
            Map(
              "aspect-with-link" -> JsObject(
                "innerIds" -> JsArray(
                  JsString("policyBTrue"),
                  JsString("policyBFalse")
                )
              ),
              "stringExample" -> JsObject(
                "nested" -> JsObject("public" -> JsString("true"))
              )
            ),
            authnReadPolicyId = policyB
          )
        )
      }

    }
  }

  def addExampleAspectDef(param: FixtureParam) =
    addAspectDef(param, "stringExample")

  def addAspectDef(
      param: FixtureParam,
      id: String,
      schema: Option[JsObject] = None
  ) =
    param.asAdmin(
      Post(
        "/v0/aspects",
        AspectDefinition(
          id,
          id,
          schema
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
      if (status !== StatusCodes.OK) {
        println(response.entity.toString())
      }
      status shouldEqual StatusCodes.OK
    }
  }

  def addStringExampleRecords(policyId: Option[String])(param: FixtureParam) {
    addRecord(
      param,
      Record(
        "allowStringExample",
        "allowStringExample",
        Map(
          "stringExample" -> JsObject(
            "nested" -> JsObject("public" -> JsString("true"))
          )
        ),
        authnReadPolicyId = policyId
      )
    )
    addRecord(
      param,
      Record(
        "denyStringExample",
        "denyStringExample",
        Map(
          "stringExample" -> JsObject(
            "nested" -> JsObject("public" -> JsString("false"))
          )
        ),
        authnReadPolicyId = policyId
      )
    )
  }

  def addNumericExampleRecords(policyId: Option[String])(param: FixtureParam) {
    addRecord(
      param,
      Record(
        "allowNumericExample",
        "allowNumericExample",
        Map(
          "numericExample" -> JsObject(
            "number" ->
              JsNumber(-1)
          )
        ),
        authnReadPolicyId = policyId
      )
    )
    addRecord(
      param,
      Record(
        "denyNumericExample",
        "denyNumericExample",
        Map(
          "numericExample" -> JsObject(
            "number" ->
              JsNumber(2)
          )
        ),
        authnReadPolicyId = policyId
      )
    )
  }

  def addBooleanExampleRecords(policyId: Option[String])(param: FixtureParam) {
    addRecord(
      param,
      Record(
        "allowBooleanExample",
        "allowBooleanExample",
        Map(
          "booleanExample" -> JsObject(
            "boolean" ->
              JsTrue
          )
        ),
        authnReadPolicyId = policyId
      )
    )
    addRecord(
      param,
      Record(
        "denyBooleanExample",
        "denyBooleanExample",
        Map(
          "booleanExample" -> JsObject(
            "boolean" ->
              JsFalse
          )
        ),
        authnReadPolicyId = policyId
      )
    )
  }

  def addAspectExistenceExampleRecords(
      policyId: Option[String]
  )(param: FixtureParam) {
    addRecord(
      param,
      Record(
        "allowAspectExistenceExample",
        "allowAspectExistenceExample",
        Map(
          "aspectExistenceExample" -> JsObject(
            )
        ),
        authnReadPolicyId = policyId
      )
    )
    addRecord(
      param,
      Record(
        "denyAspectExistenceExample",
        "denyAspectExistenceExample",
        Map(
          ),
        authnReadPolicyId = policyId
      )
    )
  }

  def addExistenceExampleRecords(
      policyId: Option[String]
  )(param: FixtureParam) {
    addRecord(
      param,
      Record(
        "allowExistenceExample",
        "allowExistenceExample",
        Map(
          "existenceExample" -> JsObject(
            "value" -> JsObject()
          )
        ),
        authnReadPolicyId = policyId
      )
    )
    addRecord(
      param,
      Record(
        "denyExistenceExample",
        "denyExistenceExample",
        Map(
          "existenceExample" -> JsObject()
        ),
        authnReadPolicyId = policyId
      )
    )
  }

  def addArrayComparisonExampleRecords(
      policyId: Option[String]
  )(param: FixtureParam) {
    addRecord(
      param,
      Record(
        "allowArrayComparisonExample",
        "allowArrayComparisonExample",
        Map(
          "arrayComparisonExample" -> JsObject(
            "array" -> JsArray(
              JsString("one"),
              JsString("two")
            )
          )
        ),
        authnReadPolicyId = policyId
      )
    )
    addRecord(
      param,
      Record(
        "denyArrayComparisonExample",
        "denyArrayComparisonExample",
        Map(
          "arrayComparisonExample" -> JsObject(
            "array" -> JsArray(
              JsString("three"),
              JsString("four")
            )
          )
        ),
        authnReadPolicyId = policyId
      )
    )
  }

  val policyResponseForStringExampleAspect = """
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
                        "value": "stringExample"
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

  val policyResponseForNumericExampleAspect = """
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
                        "value": "lt"
                      }
                    ]
                  },
                  {
                    "type": "number",
                    "value": 0
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
                        "value": "numericExample"
                      },
                      {
                        "type": "string",
                        "value": "number"
                      }
                    ]
                  }
                ]
              }
            ]
          ]
        }
      }
  """

  val policyResponseForBooleanExampleAspect = """
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
                    "type": "boolean",
                    "value": true
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
                        "value": "booleanExample"
                      },
                      {
                        "type": "string",
                        "value": "boolean"
                      }
                    ]
                  }
                ]
              }
            ]
          ]
        }
      }
  """

  val policyResponseForAspectExistenceExampleAspect =
    """
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
                        "value": "aspectExistenceExample"
                      }
                    ]
                  }
                ]
              }
            ]
          ]
        }
      }
  """

  val policyResponseForExistenceExampleAspect = """
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
                        "value": "existenceExample"
                      },
                      {
                        "type": "string",
                        "value": "value"
                      }
                    ]
                  }
                ]
              }
            ]
          ]
        }
      }
  """

  val policyResponseForArrayComparisonAspect = """
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
                        "type": "string",
                        "value": "two"
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
                                "value": "arrayComparisonExample"
                            },
                            {
                                "type": "string",
                                "value": "array"
                            },
                            {
                                "type": "var",
                                "value": "$06"
                            }
                        ]
                    }
                ]
              }
            ],
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
                          "type": "string",
                          "value": "two"
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
                                  "value": "esri-access-control"
                              },
                              {
                                  "type": "string",
                                  "value": "groups"
                              },
                              {
                                  "type": "var",
                                  "value": "$06"
                              }
                          ]
                      }
                  ]
              }
            ]
          ]
        }
      }
  """
}
