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
