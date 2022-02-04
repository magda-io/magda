package au.csiro.data61.magda.registry

import akka.http.scaladsl.model.StatusCodes
import au.csiro.data61.magda.model.Auth.{
  AuthDecision,
  ConciseExpression,
  ConciseOperand,
  ConciseRule,
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

  def testAspectQuery(
      testDesc: String,
      testAspects: List[AspectDefinition],
      expression: ConciseExpression,
      expectedAspectIds: List[String],
      testNegated: Boolean = true
  ): Unit = {
    it(testDesc) { param =>
      // setting up testing aspects
      param.authFetcher.setAuthDecision(
        "object/aspect/create",
        UnconditionalTrueDecision
      )

      testAspects.foreach { aspect =>
        Post("/v0/aspects", aspect) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }
      }

      param.authFetcher.resetMock()

      param.authFetcher.setAuthDecision(
        "object/aspect/read",
        AuthDecision(
          hasResidualRules = true,
          result = None,
          residualRules = Some(
            List(
              ConciseRule(
                fullName = "rule1",
                name = "rule1",
                value = JsTrue,
                // jsonSchema field should exist
                expressions = List(
                  expression
                )
              )
            )
          )
        )
      )

      Get("/v0/aspects") ~> addTenantIdHeader(
        TENANT_1
      ) ~> param.api(Full).routes ~> check {
        status shouldEqual StatusCodes.OK
        val aspects = responseAs[List[AspectDefinition]]
        aspects.map(_.id) shouldEqual expectedAspectIds
      }
    }

    if (testNegated) {
      it(testDesc + "(Negated Logic)") { param =>
        // setting up testing aspects
        param.authFetcher.setAuthDecision(
          "object/aspect/create",
          UnconditionalTrueDecision
        )

        testAspects.foreach { aspect =>
          Post("/v0/aspects", aspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
        }

        param.authFetcher.resetMock()

        param.authFetcher.setAuthDecision(
          "object/aspect/read",
          AuthDecision(
            hasResidualRules = true,
            result = None,
            residualRules = Some(
              List(
                ConciseRule(
                  fullName = "rule1",
                  name = "rule1",
                  value = JsTrue,
                  // jsonSchema field should exist
                  expressions = List(
                    expression.copy(negated = true)
                  )
                )
              )
            )
          )
        )

        Get("/v0/aspects") ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
          val aspects = responseAs[List[AspectDefinition]]
          val responseIds = aspects.map(_.id)
          testAspects
            .map(_.id)
            .filter(id => !responseIds.exists(_ == id)) shouldEqual expectedAspectIds
        }
      }
    }
  }

  describe("Aspect Service Auth Logic") {

    describe("Get by id endpoint {get} /v0/registry/aspects/{id}: ") {
      it("should response 404 when auth decision allows no record") { param =>
        // setting up testing aspects
        param.authFetcher.setAuthDecision(
          "object/aspect/create",
          UnconditionalTrueDecision
        )

        List(
          AspectDefinition("test1", "test 1", None),
          AspectDefinition(
            "test2",
            "test 2",
            Some(JsObject("b" -> JsNumber(1)))
          ),
          AspectDefinition(
            "test3",
            "test 2",
            Some(JsObject("a" -> JsNumber(1)))
          )
        ).foreach { aspect =>
          Post("/v0/aspects", aspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
        }

        param.authFetcher.resetMock()

        param.authFetcher.setAuthDecision(
          "object/aspect/read",
          AuthDecision(
            hasResidualRules = true,
            result = None,
            residualRules = Some(
              List(
                ConciseRule(
                  fullName = "rule1",
                  name = "rule1",
                  value = JsTrue,
                  expressions = List(
                    ConciseExpression(
                      negated = false,
                      operator = None,
                      operands = Vector(
                        ConciseOperand(
                          isRef = true,
                          value = JsString("input.object.aspect.jsonSchema")
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )

        // should response 404 as test1 doesn't meet authDecision (i.e. jsonSchema is not empty)
        Get("/v0/aspects/test1") ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }

        // should response 200 as test2 meet authDecision (i.e. jsonSchema is not empty)
        Get("/v0/aspects/test2") ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[AspectDefinition].id shouldBe "test2"
        }
      }

      val aspectDefinition =
        AspectDefinition("testId1", "testName", Some(JsObject()))

      endpointStandardAuthTestCase(
        Get("/v0/aspects/testId1", aspectDefinition),
        List("object/aspect/read"),
        hasPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          responseAs[AspectDefinition] shouldEqual aspectDefinition

          param.authFetcher
            .callTimesByOperationUri("object/aspect/read") shouldBe 1
        },
        noPermissionCheck = param => {
          status shouldEqual StatusCodes.NotFound
          param.authFetcher
            .callTimesByOperationUri("object/aspect/read") shouldBe 1
        },
        beforeRequest = param => {
          // create aspect before query it
          param.authFetcher.setAuthDecision(
            "object/aspect/create",
            UnconditionalTrueDecision
          )
          Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          param.authFetcher.resetMock()
        }
      )

    }

    describe("Get All endpoint {get} /v0/registry/aspects: ") {

      testAspectQuery(
        "should filter aspect correctly according to auth decision contains (AspectQueryExist 1)",
        testAspects = List(
          AspectDefinition("test1", "test AspectQueryExists 1", None),
          AspectDefinition(
            "test2",
            "test AspectQueryExists 2",
            Some(JsObject("b" -> JsNumber(1)))
          ),
          AspectDefinition(
            "test3",
            "test AspectQueryExists 2",
            Some(JsObject("a" -> JsNumber(1)))
          )
        ),
        ConciseExpression(
          negated = false,
          operator = None,
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.aspect.jsonSchema")
            )
          )
        ),
        expectedAspectIds = List("test2", "test3")
      )

      testAspectQuery(
        "should filter aspect correctly according to auth decision contains (AspectQueryExist 2)",
        testAspects = List(
          AspectDefinition("test1", "test AspectQueryExists 1", None),
          AspectDefinition(
            "test2",
            "test AspectQueryExists 2",
            Some(JsObject("b" -> JsNumber(1)))
          ),
          AspectDefinition(
            "test3",
            "test AspectQueryExists 2",
            Some(JsObject("a" -> JsNumber(1)))
          )
        ),
        ConciseExpression(
          negated = false,
          operator = None,
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.aspect.jsonSchema.a")
            )
          )
        ),
        expectedAspectIds = List("test3")
      )

      testAspectQuery(
        "should filter aspect correctly according to auth decision contains (AspectQueryWithValue)",
        testAspects = List(
          AspectDefinition("test1", "test AspectQueryWithValue 1", None),
          AspectDefinition(
            "test2",
            "test AspectQueryWithValue 2",
            Some(JsObject("a" -> JsNumber(2)))
          ),
          AspectDefinition(
            "test3",
            "test AspectQueryWithValue 2",
            Some(JsObject("a" -> JsNumber(1)))
          )
        ),
        ConciseExpression(
          negated = false,
          operator = Some(">"),
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.aspect.jsonSchema.a")
            ),
            ConciseOperand(
              isRef = false,
              value = JsNumber(1)
            )
          )
        ),
        expectedAspectIds = List("test2")
      )

      testAspectQuery(
        "should filter aspect correctly according to auth decision contains (AspectQueryWithValue test 2)",
        testAspects = List(
          AspectDefinition("test1", "test AspectQueryWithValue 1", None),
          AspectDefinition(
            "test2",
            "test AspectQueryWithValue 2",
            Some(JsObject("a" -> JsNumber(2)))
          ),
          AspectDefinition(
            "test3",
            "test AspectQueryWithValue 3",
            Some(JsObject("a" -> JsNumber(1)))
          )
        ),
        ConciseExpression(
          negated = false,
          operator = Some("="),
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.aspect.name")
            ),
            ConciseOperand(
              isRef = false,
              value = JsString("test AspectQueryWithValue 1")
            )
          )
        ),
        expectedAspectIds = List("test1")
      )

      testAspectQuery(
        "should filter aspect correctly according to auth decision contains (AspectQueryArrayNotEmpty)",
        testAspects = List(
          AspectDefinition("test1", "test AspectQueryWithValue 1", None),
          AspectDefinition(
            "test2",
            "test AspectQueryWithValue 2",
            Some(JsObject("a" -> JsArray()))
          ),
          AspectDefinition(
            "test3",
            "test AspectQueryWithValue 3",
            Some(JsObject("a" -> JsArray(JsNumber(1))))
          )
        ),
        ConciseExpression(
          negated = false,
          operator = None,
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.aspect.jsonSchema.a[_]")
            )
          )
        ),
        expectedAspectIds = List("test3")
      )

      testAspectQuery(
        "should filter aspect correctly according to auth decision contains (AspectQueryValueInArray)",
        testAspects = List(
          AspectDefinition("test1", "test AspectQueryWithValue 1", None),
          AspectDefinition(
            "test2",
            "test AspectQueryWithValue 2",
            Some(
              JsObject("a" -> JsArray(JsNumber(2), JsNumber(4), JsNumber(6)))
            )
          ),
          AspectDefinition(
            "test3",
            "test AspectQueryWithValue 3",
            Some(
              JsObject("a" -> JsArray(JsNumber(1), JsNumber(3), JsNumber(5)))
            )
          )
        ),
        ConciseExpression(
          negated = false,
          operator = Some("="),
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.aspect.jsonSchema.a[_]")
            ),
            ConciseOperand(
              isRef = false,
              value = JsNumber(6)
            )
          )
        ),
        expectedAspectIds = List("test2")
      )

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
