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
class RecordServiceAuthSpec extends ApiSpec {

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

  def testRecordQuery(
      testDesc: String,
      request: HttpRequest,
      testRecords: List[Record],
      expression: ConciseExpression,
      // FixtureParam: test case fixture; Boolean: whether is in a negated test case
      checkFunc: (FixtureParam, Boolean) => Unit,
      testNegated: Boolean = true
  ): Unit = {

    it(testDesc) { param =>
      settingUpTestData(param, testRecords)

      param.authFetcher.setAuthDecision(
        "object/record/read",
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
                  expression
                )
              )
            )
          )
        )
      )

      request ~> addTenantIdHeader(
        TENANT_1
      ) ~> param.api(Full).routes ~> check {
        checkFunc(param, false)
      }
    }

    if (testNegated) {
      it(testDesc + "(Negated Logic)") { param =>
        // setting up testing records
        settingUpTestData(param, testRecords)

        param.authFetcher.setAuthDecision(
          "object/record/read",
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
                    expression.copy(negated = true)
                  )
                )
              )
            )
          )
        )

        request ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          checkFunc(param, true)
        }
      }
    }
  }

  describe("Record Service Auth Logic") {

    describe("Get All API: {get} /v0/registry/records:") {

      testRecordQuery(
        "should filter aspect correctly according to auth decision contains AspectQueryValueInArray",
        Get("/v0/records"),
        testRecords = List(
          Record(
            "test1",
            "test record 1",
            aspects = Map(
              "aspectA" -> JsObject(
                // this record won't be picked as the array is on path `b`
                "b" -> JsArray(JsNumber(1), JsNumber(3), JsNumber(5))
              )
            ),
            None
          ),
          Record(
            "test2",
            "test record 2",
            aspects = Map(
              "aspectA" -> JsObject(
                "a" -> JsArray(JsNumber(1), JsNumber(3), JsNumber(5))
              )
            ),
            None
          ),
          Record(
            "test3",
            "test record 3",
            aspects = Map(
              "aspectA" -> JsObject(
                "a" -> JsArray(JsNumber(2), JsNumber(4), JsNumber(6))
              )
            ),
            None
          )
        ),
        expression = ConciseExpression(
          negated = false,
          operator = Some("="),
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.record.aspectA.a[_]")
            ),
            ConciseOperand(
              isRef = false,
              value = JsNumber(3)
            )
          )
        ),
        checkFunc = (param, isNegatedTest) => {
          status shouldBe StatusCodes.OK
          val page = responseAs[RecordsPage[Record]]
          if (isNegatedTest) {
            page.records.length shouldBe 2
            page.records.map(_.id) shouldEqual List("test1", "test3")
          } else {
            page.records.length shouldBe 1
            page.records.map(_.id) shouldEqual List("test2")
          }
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        }
      )

      testRecordQuery(
        "should filter aspect correctly according to auth decision contains AspectQueryExist",
        Get("/v0/records"),
        testRecords = List(
          Record(
            "test1",
            "test record 1",
            aspects = Map("aspectB" -> JsObject("b" -> JsNumber(1))),
            None
          ),
          Record(
            "test2",
            "test record 2",
            aspects = Map("aspectA" -> JsObject("a" -> JsNumber(1))),
            None
          ),
          Record(
            "test3",
            "test record 3",
            aspects = Map(),
            None
          )
        ),
        expression = ConciseExpression(
          negated = false,
          operator = None,
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.record.aspectA")
            )
          )
        ),
        checkFunc = (param, isNegatedTest) => {
          status shouldBe StatusCodes.OK
          val page = responseAs[RecordsPage[Record]]
          if (isNegatedTest) {
            page.records.length shouldBe 2
            page.records.map(_.id) shouldEqual List("test1", "test3")
          } else {
            page.records.length shouldBe 1
            page.records.map(_.id) shouldEqual List("test2")
          }
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        }
      )

      // this test case query a record aspect field `aspectA.a`
      testRecordQuery(
        "should filter aspect correctly according to auth decision contains AspectQueryWithValue",
        Get("/v0/records"),
        testRecords = List(
          Record(
            "test1",
            "test record 1",
            aspects = Map("aspectB" -> JsObject("b" -> JsNumber(1)))
          ),
          Record(
            "test2",
            "test record 2",
            aspects = Map("aspectA" -> JsObject("a" -> JsNumber(1)))
          ),
          Record(
            "test3",
            "test record 3",
            aspects = Map("aspectA" -> JsObject("a" -> JsNumber(6)))
          )
        ),
        expression = ConciseExpression(
          negated = false,
          operator = Some(">"),
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.record.aspectA.a")
            ),
            ConciseOperand(isRef = false, value = JsNumber(1))
          )
        ),
        checkFunc = (param, isNegatedTest) => {
          status shouldBe StatusCodes.OK
          val page = responseAs[RecordsPage[Record]]
          if (isNegatedTest) {
            page.records.length shouldBe 2
            page.records.map(_.id) shouldEqual List("test1", "test2")
          } else {
            page.records.length shouldBe 1
            page.records.map(_.id) shouldEqual List("test3")
          }
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        }
      )

      // this test case query record table column `name`
      testRecordQuery(
        "should filter aspect correctly according to auth decision contains AspectQueryWithValue no.2",
        Get("/v0/records"),
        testRecords = List(
          Record(
            "test1",
            "test record 1",
            aspects = Map("aspectB" -> JsObject("b" -> JsNumber(1)))
          ),
          Record(
            "test2",
            "test record 2",
            aspects = Map("aspectA" -> JsObject("a" -> JsNumber(1)))
          ),
          Record(
            "test3",
            "test record 3",
            aspects = Map("aspectA" -> JsObject("a" -> JsNumber(6)))
          )
        ),
        expression = ConciseExpression(
          negated = false,
          operator = Some("="),
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.record.name")
            ),
            ConciseOperand(isRef = false, value = JsString("test record 1"))
          )
        ),
        checkFunc = (param, isNegatedTest) => {
          status shouldBe StatusCodes.OK
          val page = responseAs[RecordsPage[Record]]
          if (isNegatedTest) {
            page.records.length shouldBe 2
            page.records.map(_.id) shouldEqual List("test2", "test3")
          } else {
            page.records.length shouldBe 1
            page.records.map(_.id) shouldEqual List("test1")
          }
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        }
      )

      testRecordQuery(
        "should filter aspect correctly according to auth decision contains AspectQueryArrayNotEmpty",
        Get("/v0/records"),
        testRecords = List(
          Record(
            "test1",
            "test record 1",
            aspects = Map("aspectA" -> JsObject("a" -> JsArray())),
            None
          ),
          Record(
            "test2",
            "test record 2",
            aspects = Map("aspectA" -> JsObject("a" -> JsArray(JsNumber(1)))),
            None
          ),
          Record(
            "test3",
            "test record 3",
            aspects = Map("aspectA" -> JsObject("a" -> JsArray(JsNumber(1)))),
            None
          )
        ),
        expression = ConciseExpression(
          negated = false,
          operator = None,
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.record.aspectA.a[_]")
            )
          )
        ),
        checkFunc = (param, isNegatedTest) => {
          status shouldBe StatusCodes.OK
          val page = responseAs[RecordsPage[Record]]
          if (isNegatedTest) {
            page.records.length shouldBe 1
            page.records.map(_.id) shouldEqual List("test1")
          } else {
            page.records.length shouldBe 2
            page.records.map(_.id) shouldEqual List("test2", "test3")
          }
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        }
      )

      endpointStandardAuthTestCase(
        Get(s"/v0/records"),
        List("object/record/read"),
        hasPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          val records = responseAs[RecordsPage[Record]].records
          records.length shouldBe 1
          records.head.id shouldEqual "testId"
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        },
        noPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          val records = responseAs[RecordsPage[Record]].records
          records.length shouldBe 0
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        },
        beforeRequest = param => {
          // create record
          param.authFetcher.setAuthDecision(
            "object/record/create",
            UnconditionalTrueDecision
          )
          Post(
            "/v0/records",
            Record("testId", "testName", Map(), Some("blah"))
          ) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          param.authFetcher.resetMock()
        }
      )

    }

    describe("Get All getAllSummary API: {get} /v0/registry/records/summary:") {

      testRecordQuery(
        "should filter aspect correctly according to auth decision contains AspectQueryValueInArray",
        Get("/v0/records/summary"),
        testRecords = List(
          Record(
            "test1",
            "test record 1",
            aspects = Map(
              "aspectA" -> JsObject(
                // this record won't be picked as the array is on path `b`
                "b" -> JsArray(JsNumber(1), JsNumber(3), JsNumber(5))
              )
            ),
            None
          ),
          Record(
            "test2",
            "test record 2",
            aspects = Map(
              "aspectA" -> JsObject(
                "a" -> JsArray(JsNumber(1), JsNumber(3), JsNumber(5))
              )
            ),
            None
          ),
          Record(
            "test3",
            "test record 3",
            aspects = Map(
              "aspectA" -> JsObject(
                "a" -> JsArray(JsNumber(2), JsNumber(4), JsNumber(6))
              )
            ),
            None
          )
        ),
        expression = ConciseExpression(
          negated = false,
          operator = Some("="),
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.record.aspectA.a[_]")
            ),
            ConciseOperand(
              isRef = false,
              value = JsNumber(3)
            )
          )
        ),
        checkFunc = (param, isNegatedTest) => {
          status shouldBe StatusCodes.OK
          val page = responseAs[RecordsPage[RecordSummary]]
          if (isNegatedTest) {
            page.records.length shouldBe 2
            page.records.map(_.id) shouldEqual List("test1", "test3")
          } else {
            page.records.length shouldBe 1
            page.records.map(_.id) shouldEqual List("test2")
          }
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        }
      )

      testRecordQuery(
        "should filter aspect correctly according to auth decision contains AspectQueryExist",
        Get("/v0/records/summary"),
        testRecords = List(
          Record(
            "test1",
            "test record 1",
            aspects = Map("aspectB" -> JsObject("b" -> JsNumber(1))),
            None
          ),
          Record(
            "test2",
            "test record 2",
            aspects = Map("aspectA" -> JsObject("a" -> JsNumber(1))),
            None
          ),
          Record(
            "test3",
            "test record 3",
            aspects = Map(),
            None
          )
        ),
        expression = ConciseExpression(
          negated = false,
          operator = None,
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.record.aspectA")
            )
          )
        ),
        checkFunc = (param, isNegatedTest) => {
          status shouldBe StatusCodes.OK
          val page = responseAs[RecordsPage[RecordSummary]]
          if (isNegatedTest) {
            page.records.length shouldBe 2
            page.records.map(_.id) shouldEqual List("test1", "test3")
          } else {
            page.records.length shouldBe 1
            page.records.map(_.id) shouldEqual List("test2")
          }
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        }
      )

      // this test case query a record aspect field `aspectA.a`
      testRecordQuery(
        "should filter aspect correctly according to auth decision contains AspectQueryWithValue",
        Get("/v0/records/summary"),
        testRecords = List(
          Record(
            "test1",
            "test record 1",
            aspects = Map("aspectB" -> JsObject("b" -> JsNumber(1)))
          ),
          Record(
            "test2",
            "test record 2",
            aspects = Map("aspectA" -> JsObject("a" -> JsNumber(1)))
          ),
          Record(
            "test3",
            "test record 3",
            aspects = Map("aspectA" -> JsObject("a" -> JsNumber(6)))
          )
        ),
        expression = ConciseExpression(
          negated = false,
          operator = Some(">"),
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.record.aspectA.a")
            ),
            ConciseOperand(isRef = false, value = JsNumber(1))
          )
        ),
        checkFunc = (param, isNegatedTest) => {
          status shouldBe StatusCodes.OK
          val page = responseAs[RecordsPage[RecordSummary]]
          if (isNegatedTest) {
            page.records.length shouldBe 2
            page.records.map(_.id) shouldEqual List("test1", "test2")
          } else {
            page.records.length shouldBe 1
            page.records.map(_.id) shouldEqual List("test3")
          }
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        }
      )

      // this test case query record table column `name`
      testRecordQuery(
        "should filter aspect correctly according to auth decision contains AspectQueryWithValue no.2",
        Get("/v0/records/summary"),
        testRecords = List(
          Record(
            "test1",
            "test record 1",
            aspects = Map("aspectB" -> JsObject("b" -> JsNumber(1)))
          ),
          Record(
            "test2",
            "test record 2",
            aspects = Map("aspectA" -> JsObject("a" -> JsNumber(1)))
          ),
          Record(
            "test3",
            "test record 3",
            aspects = Map("aspectA" -> JsObject("a" -> JsNumber(6)))
          )
        ),
        expression = ConciseExpression(
          negated = false,
          operator = Some("="),
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.record.name")
            ),
            ConciseOperand(isRef = false, value = JsString("test record 1"))
          )
        ),
        checkFunc = (param, isNegatedTest) => {
          status shouldBe StatusCodes.OK
          val page = responseAs[RecordsPage[RecordSummary]]
          if (isNegatedTest) {
            page.records.length shouldBe 2
            page.records.map(_.id) shouldEqual List("test2", "test3")
          } else {
            page.records.length shouldBe 1
            page.records.map(_.id) shouldEqual List("test1")
          }
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        }
      )

      testRecordQuery(
        "should filter aspect correctly according to auth decision contains AspectQueryArrayNotEmpty",
        Get("/v0/records/summary"),
        testRecords = List(
          Record(
            "test1",
            "test record 1",
            aspects = Map("aspectA" -> JsObject("a" -> JsArray())),
            None
          ),
          Record(
            "test2",
            "test record 2",
            aspects = Map("aspectA" -> JsObject("a" -> JsArray(JsNumber(1)))),
            None
          ),
          Record(
            "test3",
            "test record 3",
            aspects = Map("aspectA" -> JsObject("a" -> JsArray(JsNumber(1)))),
            None
          )
        ),
        expression = ConciseExpression(
          negated = false,
          operator = None,
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.record.aspectA.a[_]")
            )
          )
        ),
        checkFunc = (param, isNegatedTest) => {
          status shouldBe StatusCodes.OK
          val page = responseAs[RecordsPage[RecordSummary]]
          if (isNegatedTest) {
            page.records.length shouldBe 1
            page.records.map(_.id) shouldEqual List("test1")
          } else {
            page.records.length shouldBe 2
            page.records.map(_.id) shouldEqual List("test2", "test3")
          }
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        }
      )

      endpointStandardAuthTestCase(
        Get(s"/v0/records/summary"),
        List("object/record/read"),
        hasPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          val records = responseAs[RecordsPage[RecordSummary]].records
          records.length shouldBe 1
          records.head.id shouldEqual "testId"
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        },
        noPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          val records = responseAs[RecordsPage[RecordSummary]].records
          records.length shouldBe 0
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        },
        beforeRequest = param => {
          // create record
          param.authFetcher.setAuthDecision(
            "object/record/create",
            UnconditionalTrueDecision
          )
          Post(
            "/v0/records",
            Record("testId", "testName", Map(), Some("blah"))
          ) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          param.authFetcher.resetMock()
        }
      )

    }

    describe("getById API: /v0/registry/records/{id}:") {

      it(
        "should response 404 if user has not access to the record based on conditional decision"
      ) { param =>
        settingUpTestData(
          param,
          List(
            Record(
              "test1",
              "test record 1",
              aspects = Map(
                "aspectA" -> JsObject(
                  // this record won't be picked as the array is on path `b`
                  "b" -> JsArray(JsNumber(1), JsNumber(3), JsNumber(5))
                )
              )
            )
          )
        )

        // set decision
        param.authFetcher.setAuthDecision(
          "object/record/read",
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
                          value = JsString("input.object.record.aspectA.a[_]")
                        ),
                        ConciseOperand(
                          isRef = false,
                          value = JsNumber(3)
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )

        // the record with id `test1` exist but it's not accessible due to auth decision
        Get(s"/v0/records/test1") ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldBe StatusCodes.NotFound
        }
      }

      endpointStandardAuthTestCase(
        Get(s"/v0/records/testId"),
        List("object/record/read"),
        hasPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          val record = responseAs[Record]
          record.id shouldEqual "testId"
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        },
        noPermissionCheck = param => {
          status shouldEqual StatusCodes.NotFound
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        },
        beforeRequest = param => {
          // create record
          param.authFetcher.setAuthDecision(
            "object/record/create",
            UnconditionalTrueDecision
          )
          Post(
            "/v0/records",
            Record("testId", "testName", Map(), Some("blah"))
          ) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          param.authFetcher.resetMock()
        }
      )

    }

    describe("getById Summary API: /v0/registry/records/summary/{id}:") {

      it(
        "should response 404 if user has not access to the record based on conditional decision"
      ) { param =>
        settingUpTestData(
          param,
          List(
            Record(
              "test1",
              "test record 1",
              aspects = Map(
                "aspectA" -> JsObject(
                  // this record won't be picked as the array is on path `b`
                  "b" -> JsArray(JsNumber(1), JsNumber(3), JsNumber(5))
                )
              )
            )
          )
        )

        // set decision
        param.authFetcher.setAuthDecision(
          "object/record/read",
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
                          value = JsString("input.object.record.aspectA.a[_]")
                        ),
                        ConciseOperand(
                          isRef = false,
                          value = JsNumber(3)
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )

        // the record with id `test1` exist but it's not accessible due to auth decision
        Get(s"/v0/records/summary/test1") ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldBe StatusCodes.NotFound
        }
      }

      endpointStandardAuthTestCase(
        Get(s"/v0/records/summary/testId"),
        List("object/record/read"),
        hasPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          val record = responseAs[RecordSummary]
          record.id shouldEqual "testId"
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        },
        noPermissionCheck = param => {
          status shouldEqual StatusCodes.NotFound
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        },
        beforeRequest = param => {
          // create record
          param.authFetcher.setAuthDecision(
            "object/record/create",
            UnconditionalTrueDecision
          )
          Post(
            "/v0/records",
            Record("testId", "testName", Map(), Some("blah"))
          ) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          param.authFetcher.resetMock()
        }
      )

    }

    describe("Get PageTokens API: {get}/v0/registry/records/pagetokens:") {

      testRecordQuery(
        "should filter aspect correctly according to auth decision contains AspectQueryValueInArray",
        Get("/v0/records/pagetokens?limit=1"),
        testRecords = List(
          Record(
            "test1",
            "test record 1",
            aspects = Map(
              "aspectA" -> JsObject(
                // this record won't be picked as the array is on path `b`
                "b" -> JsArray(JsNumber(1), JsNumber(3), JsNumber(5))
              )
            )
          ),
          Record(
            "test2",
            "test record 2",
            aspects = Map(
              "aspectA" -> JsObject(
                "a" -> JsArray(JsNumber(1), JsNumber(3), JsNumber(5))
              )
            )
          ),
          Record(
            "test3",
            "test record 3",
            aspects = Map(
              "aspectA" -> JsObject(
                "a" -> JsArray(JsNumber(2), JsNumber(4), JsNumber(6))
              )
            )
          )
        ),
        expression = ConciseExpression(
          negated = false,
          operator = Some("="),
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.record.aspectA.a[_]")
            ),
            ConciseOperand(
              isRef = false,
              value = JsNumber(3)
            )
          )
        ),
        checkFunc = (param, isNegatedTest) => {
          status shouldBe StatusCodes.OK
          val tokenList = responseAs[List[String]]
          if (isNegatedTest) {
            tokenList.length shouldBe 3
            tokenList shouldEqual List("0", "1", "3")
          } else {
            tokenList.length shouldBe 2
            tokenList shouldEqual List("0", "2")
          }
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        }
      )

      testRecordQuery(
        "should filter aspect correctly according to auth decision contains AspectQueryExist",
        Get("/v0/records/pagetokens?limit=1"),
        testRecords = List(
          Record(
            "test1",
            "test record 1",
            aspects = Map("aspectB" -> JsObject("b" -> JsNumber(1))),
            None
          ),
          Record(
            "test2",
            "test record 2",
            aspects = Map("aspectA" -> JsObject("a" -> JsNumber(1))),
            None
          ),
          Record(
            "test3",
            "test record 3",
            aspects = Map(),
            None
          )
        ),
        expression = ConciseExpression(
          negated = false,
          operator = None,
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.record.aspectA")
            )
          )
        ),
        checkFunc = (param, isNegatedTest) => {
          status shouldBe StatusCodes.OK
          val tokenList = responseAs[List[String]]
          if (isNegatedTest) {
            tokenList.length shouldBe 3
            tokenList shouldEqual List("0", "1", "3")
          } else {
            tokenList.length shouldBe 2
            tokenList shouldEqual List("0", "2")
          }
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        }
      )

      // this test case query a record aspect field `aspectA.a`
      testRecordQuery(
        "should filter aspect correctly according to auth decision contains AspectQueryWithValue",
        Get("/v0/records/pagetokens?limit=1"),
        testRecords = List(
          Record(
            "test1",
            "test record 1",
            aspects = Map("aspectB" -> JsObject("b" -> JsNumber(1)))
          ),
          Record(
            "test2",
            "test record 2",
            aspects = Map("aspectA" -> JsObject("a" -> JsNumber(1)))
          ),
          Record(
            "test3",
            "test record 3",
            aspects = Map("aspectA" -> JsObject("a" -> JsNumber(6)))
          )
        ),
        expression = ConciseExpression(
          negated = false,
          operator = Some(">"),
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.record.aspectA.a")
            ),
            ConciseOperand(isRef = false, value = JsNumber(1))
          )
        ),
        checkFunc = (param, isNegatedTest) => {
          status shouldBe StatusCodes.OK
          val tokenList = responseAs[List[String]]
          if (isNegatedTest) {
            tokenList.length shouldBe 3
            tokenList shouldEqual List("0", "1", "2")
          } else {
            tokenList.length shouldBe 2
            tokenList shouldEqual List("0", "3")
          }
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        }
      )

      // this test case query record table column `name`
      testRecordQuery(
        "should filter aspect correctly according to auth decision contains AspectQueryWithValue no.2",
        Get("/v0/records/pagetokens?limit=1"),
        testRecords = List(
          Record(
            "test1",
            "test record 1",
            aspects = Map("aspectB" -> JsObject("b" -> JsNumber(1)))
          ),
          Record(
            "test2",
            "test record 2",
            aspects = Map("aspectA" -> JsObject("a" -> JsNumber(1)))
          ),
          Record(
            "test3",
            "test record 3",
            aspects = Map("aspectA" -> JsObject("a" -> JsNumber(6)))
          )
        ),
        expression = ConciseExpression(
          negated = false,
          operator = Some("="),
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.record.name")
            ),
            ConciseOperand(isRef = false, value = JsString("test record 1"))
          )
        ),
        checkFunc = (param, isNegatedTest) => {
          status shouldBe StatusCodes.OK
          val tokenList = responseAs[List[String]]
          if (isNegatedTest) {
            tokenList.length shouldBe 3
            tokenList shouldEqual List("0", "2", "3")
          } else {
            tokenList.length shouldBe 2
            tokenList shouldEqual List("0", "1")
          }
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        }
      )

      testRecordQuery(
        "should filter aspect correctly according to auth decision contains AspectQueryArrayNotEmpty",
        Get("/v0/records/pagetokens?limit=1"),
        testRecords = List(
          Record(
            "test1",
            "test record 1",
            aspects = Map("aspectA" -> JsObject("a" -> JsArray())),
            None
          ),
          Record(
            "test2",
            "test record 2",
            aspects = Map("aspectA" -> JsObject("a" -> JsArray(JsNumber(1)))),
            None
          ),
          Record(
            "test3",
            "test record 3",
            aspects = Map("aspectA" -> JsObject("a" -> JsArray(JsNumber(1)))),
            None
          )
        ),
        expression = ConciseExpression(
          negated = false,
          operator = None,
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.record.aspectA.a[_]")
            )
          )
        ),
        checkFunc = (param, isNegatedTest) => {
          status shouldBe StatusCodes.OK
          val tokenList = responseAs[List[String]]
          if (isNegatedTest) {
            tokenList.length shouldBe 2
            tokenList shouldEqual List("0", "1")
          } else {
            tokenList.length shouldBe 3
            tokenList shouldEqual List("0", "2", "3")
          }
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        }
      )

      endpointStandardAuthTestCase(
        Get(s"/v0/records/pagetokens?limit=1"),
        List("object/record/read"),
        hasPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          val tokenList = responseAs[List[String]]
          tokenList.length shouldBe 2
          tokenList shouldEqual List("0", "1")
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        },
        noPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          val tokenList = responseAs[List[String]]
          tokenList.length shouldBe 1
          tokenList shouldEqual List("0")
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        },
        beforeRequest = param => {
          // create record
          param.authFetcher.setAuthDecision(
            "object/record/create",
            UnconditionalTrueDecision
          )
          Post(
            "/v0/records",
            Record("testId", "testName", Map(), Some("blah"))
          ) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          param.authFetcher.resetMock()
        }
      )

    }

    describe("Get Count API: {get} /v0/registry/records/count:") {

      testRecordQuery(
        "should filter aspect correctly according to auth decision contains AspectQueryValueInArray",
        Get("/v0/records/count"),
        testRecords = List(
          Record(
            "test1",
            "test record 1",
            aspects = Map(
              "aspectA" -> JsObject(
                // this record won't be picked as the array is on path `b`
                "b" -> JsArray(JsNumber(1), JsNumber(3), JsNumber(5))
              )
            ),
            None
          ),
          Record(
            "test2",
            "test record 2",
            aspects = Map(
              "aspectA" -> JsObject(
                "a" -> JsArray(JsNumber(1), JsNumber(3), JsNumber(5))
              )
            ),
            None
          ),
          Record(
            "test3",
            "test record 3",
            aspects = Map(
              "aspectA" -> JsObject(
                "a" -> JsArray(JsNumber(2), JsNumber(4), JsNumber(6))
              )
            ),
            None
          )
        ),
        expression = ConciseExpression(
          negated = false,
          operator = Some("="),
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.record.aspectA.a[_]")
            ),
            ConciseOperand(
              isRef = false,
              value = JsNumber(3)
            )
          )
        ),
        checkFunc = (param, isNegatedTest) => {
          status shouldBe StatusCodes.OK
          val count = responseAs[CountResponse].count
          if (isNegatedTest) {
            count shouldBe 2
          } else {
            count shouldBe 1
          }
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        }
      )

      testRecordQuery(
        "should filter aspect correctly according to auth decision contains AspectQueryExist",
        Get("/v0/records/count"),
        testRecords = List(
          Record(
            "test1",
            "test record 1",
            aspects = Map("aspectB" -> JsObject("b" -> JsNumber(1))),
            None
          ),
          Record(
            "test2",
            "test record 2",
            aspects = Map("aspectA" -> JsObject("a" -> JsNumber(1))),
            None
          ),
          Record(
            "test3",
            "test record 3",
            aspects = Map(),
            None
          )
        ),
        expression = ConciseExpression(
          negated = false,
          operator = None,
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.record.aspectA")
            )
          )
        ),
        checkFunc = (param, isNegatedTest) => {
          status shouldBe StatusCodes.OK
          val count = responseAs[CountResponse].count
          if (isNegatedTest) {
            count shouldBe 2
          } else {
            count shouldBe 1
          }
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        }
      )

      // this test case query a record aspect field `aspectA.a`
      testRecordQuery(
        "should filter aspect correctly according to auth decision contains AspectQueryWithValue",
        Get("/v0/records/count"),
        testRecords = List(
          Record(
            "test1",
            "test record 1",
            aspects = Map("aspectB" -> JsObject("b" -> JsNumber(1)))
          ),
          Record(
            "test2",
            "test record 2",
            aspects = Map("aspectA" -> JsObject("a" -> JsNumber(1)))
          ),
          Record(
            "test3",
            "test record 3",
            aspects = Map("aspectA" -> JsObject("a" -> JsNumber(6)))
          )
        ),
        expression = ConciseExpression(
          negated = false,
          operator = Some(">"),
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.record.aspectA.a")
            ),
            ConciseOperand(isRef = false, value = JsNumber(1))
          )
        ),
        checkFunc = (param, isNegatedTest) => {
          status shouldBe StatusCodes.OK
          val count = responseAs[CountResponse].count
          if (isNegatedTest) {
            count shouldBe 2
          } else {
            count shouldBe 1
          }
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        }
      )

      // this test case query record table column `name`
      testRecordQuery(
        "should filter aspect correctly according to auth decision contains AspectQueryWithValue no.2",
        Get("/v0/records/count"),
        testRecords = List(
          Record(
            "test1",
            "test record 1",
            aspects = Map("aspectB" -> JsObject("b" -> JsNumber(1)))
          ),
          Record(
            "test2",
            "test record 2",
            aspects = Map("aspectA" -> JsObject("a" -> JsNumber(1)))
          ),
          Record(
            "test3",
            "test record 3",
            aspects = Map("aspectA" -> JsObject("a" -> JsNumber(6)))
          )
        ),
        expression = ConciseExpression(
          negated = false,
          operator = Some("="),
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.record.name")
            ),
            ConciseOperand(isRef = false, value = JsString("test record 1"))
          )
        ),
        checkFunc = (param, isNegatedTest) => {
          status shouldBe StatusCodes.OK
          val count = responseAs[CountResponse].count
          if (isNegatedTest) {
            count shouldBe 2
          } else {
            count shouldBe 1
          }
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        }
      )

      testRecordQuery(
        "should filter aspect correctly according to auth decision contains AspectQueryArrayNotEmpty",
        Get("/v0/records/count"),
        testRecords = List(
          Record(
            "test1",
            "test record 1",
            aspects = Map("aspectA" -> JsObject("a" -> JsArray())),
            None
          ),
          Record(
            "test2",
            "test record 2",
            aspects = Map("aspectA" -> JsObject("a" -> JsArray(JsNumber(1)))),
            None
          ),
          Record(
            "test3",
            "test record 3",
            aspects = Map("aspectA" -> JsObject("a" -> JsArray(JsNumber(1)))),
            None
          )
        ),
        expression = ConciseExpression(
          negated = false,
          operator = None,
          operands = Vector(
            ConciseOperand(
              isRef = true,
              value = JsString("input.object.record.aspectA.a[_]")
            )
          )
        ),
        checkFunc = (param, isNegatedTest) => {
          status shouldBe StatusCodes.OK
          val count = responseAs[CountResponse].count
          if (isNegatedTest) {
            count shouldBe 1
          } else {
            count shouldBe 2
          }
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        }
      )

      endpointStandardAuthTestCase(
        Get(s"/v0/records/count"),
        List("object/record/read"),
        hasPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          val count = responseAs[CountResponse].count
          count shouldBe 1
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        },
        noPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          val count = responseAs[CountResponse].count
          count shouldBe 0
          param.authFetcher
            .callTimesByOperationUri("object/record/read") shouldBe 1
        },
        beforeRequest = param => {
          // create record
          param.authFetcher.setAuthDecision(
            "object/record/create",
            UnconditionalTrueDecision
          )
          Post(
            "/v0/records",
            Record("testId", "testName", Map(), Some("blah"))
          ) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          param.authFetcher.resetMock()
        }
      )

    }

    describe(
      "Create record API {post} /v0/registry/records:"
    ) {
      endpointStandardAuthTestCase(
        Post("/v0/records", Record("testId", "testName", Map(), Some("blah"))),
        List("object/record/create"),
        hasPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          val record = responseAs[Record]
          param.authFetcher
            .callTimesByOperationUri("object/record/create") shouldBe 1
        },
        noPermissionCheck = param => {
          status shouldEqual StatusCodes.Forbidden
          param.authFetcher
            .callTimesByOperationUri("object/record/create") shouldBe 1
        },
        requireUserId = true
      )
    }

    describe("Modify endpoint {put} /v0/registry/records/{id}: ") {

      describe("When there is an existing record:") {

        val record = Record(
          "testId",
          "testName",
          Map("test" -> JsObject("field1" -> JsString("value1"))),
          Some("blah")
        )

        endpointStandardAuthTestCase(
          Put(
            s"/v0/records/testId",
            record.copy(
              name = "testName modified",
              // modify `test` aspect to replace all existing aspect data and add `field2`
              aspects = Map("test" -> JsObject("field2" -> JsString("value2")))
            )
          ),
          List("object/record/update"),
          hasPermissionCheck = param => {
            status shouldEqual StatusCodes.OK
            responseAs[Record].id shouldEqual record.id

            // endpoint will query policy engine re: "object/records/update" twice
            // as we want to make sure the user has access to both before-update & after-update record
            param.authFetcher
              .callTimesByOperationUri("object/record/update") shouldBe 2

            val updateAuthCallLogs = param.authFetcher
              .getAuthCallLogsByOperationUri("object/record/update")
            val firstCallInput = updateAuthCallLogs(0)._3.get.asJsObject
            val secondCallInput = updateAuthCallLogs(1)._3.get.asJsObject

            // this is the record in "after update" context data
            // we try to make sure the user has access to the data before & after the updates
            val recordInFirstCallContextData = firstCallInput.fields
              .get("object")
              .get
              .asJsObject
              .fields
              .get("record")
              .get
              .asJsObject

            // as it's replace operation, the after update aspect should contain `field2` only
            recordInFirstCallContextData.fields
              .get("name")
              .get shouldEqual JsString("testName modified")
            recordInFirstCallContextData.fields
              .get("test")
              .get shouldEqual JsObject(
              "field2" -> JsString("value2")
            )

            // this is the record in "before update" context data
            // we try to make sure the user has access to the data before & after the updates
            val recordInSecondCallContextData = secondCallInput.fields
              .get("object")
              .get
              .asJsObject
              .fields
              .get("record")
              .get
              .asJsObject

            recordInSecondCallContextData.fields
              .get("name")
              .get shouldEqual JsString("testName")
            recordInSecondCallContextData.fields
              .get("test")
              .get shouldEqual JsObject("field1" -> JsString("value1"))

            param.authFetcher.setAuthDecision(
              "object/record/read",
              UnconditionalTrueDecision
            )

            Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(
              TENANT_1
            ) ~> param
              .api(Full)
              .routes ~> check {
              status shouldEqual StatusCodes.OK
              val record = responseAs[Record]
              record.name shouldEqual "testName modified"
              record.aspects.get("test").get shouldEqual JsObject(
                "field2" -> JsString("value2")
              )
            }

            param.authFetcher
              .callTimesByOperationUri("object/record/read") shouldBe 1
          },
          noPermissionCheck = param => {
            status shouldEqual StatusCodes.Forbidden
            param.authFetcher
              .callTimesByOperationUri("object/record/update") shouldBe 1
          },
          beforeRequest = param => {
            // create test aspect
            val aspectDefinition = AspectDefinition("test", "test", None)
            param.authFetcher.setAuthDecision(
              "object/aspect/create",
              UnconditionalTrueDecision
            )
            Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }
            // create record before modify it
            param.authFetcher.setAuthDecision(
              "object/record/create",
              UnconditionalTrueDecision
            )
            Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }
            param.authFetcher.resetMock()
          },
          requireUserId = true
        )

      }

      describe("When there is an existing record & `merge` = true:") {

        val record = Record(
          "testId",
          "testName",
          Map("test" -> JsObject("field1" -> JsString("value1"))),
          Some("blah")
        )

        endpointStandardAuthTestCase(
          Put(
            s"/v0/records/testId?merge=true",
            record.copy(
              name = "testName modified",
              // modify `test` aspect to add `field2` without touching `field1`
              aspects = Map("test" -> JsObject("field2" -> JsString("value2")))
            )
          ),
          List("object/record/update"),
          hasPermissionCheck = param => {
            status shouldEqual StatusCodes.OK
            responseAs[Record].id shouldEqual record.id

            // endpoint will query policy engine re: "object/records/update" twice
            // as we want to make sure the user has access to both before-update & after-update record
            param.authFetcher
              .callTimesByOperationUri("object/record/update") shouldBe 2

            val updateAuthCallLogs = param.authFetcher
              .getAuthCallLogsByOperationUri("object/record/update")
            val firstCallInput = updateAuthCallLogs(0)._3.get.asJsObject
            val secondCallInput = updateAuthCallLogs(1)._3.get.asJsObject

            // this is the record in "after update" context data
            // we try to make sure the user has access to the data before & after the updates
            val recordInFirstCallContextData = firstCallInput.fields
              .get("object")
              .get
              .asJsObject
              .fields
              .get("record")
              .get
              .asJsObject

            recordInFirstCallContextData.fields
              .get("name")
              .get shouldEqual JsString("testName modified")
            recordInFirstCallContextData.fields
              .get("test")
              .get shouldEqual JsObject(
              "field1" -> JsString("value1"),
              "field2" -> JsString("value2")
            )

            // this is the record in "before update" context data
            // we try to make sure the user has access to the data before & after the updates
            val recordInSecondCallContextData = secondCallInput.fields
              .get("object")
              .get
              .asJsObject
              .fields
              .get("record")
              .get
              .asJsObject

            recordInSecondCallContextData.fields
              .get("name")
              .get shouldEqual JsString("testName")
            recordInSecondCallContextData.fields
              .get("test")
              .get shouldEqual JsObject("field1" -> JsString("value1"))

            param.authFetcher.setAuthDecision(
              "object/record/read",
              UnconditionalTrueDecision
            )

            Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(
              TENANT_1
            ) ~> param
              .api(Full)
              .routes ~> check {
              status shouldEqual StatusCodes.OK
              val record = responseAs[Record]
              record.name shouldEqual "testName modified"
              record.aspects.get("test").get shouldEqual JsObject(
                "field1" -> JsString("value1"),
                "field2" -> JsString("value2")
              )
            }

            param.authFetcher
              .callTimesByOperationUri("object/record/read") shouldBe 1
          },
          noPermissionCheck = param => {
            status shouldEqual StatusCodes.Forbidden
            param.authFetcher
              .callTimesByOperationUri("object/record/update") shouldBe 1
          },
          beforeRequest = param => {
            // create test aspect
            val aspectDefinition = AspectDefinition("test", "test", None)
            param.authFetcher.setAuthDecision(
              "object/aspect/create",
              UnconditionalTrueDecision
            )
            Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }
            // create record before modify it
            param.authFetcher.setAuthDecision(
              "object/record/create",
              UnconditionalTrueDecision
            )
            Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }
            param.authFetcher.resetMock()
          },
          requireUserId = true
        )

      }

      describe("When the record doesn't exist:") {

        val record = Record("testId", "testName", Map(), Some("blah"))

        endpointStandardAuthTestCase(
          Put(s"/v0/records/testId", record.copy(name = "testName modified")),
          List("object/record/create"),
          hasPermissionCheck = param => {
            status shouldEqual StatusCodes.OK
            responseAs[Record].id shouldEqual record.id

            // as the record doesn't existing, the endpoint actually performed a "create" operation
            // thus, the endpoint should ask an auth decision for "object/record/create" instead
            param.authFetcher
              .callTimesByOperationUri("object/record/create") shouldBe 1
          },
          noPermissionCheck = param => {
            status shouldEqual StatusCodes.Forbidden
            param.authFetcher
              .callTimesByOperationUri("object/record/create") shouldBe 1
          },
          requireUserId = true
        )

      }

    }

    describe("Patch API {patch} /v0/registry/record/{id}") {

      endpointStandardAuthTestCase(
        Patch(
          "/v0/records/testId",
          JsonPatch(Replace(Pointer.root / "name", JsString("foo")))
        ),
        List("object/record/update"),
        hasPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          responseAs[Record].name shouldEqual "foo"
          // check whether user has both before & after update record access
          param.authFetcher
            .callTimesByOperationUri("object/record/update") shouldBe 2
        },
        noPermissionCheck = param => {
          status shouldEqual StatusCodes.Forbidden
          param.authFetcher
            .callTimesByOperationUri("object/record/update") shouldBe 1
        },
        beforeRequest = param => {
          param.authFetcher.setAuthDecision(
            "object/record/create",
            UnconditionalTrueDecision
          )
          Post(
            "/v0/records",
            Record("testId", "testName", Map(), Some("blah"))
          ) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          param.authFetcher.resetMock()
        },
        requireUserId = true
      )

      it(
        "should response BadRequest 400 error when record not exist as can't construct context data"
      ) { param =>
        param.authFetcher.setAuthDecision(
          "object/record/update",
          UnconditionalTrueDecision
        )
        param.authFetcher.setAuthDecision(
          "object/record/create",
          UnconditionalTrueDecision
        )
        Patch(
          "/v0/records/testId",
          JsonPatch(Replace(Pointer.root / "name", JsString("foo")))
        ) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          responseAs[String] should include(
            "Cannot locate request record by id"
          )
        }
      }

    }

    describe("Delete endpoint {delete} /v0/registry/records/{id}: ") {

      describe("When there is an existing record:") {

        endpointStandardAuthTestCase(
          Delete(s"/v0/records/testId"),
          List("object/record/delete"),
          hasPermissionCheck = param => {
            status shouldEqual StatusCodes.OK
            responseAs[DeleteResult].deleted shouldBe true

            param.authFetcher
              .callTimesByOperationUri("object/record/delete") shouldBe 1
          },
          noPermissionCheck = param => {
            status shouldEqual StatusCodes.Forbidden
            param.authFetcher
              .callTimesByOperationUri("object/record/delete") shouldBe 1
          },
          beforeRequest = param => {
            // create record before modify it
            param.authFetcher.setAuthDecision(
              "object/record/create",
              UnconditionalTrueDecision
            )
            Post(
              "/v0/records",
              Record("testId", "testName", Map(), Some("blah"))
            ) ~> addUserId() ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }
            param.authFetcher.resetMock()
          },
          requireUserId = true
        )

      }

      describe("When the record doesn't exist:") {

        endpointStandardAuthTestCase(
          Delete(s"/v0/records/testId"),
          List("object/record/delete"),
          hasPermissionCheck = param => {
            status shouldEqual StatusCodes.OK
            responseAs[DeleteResult].deleted shouldBe false
            param.authFetcher
              .callTimesByOperationUri("object/record/delete") shouldBe 1
          },
          noPermissionCheck = param => {
            status shouldEqual StatusCodes.Forbidden
            param.authFetcher
              .callTimesByOperationUri("object/record/delete") shouldBe 1
          },
          requireUserId = true
        )

        it(
          "should response 403 when a user who doesn't have unconditional delete permission"
        ) { param =>
          // `FALSE` / denied permission
          param.authFetcher.setAuthDecision(
            "object/record/delete",
            UnconditionalFalseDecision
          )
          Delete(s"/v0/records/testId") ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.Forbidden
          }
        }

      }

    }

    describe("trimBySourceTag {delete} /v0/registry/records: ") {

      endpointStandardAuthTestCase(
        Delete("/v0/records?sourceId=source1&sourceTagToPreserve=sourceTag1"),
        List("object/record/delete"),
        hasPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          responseAs[MultipleDeleteResult].count shouldBe 1
          param.authFetcher
            .callTimesByOperationUri("object/record/delete") shouldBe 1
        },
        noPermissionCheck = param => {
          status shouldEqual StatusCodes.Forbidden
          param.authFetcher
            .callTimesByOperationUri("object/record/delete") shouldBe 1
        },
        beforeRequest = param => {
          // create `source` aspect
          param.authFetcher.setAuthDecision(
            "object/aspect/create",
            UnconditionalTrueDecision
          )

          Post("/v0/aspects", AspectDefinition("source", "source", None)) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          // create records
          param.authFetcher.setAuthDecision(
            "object/record/create",
            UnconditionalTrueDecision
          )
          // this record will be kept as it's not from source1 (no source aspect)
          Post(
            "/v0/records",
            Record(
              "testId1",
              "testName",
              Map(),
              sourceTag = Some("sourceTag1")
            )
          ) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          // this record will be kept.
          // although it's from source 1, it has the same sourceTag `source1`
          Post(
            "/v0/records",
            Record(
              "testId2",
              "testName",
              Map("source" -> JsObject("id" -> JsString("source1"))),
              Some("blah")
            )
          ) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            withClue(responseAs[String]) {
              status shouldEqual StatusCodes.OK
            }
          }
          // this record will be removed as:
          // - it has a different source tag
          // - it's from same source1
          Post(
            "/v0/records",
            Record(
              "testId3",
              "testName",
              Map("source" -> JsObject("id" -> JsString("source0"))),
              Some("blah")
            )
          ) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          param.authFetcher.resetMock()
        },
        requireUserId = true
      )

      it("should response 403 when a user has conditional delete permission") {
        param =>
          param.authFetcher.setAuthDecision(
            "object/record/delete",
            AuthDecision(
              hasResidualRules = true,
              result = None,
              residualRules = Some(
                List(
                  ConciseRule(
                    value = JsTrue,
                    fullName = "rule",
                    name = "rule",
                    expressions = List(
                      ConciseExpression(
                        negated = false,
                        Some("="),
                        operands = Vector(
                          ConciseOperand(
                            isRef = true,
                            value =
                              JsString("object.record.accessControl.ownerId")
                          ),
                          ConciseOperand(
                            isRef = false,
                            value = JsString(USER_ID)
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          )

          Delete("/v0/records?sourceId=source1&sourceTagToPreserve=sourceTag1") ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.Forbidden
          }
      }
    }

  }
}
