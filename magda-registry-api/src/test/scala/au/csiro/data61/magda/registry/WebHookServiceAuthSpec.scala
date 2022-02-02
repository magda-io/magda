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

import java.time.OffsetDateTime

/**
  * auth will not be skipped in this suit by setting `skipOpaQuery` = false
  */
class WebHookServiceAuthSpec extends ApiSpec {

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
      testHooks: List[WebHook],
      expression: ConciseExpression,
      expectedHookIds: List[String],
      testNegated: Boolean = true
  ): Unit = {
    it(testDesc) { param =>
      // setting up testing aspects
      param.authFetcher.setAuthDecision(
        "object/webhook/create",
        UnconditionalTrueDecision
      )

      testHooks.foreach { hook =>
        Post("/v0/hooks", hook) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }
      }

      param.authFetcher.resetMock()

      param.authFetcher.setAuthDecision(
        "object/webhook/read",
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

      Get("/v0/hooks") ~> addTenantIdHeader(
        TENANT_1
      ) ~> param.api(Full).routes ~> check {
        status shouldEqual StatusCodes.OK
        val hooks = responseAs[List[WebHook]]
        hooks.map(_.id).flatMap(_.toList) shouldEqual expectedHookIds
      }
    }

    if (testNegated) {
      it(testDesc + "(Negated Logic)") { param =>
        // setting up testing aspects
        param.authFetcher.setAuthDecision(
          "object/webhook/create",
          UnconditionalTrueDecision
        )

        testHooks.foreach { hook =>
          Post("/v0/hooks", hook) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
        }

        param.authFetcher.resetMock()

        param.authFetcher.setAuthDecision(
          "object/webhook/read",
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

        Get("/v0/hooks") ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
          val hooks = responseAs[List[WebHook]]
          val responseIds = hooks.map(_.id).flatMap(_.toList)
          testHooks
            .map(_.id)
            .flatMap(_.toList)
            .filter(id => !responseIds.exists(_ == id)) shouldEqual expectedHookIds
        }
      }
    }
  }

  describe("Webhook Service Auth Logic") {

    describe("Create endpoint {post} /v0/registry/hooks: ") {

      val hookDefinition = WebHook(
        Some("test"),
        "test hook",
        active = true,
        url = "http://test",
        eventTypes = Set(EventType.CreateRecord),
        config = WebHookConfig(
          optionalAspects = Some(List("aspects1", "aspects3", "aspects5")),
          dereference = Some(true)
        )
      )

      endpointStandardAuthTestCase(
        Post("/v0/hooks", hookDefinition),
        List("object/webhook/create"),
        hasPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          responseAs[WebHook].id.get shouldEqual hookDefinition.id.get

          param.authFetcher
            .callTimesByOperationUri("object/webhook/create") shouldBe 1
        },
        noPermissionCheck = param => {
          status shouldEqual StatusCodes.Forbidden
          param.authFetcher
            .callTimesByOperationUri("object/webhook/create") shouldBe 1
        },
        requireUserId = true
      )
    }

    describe("Modify endpoint {put} /v0/registry/hooks/{id}: ") {

      val hookDefinition = WebHook(
        Some("test"),
        "test hook",
        active = true,
        url = "http://test",
        eventTypes = Set(EventType.CreateRecord),
        config = WebHookConfig(
          optionalAspects = Some(List("aspects1", "aspects3", "aspects5")),
          dereference = Some(true)
        )
      )

      describe("with existing record") {
        endpointStandardAuthTestCase(
          Put("/v0/hooks/test", hookDefinition),
          List("object/webhook/update"),
          hasPermissionCheck = param => {
            status shouldEqual StatusCodes.OK
            responseAs[WebHook].id.get shouldEqual hookDefinition.id.get

            param.authFetcher
              .callTimesByOperationUri("object/webhook/update") shouldBe 2
          },
          noPermissionCheck = param => {
            status shouldEqual StatusCodes.Forbidden
            param.authFetcher
              .callTimesByOperationUri("object/webhook/update") shouldBe 1
          },
          requireUserId = true,
          beforeRequest = param => {
            // create hook before modify it
            param.authFetcher.setAuthDecision(
              "object/webhook/create",
              UnconditionalTrueDecision
            )
            Post("/v0/hooks", hookDefinition) ~> addUserId() ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }
            param.authFetcher.resetMock()
          }
        )
      }

      describe("without existing record") {
        endpointStandardAuthTestCase(
          Put("/v0/hooks/test", hookDefinition),
          List("object/webhook/create"),
          hasPermissionCheck = param => {
            status shouldEqual StatusCodes.OK
            responseAs[WebHook].id.get shouldEqual hookDefinition.id.get
            param.authFetcher
              .callTimesByOperationUri("object/webhook/create") shouldBe 1
          },
          noPermissionCheck = param => {
            status shouldEqual StatusCodes.Forbidden
            param.authFetcher
              .callTimesByOperationUri("object/webhook/create") shouldBe 1
          },
          requireUserId = true
        )
      }

    }

    describe("Delete endpoint {delete} /v0/registry/hooks/{id}: ") {
      val hookDefinition = WebHook(
        Some("test"),
        "test hook",
        active = true,
        url = "http://test",
        eventTypes = Set(EventType.CreateRecord),
        config = WebHookConfig(
          optionalAspects = Some(List("aspects1", "aspects3", "aspects5")),
          dereference = Some(true)
        )
      )

      describe("with existing record") {
        endpointStandardAuthTestCase(
          Delete("/v0/hooks/test"),
          List("object/webhook/delete"),
          hasPermissionCheck = param => {
            status shouldEqual StatusCodes.OK

            param.authFetcher
              .callTimesByOperationUri("object/webhook/delete") shouldBe 1
          },
          noPermissionCheck = param => {
            status shouldEqual StatusCodes.Forbidden
            param.authFetcher
              .callTimesByOperationUri("object/webhook/delete") shouldBe 1
          },
          requireUserId = false,
          beforeRequest = param => {
            // create hook before modify it
            param.authFetcher.setAuthDecision(
              "object/webhook/create",
              UnconditionalTrueDecision
            )
            Post("/v0/hooks", hookDefinition) ~> addUserId() ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }
            param.authFetcher.resetMock()
          }
        )
      }

      describe("without existing record") {
        endpointStandardAuthTestCase(
          Delete("/v0/hooks/test"),
          List("object/webhook/delete"),
          hasPermissionCheck = param => {
            status shouldEqual StatusCodes.OK
            param.authFetcher
              .callTimesByOperationUri("object/webhook/delete") shouldBe 1
          },
          noPermissionCheck = param => {
            status shouldEqual StatusCodes.Forbidden
            param.authFetcher
              .callTimesByOperationUri("object/webhook/delete") shouldBe 1
          },
          requireUserId = false
        )
      }
    }

    describe("Ack endpoint {post} /v0/registry/hooks/{id}/ack: ") {

      val hookAcknowledgement = WebHookAcknowledgement(succeeded = false)
      val hookDefinition = WebHook(
        Some("test"),
        "test hook",
        active = true,
        url = "http://test",
        eventTypes = Set(EventType.CreateRecord),
        config = WebHookConfig(
          optionalAspects = Some(List("aspects1", "aspects3", "aspects5")),
          dereference = Some(true)
        )
      )

      describe("with existing record") {
        endpointStandardAuthTestCase(
          Post("/v0/hooks/test/ack", hookAcknowledgement),
          List("object/webhook/ack"),
          hasPermissionCheck = param => {
            status shouldEqual StatusCodes.OK

            param.authFetcher
              .callTimesByOperationUri("object/webhook/ack") shouldBe 1
          },
          noPermissionCheck = param => {
            status shouldEqual StatusCodes.Forbidden
            param.authFetcher
              .callTimesByOperationUri("object/webhook/ack") shouldBe 1
          },
          requireUserId = false,
          beforeRequest = param => {
            // create hook before modify it
            param.authFetcher.setAuthDecision(
              "object/webhook/create",
              UnconditionalTrueDecision
            )
            Post("/v0/hooks", hookDefinition) ~> addUserId() ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }
            param.authFetcher.resetMock()
          }
        )
      }

      describe("without existing record") {
        endpointStandardAuthTestCase(
          Post("/v0/hooks/test/ack", hookAcknowledgement),
          List("object/webhook/ack"),
          hasPermissionCheck = param => {
            status shouldEqual StatusCodes.BadRequest
            param.authFetcher
              .callTimesByOperationUri("object/webhook/ack") shouldBe 0
          },
          noPermissionCheck = param => {
            status shouldEqual StatusCodes.BadRequest
            param.authFetcher
              .callTimesByOperationUri("object/webhook/ack") shouldBe 0
          },
          requireUserId = false,
          skipPolicyRetrieveAndProcessCheck = true
        )
      }

    }

    describe("Get by id endpoint {get} /v0/registry/hook/{id}:  ") {
      it("should response 404 when auth decision allows no record") { param =>
        // setting up testing data
        param.authFetcher.setAuthDecision(
          "object/webhook/create",
          UnconditionalTrueDecision
        )

        List(
          WebHook(
            Some("test1"),
            "test AspectQueryExists 1",
            active = false,
            url = "http://test1",
            eventTypes = Set(EventType.CreateRecord),
            config = WebHookConfig(
              aspects = Some(List("aspects1")),
              dereference = Some(true)
            )
          ),
          WebHook(
            Some("test3"),
            "test AspectQueryExists 3",
            active = true,
            url = "http://test3",
            eventTypes = Set(EventType.CreateRecord),
            config = WebHookConfig(
              aspects = Some(List()),
              dereference = Some(true)
            )
          )
        ).foreach { hook =>
          Post("/v0/hooks", hook) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
        }

        param.authFetcher.resetMock()

        param.authFetcher.setAuthDecision(
          "object/webhook/read",
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
                          value =
                            JsString("input.object.webhook.config.aspects[_]")
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )

        // should response 404 as test3 doesn't meet authDecision
        Get("/v0/hooks/test3") ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }

        // should response 200 as test1 meet authDecision
        Get("/v0/hooks/test1") ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[WebHook].id.get shouldBe "test1"
        }
      }

      val hookDefinition = WebHook(
        Some("test"),
        "test hook",
        active = true,
        url = "http://test",
        eventTypes = Set(EventType.CreateRecord),
        config = WebHookConfig(
          optionalAspects = Some(List("aspects1", "aspects3", "aspects5")),
          dereference = Some(true)
        )
      )

      endpointStandardAuthTestCase(
        Get("/v0/hooks/test"),
        List("object/webhook/read"),
        hasPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          responseAs[WebHook].id.get shouldBe hookDefinition.id.get
          param.authFetcher
            .callTimesByOperationUri("object/webhook/read") shouldBe 1
        },
        noPermissionCheck = param => {
          status shouldEqual StatusCodes.NotFound
          param.authFetcher
            .callTimesByOperationUri("object/webhook/read") shouldBe 1
        },
        beforeRequest = param => {
          param.authFetcher.setAuthDecision(
            "object/webhook/create",
            UnconditionalTrueDecision
          )
          Post("/v0/hooks", hookDefinition) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          param.authFetcher.resetMock()
        }
      )
    }

    describe("Get All endpoint {get} /v0/registry/hooks: ") {

      testAspectQuery(
        "should filter aspect correctly according to auth decision contains (AspectQueryExist)",
        testHooks = List(
          WebHook(
            Some("test1"),
            "test AspectQueryExists 1",
            active = true,
            url = "http://test1",
            eventTypes = Set(EventType.CreateRecord),
            config = WebHookConfig(
              optionalAspects = Some(List("aspects1")),
              dereference = Some(true)
            )
          ),
          WebHook(
            Some("test2"),
            "test AspectQueryExists 2",
            active = true,
            url = "http://test2",
            eventTypes = Set(EventType.CreateRecord),
            config = WebHookConfig(
              aspects = Some(List("aspects2")),
              dereference = Some(true)
            )
          )
        ),
        ConciseExpression(
          negated = false,
          operator = None,
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.webhook.config.optionalAspects")
            )
          )
        ),
        expectedHookIds = List("test1")
      )

      testAspectQuery(
        "should filter aspect correctly according to auth decision contains (AspectQueryWithValue)",
        testHooks = List(
          WebHook(
            Some("test1"),
            "test AspectQueryExists 1",
            active = false,
            url = "http://test1",
            eventTypes = Set(EventType.CreateRecord),
            config = WebHookConfig(
              optionalAspects = Some(List("aspects1")),
              dereference = Some(true)
            )
          ),
          WebHook(
            Some("test2"),
            "test AspectQueryExists 2",
            active = true,
            url = "http://test2",
            eventTypes = Set(EventType.CreateRecord),
            config = WebHookConfig(
              aspects = Some(List("aspects2")),
              dereference = Some(false)
            )
          )
        ),
        ConciseExpression(
          negated = false,
          operator = Some("="),
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.webhook.config.dereference")
            ),
            ConciseOperand(
              isRef = false,
              value = JsTrue
            )
          )
        ),
        expectedHookIds = List("test1")
      )

      testAspectQuery(
        "should filter aspect correctly according to auth decision contains (AspectQueryWithValue test 2)",
        testHooks = List(
          WebHook(
            Some("test1"),
            "test AspectQueryExists 1",
            active = false,
            url = "http://test1",
            eventTypes = Set(EventType.CreateRecord),
            config = WebHookConfig(
              optionalAspects = Some(List("aspects1")),
              dereference = Some(true)
            )
          ),
          WebHook(
            Some("test2"),
            "test AspectQueryExists 2",
            active = true,
            url = "http://test2",
            eventTypes = Set(EventType.CreateRecord),
            config = WebHookConfig(
              aspects = Some(List("aspects2")),
              dereference = Some(false)
            )
          )
        ),
        ConciseExpression(
          negated = false,
          operator = Some("="),
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.webhook.active")
            ),
            ConciseOperand(
              isRef = false,
              value = JsTrue
            )
          )
        ),
        expectedHookIds = List("test2")
      )

      it("should filter by ownerId correctly") { param =>
        param.authFetcher.setAuthDecision(
          "object/webhook/create",
          UnconditionalTrueDecision
        )

        Post(
          "/v0/hooks",
          WebHook(
            Some("test1"),
            "test hook 1",
            active = true,
            url = "http://test",
            eventTypes = Set(EventType.CreateRecord),
            config = WebHookConfig(
              optionalAspects = Some(List("aspects1", "aspects3", "aspects5")),
              dereference = Some(true)
            )
          )
        ) ~> addUserId(Some("3f1ee629-e070-4294-8db9-7ac371fd8526")) ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Post(
          "/v0/hooks",
          WebHook(
            Some("test2"),
            "test hook 2",
            active = true,
            url = "http://test",
            eventTypes = Set(EventType.CreateRecord),
            config = WebHookConfig(
              optionalAspects = Some(List("aspects1", "aspects3", "aspects5")),
              dereference = Some(true)
            )
          )
        ) ~> addUserId(Some("54754c04-9a41-43fb-a4b0-a2daf3917c58")) ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Post(
          "/v0/hooks",
          WebHook(
            Some("test3"),
            "test hook 3",
            active = true,
            url = "http://test",
            eventTypes = Set(EventType.CreateRecord),
            config = WebHookConfig(
              optionalAspects = Some(List("aspects1", "aspects3", "aspects5")),
              dereference = Some(true)
            )
          )
        ) ~> addUserId(Some("f085ca8b-b044-4f93-8bd4-b15c0c8d001c")) ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        param.authFetcher.resetMock()

        param.authFetcher.setAuthDecision(
          "object/webhook/read",
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
                      operator = Some("="),
                      operands = Vector(
                        ConciseOperand(
                          isRef = true,
                          value = JsString("input.object.webhook.ownerId")
                        ),
                        ConciseOperand(
                          isRef = false,
                          value =
                            JsString("54754c04-9a41-43fb-a4b0-a2daf3917c58")
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )

        // should only response hook with owner "54754c04-9a41-43fb-a4b0-a2daf3917c58"
        Get("/v0/hooks") ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
          val hooks = responseAs[List[WebHook]]
          hooks.length shouldBe 1
          hooks.head.ownerId.get shouldBe "54754c04-9a41-43fb-a4b0-a2daf3917c58"
        }
      }

      testAspectQuery(
        "should filter aspect correctly according to auth decision contains (AspectQueryArrayNotEmpty)",
        testHooks = List(
          WebHook(
            Some("test1"),
            "test AspectQueryExists 1",
            active = false,
            url = "http://test1",
            eventTypes = Set(EventType.CreateRecord),
            config = WebHookConfig(
              optionalAspects = Some(List("aspects1")),
              dereference = Some(true)
            )
          ),
          WebHook(
            Some("test2"),
            "test AspectQueryExists 2",
            active = true,
            url = "http://test2",
            eventTypes = Set(EventType.CreateRecord),
            config = WebHookConfig(
              aspects = Some(List("aspects2")),
              dereference = Some(false)
            )
          ),
          WebHook(
            Some("test3"),
            "test AspectQueryExists 3",
            active = true,
            url = "http://test3",
            eventTypes = Set(EventType.CreateRecord),
            config = WebHookConfig(
              aspects = Some(List()),
              dereference = Some(true)
            )
          )
        ),
        ConciseExpression(
          negated = false,
          operator = None,
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.webhook.config.aspects[_]")
            )
          )
        ),
        expectedHookIds = List("test2")
      )

      testAspectQuery(
        "should filter aspect correctly according to auth decision contains (AspectQueryValueInArray)",
        testHooks = List(
          WebHook(
            Some("test1"),
            "test AspectQueryExists 1",
            active = false,
            url = "http://test1",
            eventTypes = Set(EventType.CreateRecord),
            config = WebHookConfig(
              aspects = Some(List("aspects1", "aspects3", "aspects5")),
              dereference = Some(true)
            )
          ),
          WebHook(
            Some("test2"),
            "test AspectQueryExists 2",
            active = true,
            url = "http://test2",
            eventTypes = Set(EventType.CreateRecord),
            config = WebHookConfig(
              aspects = Some(List("aspects2", "aspects4", "aspects6")),
              dereference = Some(false)
            )
          ),
          WebHook(
            Some("test3"),
            "test AspectQueryExists 3",
            active = true,
            url = "http://test3",
            eventTypes = Set(EventType.CreateRecord),
            config = WebHookConfig(
              optionalAspects = Some(List("aspects1", "aspects3", "aspects5")),
              dereference = Some(true)
            )
          )
        ),
        ConciseExpression(
          negated = false,
          operator = Some("="),
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.webhook.config.aspects[_]")
            ),
            ConciseOperand(
              isRef = false,
              value = JsString("aspects3")
            )
          )
        ),
        expectedHookIds = List("test1")
      )

      endpointStandardAuthTestCase(
        Get("/v0/hooks"),
        List("object/webhook/read"),
        hasPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          responseAs[List[WebHook]].length shouldEqual 1
          param.authFetcher
            .callTimesByOperationUri("object/webhook/read") shouldBe 1
        },
        noPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          responseAs[List[WebHook]].length shouldEqual 0
          param.authFetcher
            .callTimesByOperationUri("object/webhook/read") shouldBe 1
        },
        beforeRequest = param => {
          param.authFetcher.setAuthDecision(
            "object/webhook/create",
            UnconditionalTrueDecision
          )
          val hookDefinition = WebHook(
            Some("test"),
            "test hook",
            active = true,
            url = "http://test",
            eventTypes = Set(EventType.CreateRecord),
            config = WebHookConfig(
              optionalAspects = Some(List("aspects1", "aspects3", "aspects5")),
              dereference = Some(true)
            )
          )
          Post("/v0/hooks", hookDefinition) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          param.authFetcher.resetMock()
        }
      )

    }
  }

}
