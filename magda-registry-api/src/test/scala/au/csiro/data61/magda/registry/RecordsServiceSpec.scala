package au.csiro.data61.magda.registry

import java.net.URLEncoder
import akka.event.LoggingAdapter
import akka.http.scaladsl.model.StatusCodes
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.model.TenantId._
import gnieh.diffson._
import gnieh.diffson.sprayJson._
import scalikejdbc.DBSession
import spray.json._
import au.csiro.data61.magda.util.StringUtils.ExtraStringHelperFunctions

import scala.util.Success

/**
  * This is functional test case suit. the auth is turned off in config in ApiSpec (i.e. all requested will be authorised)
  * to minimise the code. Auth related logic will be moved to a separate test case suit (with auth turned on).
  */
class RecordsServiceSpec extends ApiSpec {
  describe("with role Full") {
    readOnlyTests(Full)
    writeTests(Full)
  }

  describe("with role ReadOnly") {
    readOnlyTests(ReadOnly)
  }

  routesShouldBeNonExistentWithRole(
    ReadOnly,
    List(
      ("POST", Post.apply, "/v0/records"),
      ("PUT", Put.apply, "/v0/records/1"),
      ("PATCH", Patch.apply, "/v0/records/1"),
      ("DELETE", Delete.apply, "/v0/records"),
      ("DELETE", Delete.apply, "/v0/records/1"),
      ("POST", Post.apply, "/v0/records/aspects"),
      ("PUT", Put.apply, "/v0/records/1/aspects/1"),
      ("PATCH", Patch.apply, "/v0/records/1/aspects/1"),
      ("DELETE", Delete.apply, "/v0/records/1/aspects/1")
    )
  )

  def insertAspectDef(
      aspectId: String,
      tenantId: BigInt = TENANT_1
  )(implicit param: FixtureParam) {
    Post("/v0/aspects", AspectDefinition(aspectId, aspectId, None)) ~> addUserId() ~> addTenantIdHeader(
      tenantId
    ) ~> param.api(Full).routes ~> check {
      status shouldEqual StatusCodes.OK
    }
  }

  def createRecord(
      record: Record,
      tenantId: BigInt = TENANT_1
  )(implicit param: FixtureParam) {
    Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
      tenantId
    ) ~> param.api(Full).routes ~> check {
      status shouldEqual StatusCodes.OK
    }
  }

  def readOnlyTests(role: Role) {
    describe("GET") {

      describe("full text search") {

        def testFullTextSearch(
            searchText: String,
            expectedRecordIds: List[String],
            tenantId: BigInt = TENANT_1
        )(implicit param: FixtureParam): Unit = {
          val searchTextQueryStr = searchText.toQueryStringVal
          Get(s"/v0/records?q=${searchTextQueryStr}") ~> addTenantIdHeader(
            tenantId
          ) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val resData = responseAs[RecordsPage[Record]]
            resData.records.length shouldBe expectedRecordIds.length
            resData.records.map(_.id) should contain theSameElementsAs expectedRecordIds
          }

          Get(s"/v0/records/count?q=${searchTextQueryStr}") ~> addTenantIdHeader(
            tenantId
          ) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val resData = responseAs[RegistryCountResponse]
            resData.count shouldBe expectedRecordIds.length
          }

          Get(s"/v0/records/summary?q=${searchTextQueryStr}") ~> addTenantIdHeader(
            tenantId
          ) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val resData = responseAs[RecordsPage[RecordSummary]]
            resData.records.length shouldBe expectedRecordIds.length
            resData.records.map(_.id) should contain theSameElementsAs expectedRecordIds
          }
        }

        it("should find records by keywords in aspect data") { implicit param =>
          val aspectId1 = "test-aspect-1"
          val aspectId2 = "test-aspect-2"
          val aspectId3 = "test-aspect-3"

          val recordId1 = "test-record-1"
          val recordId2 = "test-record-2"
          val recordId3 = "test-record-3"

          insertAspectDef(aspectId1)
          insertAspectDef(aspectId2)
          insertAspectDef(aspectId3)

          createRecord(
            Record(
              recordId1,
              recordId1,
              Map(
                aspectId1 -> JsObject(
                  "keyword1" -> JsObject(
                    "keyword2" -> JsString("this is keyword3 bla")
                  )
                ),
                aspectId2 -> JsObject(
                  "keyword2" -> JsString("this is keyword1 xxx bla")
                )
              )
            )
          )

          createRecord(
            Record(
              recordId2,
              recordId2,
              Map(
                aspectId2 -> JsObject(
                  "keyword3" -> JsString("this is keyword1 bla")
                ),
                aspectId3 -> JsObject(
                  "keyword3" -> JsObject(
                    "keyword1" -> JsString("this is keyword2 bla")
                  )
                )
              )
            )
          )

          createRecord(
            Record(
              recordId3,
              recordId3,
              Map(
                aspectId1 -> JsObject(),
                aspectId3 -> JsObject(
                  "xyz" -> JsString("we have both keyword2 & keyword3")
                )
              )
            )
          )
          // search keyword keyword3 should only get recordId1 & recordId3
          // please note: record2 is not in result event it has "keyword3" of one of object key
          testFullTextSearch("keyword3", List(recordId1, recordId3))

          testFullTextSearch("keyword1", List(recordId1, recordId2))

          testFullTextSearch("keyword2", List(recordId2, recordId3))

          //should find record contains both keyword2 and keyword3
          testFullTextSearch("keyword2 keyword3", List(recordId3))

          //should find record contains phrase "keyword1 bla"
          // only recordId2 will match it
          // record1 has "keyword1 xxx bla" doesn't match "keyword1 bla"
          testFullTextSearch("\"keyword1 bla\"", List(recordId2))

          // without double quote, "keyword1 bla" will search records contains both "keyword1" & "bla"
          testFullTextSearch("keyword1 bla", List(recordId1, recordId2))

          // can search by record Id
          testFullTextSearch(recordId1, List(recordId1))
          testFullTextSearch(recordId2, List(recordId2))
          testFullTextSearch(recordId3, List(recordId3))

          // can search by aspectId
          testFullTextSearch(aspectId1, List(recordId1, recordId3))
          testFullTextSearch(aspectId2, List(recordId1, recordId2))
          testFullTextSearch(aspectId3, List(recordId2, recordId3))
        }
      }

      it("starts with no records defined") { param =>
        val recordId = "foo"
        val record = Record(recordId, "foo", Map(), Some("blah"))
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Get("/v0/records") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[RecordsPage[Record]].records.length shouldBe 1
        }

        Get("/v0/records") ~> addTenantIdHeader(TENANT_2) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[RecordsPage[Record]].records shouldBe empty
        }

        Get("/v0/records") ~> addSystemTenantHeader ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[RecordsPage[Record]].records.length shouldBe 1
        }
      }

      it("returns 404 if the given ID does not exist") { param =>
        val recordId = "foo"
        val record = Record(recordId, "foo", Map(), Some("blah"))
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Get(s"/v0/records/$recordId") ~> addTenantIdHeader(TENANT_2) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.NotFound
          responseAs[ApiError].message should include("exist")
        }
      }

      it("returns 404 if the given ID does not have a required aspect") {
        param =>
          val aspectId = "test"
          val aspectDefinition = AspectDefinition(aspectId, "test", None)
          Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordId = "foo"
          val record = Record(recordId, "foo", Map(), Some("blah"))
          Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post(
            "/v0/records",
            record.copy(aspects = Map(aspectId -> JsObject()))
          ) ~> addUserId() ~> addTenantIdHeader(TENANT_2) ~> param
            .api(Full)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get(s"/v0/records/$recordId?aspect=$aspectId") ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get(s"/v0/records/$recordId?aspect=$aspectId") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.NotFound
            responseAs[ApiError].message should include("exist")
          }
      }

      it("returns all records when tenant id is -1") { param =>
        for (i <- 1 to 5) {
          val testAspectId = "test"
          val testAspect = AspectDefinition(testAspectId, "test", None)

          Post("/v0/aspects", testAspect) ~> addUserId() ~> addTenantIdHeader(
            i
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val record = Record(
            i.toString,
            i.toString,
            Map(testAspectId -> JsObject("value" -> JsNumber(i))),
            Some("blah")
          )

          Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(i) ~> param
            .api(Full)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
          }
        }

        Get(s"/v0/records") ~> addTenantIdHeader(MAGDA_SYSTEM_ID) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          val page = responseAs[RecordsPage[RecordType]]
          val records = page.records
          records.length shouldBe 5

          records.map(_.id) shouldEqual (List(1, 2, 3, 4, 5).map(_.toString))
        }
      }

      describe("summary") {
        val aspectId1 = "test1"
        val aspectId2 = "test2"
        val aspectId3 = "test3"

        def insertAspectDefs(param: FixtureParam, tenantId: BigInt) {
          val aspectDefinition1 = AspectDefinition(aspectId1, "test1", None)
          Post("/v0/aspects", aspectDefinition1) ~> addUserId() ~> addTenantIdHeader(
            tenantId
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          val aspectDefinition2 = AspectDefinition(aspectId2, "test2", None)
          Post("/v0/aspects", aspectDefinition2) ~> addUserId() ~> addTenantIdHeader(
            tenantId
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          val aspectDefinition3 = AspectDefinition(aspectId3, "test3", None)
          Post("/v0/aspects", aspectDefinition3) ~> addUserId() ~> addTenantIdHeader(
            tenantId
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
        }

        it(
          "/records/summary/{id} returns a summary with id, name, and aspect ids for which the record has data in the aspect"
        ) { param =>
          insertAspectDefs(param, TENANT_1)
          insertAspectDefs(param, TENANT_2)

          val recordId = "id"
          val recordName = "name"
          val recordWithAspects = Record(
            recordId,
            recordName,
            Map(aspectId1 -> JsObject(), aspectId2 -> JsObject()),
            Some("blah")
          )
          Post("/v0/records", recordWithAspects) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Post("/v0/records", recordWithAspects) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get(s"/v0/records/summary/$recordId") ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val recordSummary = responseAs[RecordSummary]
            recordSummary.id shouldEqual recordId
            recordSummary.tenantId shouldEqual Some(TENANT_1)
            recordSummary.name shouldEqual recordName
            recordSummary.aspects shouldEqual List(aspectId1, aspectId2)
          }
        }

        it(
          "/records/summary returns a list of summaries with id, name, and aspect ids for which the record has data in the aspect"
        ) { param =>
          insertAspectDefs(param, TENANT_1)
          insertAspectDefs(param, TENANT_2)

          val recordId1 = "id1"
          val recordName1 = "name1"
          val recordWithAspects1 = Record(
            recordId1,
            recordName1,
            Map(aspectId1 -> JsObject(), aspectId2 -> JsObject()),
            Some("blah")
          )
          Post("/v0/records", recordWithAspects1) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Post("/v0/records", recordWithAspects1) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordId2 = "id2"
          val recordName2 = "name2"
          val recordWithAspects2 = Record(
            recordId2,
            recordName2,
            Map(aspectId1 -> JsObject(), aspectId3 -> JsObject()),
            Some("blah")
          )
          Post("/v0/records", recordWithAspects2) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Post("/v0/records", recordWithAspects2) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordId3 = "id3"
          val recordName3 = "name3"
          val recordWithoutAspects3 =
            Record(recordId3, recordName3, Map(), Some("blah"))
          Post("/v0/records", recordWithoutAspects3) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Post("/v0/records", recordWithoutAspects3) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get("/v0/records/summary") ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val recordsSummary = responseAs[RecordsPage[RecordSummary]]
            recordsSummary.records.length shouldEqual 3

            recordsSummary.records.head.id shouldEqual recordId1
            recordsSummary.records.head.tenantId shouldEqual Some(TENANT_1)
            recordsSummary.records.head.name shouldEqual recordName1
            recordsSummary.records.head.aspects shouldEqual List(
              aspectId1,
              aspectId2
            )

            recordsSummary.records(1).id shouldEqual recordId2
            recordsSummary.records(1).tenantId shouldEqual Some(TENANT_1)
            recordsSummary.records(1).name shouldEqual recordName2
            recordsSummary.records(1).aspects shouldEqual List(
              aspectId1,
              aspectId3
            )

            recordsSummary.records(2).id shouldEqual recordId3
            recordsSummary.records(2).tenantId shouldEqual Some(TENANT_1)
            recordsSummary.records(2).name shouldEqual recordName3
            recordsSummary.records(2).aspects shouldEqual List()
          }

          Get("/v0/records/summary") ~> addTenantIdHeader(TENANT_2) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val recordsSummary = responseAs[RecordsPage[RecordSummary]]
            recordsSummary.records.length shouldEqual 3

            recordsSummary.records.head.id shouldEqual recordId1
            recordsSummary.records.head.tenantId shouldEqual Some(TENANT_2)
            recordsSummary.records.head.name shouldEqual recordName1
            recordsSummary.records.head.aspects shouldEqual List(
              aspectId1,
              aspectId2
            )

            recordsSummary.records(1).id shouldEqual recordId2
            recordsSummary.records(1).tenantId shouldEqual Some(TENANT_2)
            recordsSummary.records(1).name shouldEqual recordName2
            recordsSummary.records(1).aspects shouldEqual List(
              aspectId1,
              aspectId3
            )

            recordsSummary.records(2).id shouldEqual recordId3
            recordsSummary.records(2).tenantId shouldEqual Some(TENANT_2)
            recordsSummary.records(2).name shouldEqual recordName3
            recordsSummary.records(2).aspects shouldEqual List()
          }

          Get("/v0/records/summary") ~> addSystemTenantHeader ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val recordsSummary = responseAs[RecordsPage[RecordSummary]]
            recordsSummary.records.length shouldEqual 6
          }
        }
      }

      describe("count") {
        it("returns the right count when no parameters are given") { param =>
          // Create some records for tenant 1.
          for (i <- 1 to 5) {
            val recordWithoutAspects =
              Record("id" + i, "name" + i, Map(), Some("blah"))
            Post("/v0/records", recordWithoutAspects) ~> addUserId() ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }
          }

          // Tenant 2 should not count records of tenant 1.
          Get("/v0/records/count") ~> addTenantIdHeader(TENANT_2) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 0
          }

          // Create some records for tenant 2.
          for (i <- 1 to 3) {
            val recordWithoutAspects =
              Record("id" + i, "name" + i, Map(), Some("blah"))
            Post("/v0/records", recordWithoutAspects) ~> addUserId() ~> addTenantIdHeader(
              TENANT_2
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }
          }

          // Tenant 1 should count records of its own.
          Get("/v0/records/count") ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 5
          }

          // System tenant should count all records of all tenants.
          Get("/v0/records/count") ~> addSystemTenantHeader ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 5 + 3
          }
        }
      }

      describe("aspects") {
        val testAspectId = "test"
        val testAspect = AspectDefinition(testAspectId, "test", None)
        val withTestAspectRecordId = "with"
        val withTestAspectRecord = Record(
          withTestAspectRecordId,
          "with",
          Map(testAspectId -> JsObject("foo" -> JsString("bar"))),
          Some("blah")
        )
        val withoutTestAspectRecordId = "without"
        val withoutTestAspectRecord =
          Record(withoutTestAspectRecordId, "without", Map(), Some("blah"))

        val fooAspectId = "foo"
        val fooAspect = AspectDefinition(fooAspectId, "foo", None)
        val barAspectId = "bar"
        val barAspect = AspectDefinition(barAspectId, "bar", None)
        val bazAspectId = "baz"
        val bazAspect = AspectDefinition(bazAspectId, "baz", None)
        val withFooRecordId = "withFoo"
        val withFooRecord = Record(
          withFooRecordId,
          "with foo",
          Map(fooAspectId -> JsObject("test" -> JsString("test"))),
          Some("blah")
        )
        val withBarRecordId = "withBar"
        val withBarRecord = Record(
          withBarRecordId,
          "with bar",
          Map(barAspectId -> JsObject("test" -> JsString("test"))),
          Some("blah")
        )
        val withFooAndBarRecordId = "withFooAndBar"
        val withFooAndBarRecord = Record(
          withFooAndBarRecordId,
          "with foo and bar",
          Map(
            fooAspectId -> JsObject(),
            barAspectId -> JsObject("test" -> JsString("test"))
          ),
          Some("blah")
        )
        val withNoneRecordId = "withNone"
        val withNoneRecord =
          Record(withNoneRecordId, "with none", Map(), Some("blah"))

        it("includes optionalAspect if it exists") { param =>
          Post("/v0/aspects", testAspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withTestAspectRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withoutTestAspectRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get(s"/v0/records?optionalAspect=$testAspectId") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 2
            page.records.head shouldBe withTestAspectRecord.copy(
              tenantId = Some(TENANT_1)
            )
            page.records(1) shouldBe withoutTestAspectRecord.copy(
              tenantId = Some(TENANT_1)
            )
          }

          Get(s"/v0/records?optionalAspect=$testAspectId") ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 0
          }
        }

        it("requires presence of aspect") { param =>
          Post("/v0/aspects", testAspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withTestAspectRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withoutTestAspectRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get(s"/v0/records?aspect=$testAspectId") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 1
            page.records.head shouldBe withTestAspectRecord.copy(
              tenantId = Some(TENANT_1)
            )
          }

          Get(s"/v0/records/count?aspect=$testAspectId") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 1
          }

          Get(s"/v0/records?aspect=$testAspectId") ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 0
          }

          Get(s"/v0/records/count?aspect=$testAspectId") ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 0
          }

          Get(s"/v0/records/count?aspect=$testAspectId") ~> addSystemTenantHeader ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 1
          }
        }

        it("requires any specified aspects to be present") { param =>
          Post("/v0/aspects", fooAspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/aspects", barAspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withFooRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withBarRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withFooAndBarRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get(s"/v0/records?aspect=$fooAspectId&aspect=$barAspectId") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 1
            page.records.head shouldBe withFooAndBarRecord.copy(
              tenantId = Some(TENANT_1)
            )
          }

          Get(s"/v0/records/count?aspect=$fooAspectId&aspect=$barAspectId") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 1
          }

          Get(s"/v0/records?aspect=$fooAspectId&aspect=$barAspectId") ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 0
          }

          Get(s"/v0/records/count?aspect=$fooAspectId&aspect=$barAspectId") ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 0
          }
        }

        it("optionalAspects are optional") { param =>
          Post("/v0/aspects", fooAspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/aspects", barAspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withFooRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withBarRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withFooAndBarRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withNoneRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get(
            s"/v0/records?optionalAspect=$fooAspectId&optionalAspect=$barAspectId"
          ) ~> addTenantIdHeader(TENANT_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 4
            page.records.head shouldBe withFooRecord.copy(
              tenantId = Some(TENANT_1)
            )
            page.records(1) shouldBe withBarRecord.copy(
              tenantId = Some(TENANT_1)
            )
            page.records(2) shouldBe withFooAndBarRecord.copy(
              tenantId = Some(TENANT_1)
            )
            page.records(3) shouldBe withNoneRecord.copy(
              tenantId = Some(TENANT_1)
            )
          }

          Get(
            s"/v0/records?optionalAspect=$fooAspectId&optionalAspect=$barAspectId"
          ) ~> addTenantIdHeader(TENANT_2) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 0
          }
        }

        it("supports a mix of aspects and optionalAspects") { param =>
          Post("/v0/aspects", fooAspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/aspects", barAspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/aspects", bazAspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withFooRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withBarRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val withFooAndBarAndBaz = Record(
            "withFooAndBarAndBaz",
            "with foo and bar",
            Map(
              "foo" -> JsObject(),
              "bar" -> JsObject("test" -> JsString("test")),
              "baz" -> JsObject()
            ),
            Some("blah")
          )
          Post("/v0/records", withFooAndBarAndBaz) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withNoneRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get(s"/v0/records?aspect=$fooAspectId&optionalAspect=$barAspectId") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 2
            page.records.head shouldBe withFooRecord.copy(
              tenantId = Some(TENANT_1)
            )

            // withFooAndBarAndBaz shouldn't include the baz aspect because it wasn't requested
            page.records(1) shouldBe withFooAndBarAndBaz.copy(
              aspects = withFooAndBarAndBaz.aspects - bazAspectId,
              tenantId = Some(TENANT_1)
            )
          }

          Get(s"/v0/records?aspect=$fooAspectId&optionalAspect=$barAspectId") ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 0
          }
        }

        it("accepts URL-encoded aspect names") { param =>
          val aspectWithSpaceId = "with space"
          val aspectWithSpace = AspectDefinition(aspectWithSpaceId, "foo", None)
          Post("/v0/aspects", aspectWithSpace) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordId = "whatever"
          val record = Record(
            recordId,
            "whatever",
            Map(aspectWithSpaceId -> JsObject("test" -> JsString("test"))),
            Some("blah")
          )
          Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val urlEncodedAspectWithSpaceId =
            java.net.URLEncoder.encode(aspectWithSpaceId, "UTF-8")
          Get(s"/v0/records?optionalAspect=$urlEncodedAspectWithSpaceId") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 1
            page.records.head shouldBe record.copy(tenantId = Some(TENANT_1))
          }

          Get(s"/v0/records?aspect=$urlEncodedAspectWithSpaceId") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 1
            page.records.head shouldBe record.copy(tenantId = Some(TENANT_1))
          }

          Get(s"/v0/records/count?aspect=$urlEncodedAspectWithSpaceId") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 1
          }

          Get(s"/v0/records?optionalAspect=$urlEncodedAspectWithSpaceId") ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 0
          }

          Get(s"/v0/records?aspect=$urlEncodedAspectWithSpaceId") ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 0
          }

          Get(s"/v0/records/count?aspect=$urlEncodedAspectWithSpaceId") ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 0
          }
        }

        it(
          "returns the specified aspect of the specified record of the specified tenant"
        ) { param =>
          Post("/v0/aspects", testAspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Post("/v0/aspects", testAspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val aspectValue1 = JsObject("foo 1" -> JsString("bar 1"))
          val withRecordId = "with"
          val recordWithAspect1 =
            Record(
              withRecordId,
              "with",
              Map(testAspectId -> aspectValue1),
              Some("blah")
            )
          Post("/v0/records", recordWithAspect1) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val aspectValue2 = JsObject("foo 2" -> JsString("bar 2"))
          val recordWithAspect2 =
            Record(
              withRecordId,
              "with",
              Map(testAspectId -> aspectValue2),
              Some("blah")
            )
          Post("/v0/records", recordWithAspect2) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get(s"/v0/records/$withRecordId/aspects/$testAspectId") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val actualAspectValue1 = responseAs[JsObject]
            actualAspectValue1 shouldBe aspectValue1
          }

          Get(s"/v0/records/$withRecordId/aspects/$testAspectId") ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val actualAspectValue2 = responseAs[JsObject]
            actualAspectValue2 shouldBe aspectValue2
          }
        }
      }

      describe("dereference") {
        val withLinksJsonSchema =
          """
            |{
            |    "$schema": "http://json-schema.org/hyper-schema#",
            |    "title": "An aspect with an array of links",
            |    "type": "object",
            |    "properties": {
            |        "someLinks": {
            |            "title": "Link to other records.",
            |            "type": "array",
            |            "items": {
            |                "title": "A link",
            |                "type": "string",
            |                "links": [
            |                    {
            |                        "href": "/api/v0/registry/records/{$}",
            |                        "rel": "item"
            |                    }
            |                ]
            |            }
            |        }
            |    }
            |}
          """.stripMargin

        val withLinksAspectId = "withLinks"
        val withLinksSourceRecordId = "source"
        val withLinksSourceRecordName = "source"
        val withLinksTargetRecordId = "target"
        val withLinksTargetRecordName = "target"
        val withLinksAnotherTargetRecordId = "anotherTarget"
        val withLinksAnotherTargetRecordName = "anotherTarget"
        val withLinksAspect = AspectDefinition(
          withLinksAspectId,
          "with links",
          Some(JsonParser(withLinksJsonSchema).asJsObject)
        )

        val withLinksSourceRecord = Record(
          withLinksSourceRecordId,
          withLinksSourceRecordName,
          Map(
            withLinksAspectId -> JsObject(
              "someLinks" -> JsArray(
                JsString(withLinksTargetRecordId),
                JsString(withLinksAnotherTargetRecordId)
              )
            )
          ),
          Some("blah")
        )
        val withLinksTargetRecord = Record(
          withLinksTargetRecordId,
          withLinksTargetRecordName,
          Map(
            withLinksAspectId -> JsObject(
              "someLinks" -> JsArray(JsString(withLinksSourceRecordId))
            )
          ),
          Some("blah")
        )
        val withLinksAnotherTargetRecord = Record(
          withLinksAnotherTargetRecordId,
          withLinksAnotherTargetRecordName,
          Map(
            withLinksAspectId -> JsObject(
              "someLinks" -> JsArray(JsString(withLinksSourceRecordId))
            )
          ),
          Some("blah")
        )
        val withEmptyLinksSourceRecord = Record(
          withLinksSourceRecordId,
          "source",
          Map(withLinksAspectId -> JsObject("someLinks" -> JsArray())),
          Some("blah")
        )

        it("dereferences a single link if requested") { param =>
          val jsonSchema =
            """
              |{
              |    "$schema": "http://json-schema.org/hyper-schema#",
              |    "title": "An aspect with a single link",
              |    "type": "object",
              |    "properties": {
              |        "someLink": {
              |            "title": "A link to another record.",
              |            "type": "string",
              |            "links": [
              |                {
              |                    "href": "/api/v0/registry/records/{$}",
              |                    "rel": "item"
              |                }
              |            ]
              |        }
              |    }
              |}
            """.stripMargin

          val withLinkAspectId = "withLink"
          val sourceRecordId = "source"
          val sourceRecordName = "source"
          val targetRecordId = "target"
          val targetRecordName = "target"

          val withLinkAspect = AspectDefinition(
            withLinkAspectId,
            "with link",
            Some(JsonParser(jsonSchema).asJsObject)
          )
          Post("/v0/aspects", withLinkAspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Post("/v0/aspects", withLinkAspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val sourceRecord = Record(
            sourceRecordId,
            sourceRecordName,
            Map(
              withLinkAspectId -> JsObject(
                "someLink" -> JsString(targetRecordId)
              )
            ),
            Some("blah")
          )
          Post("/v0/records", sourceRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Post("/v0/records", sourceRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val targetRecord = Record(
            targetRecordId,
            targetRecordName,
            Map(
              withLinkAspectId -> JsObject(
                "someLink" -> JsString(sourceRecordId)
              )
            ),
            Some("blah")
          )
          Post("/v0/records", targetRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Post("/v0/records", targetRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get(s"/v0/records/$sourceRecordId?aspect=$withLinkAspectId") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val theRecord = responseAs[Record]
            theRecord shouldBe sourceRecord.copy(
              tenantId = Some(TENANT_1),
              aspects = Map(
                withLinkAspectId -> JsObject(
                  "someLink" -> JsString(targetRecordId)
                )
              )
            )
          }

          Get(
            s"/v0/records/$sourceRecordId?aspect=$withLinkAspectId&dereference=false"
          ) ~> addTenantIdHeader(TENANT_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val theRecord = responseAs[Record]
            theRecord shouldBe sourceRecord.copy(
              tenantId = Some(TENANT_1),
              aspects = Map(
                withLinkAspectId -> JsObject(
                  "someLink" -> JsString(targetRecordId)
                )
              )
            )
          }

          Get(
            s"/v0/records/$sourceRecordId?optionalAspect=$withLinkAspectId&dereference=true"
          ) ~> addTenantIdHeader(TENANT_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val theRecord = responseAs[Record]
            theRecord shouldBe sourceRecord.copy(
              tenantId = Some(TENANT_1),
              aspects = Map(
                withLinkAspectId -> JsObject(
                  "someLink" -> JsObject(
                    "id" -> JsString(targetRecordId),
                    "name" -> JsString(targetRecordName),
                    "aspects" -> JsObject(
                      withLinkAspectId -> JsObject(
                        "someLink" -> JsString(sourceRecordId)
                      )
                    )
                  )
                )
              )
            )
          }

          Get(s"/v0/records?optionalAspect=$withLinkAspectId&dereference=true") ~> addSystemTenantHeader ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val theRecordPage: RecordsPage[Record] =
              responseAs[RecordsPage[Record]]
            val theRecords: List[Record] = theRecordPage.records
            theRecords.length shouldBe 4 // (1 source + 1 target) * 2 tenants.

            val expectedSourceRecord = sourceRecord.copy(
              aspects = Map(
                withLinkAspectId -> JsObject(
                  "someLink" -> JsObject(
                    "id" -> JsString(targetRecordId),
                    "name" -> JsString(targetRecordName),
                    "aspects" -> JsObject(
                      withLinkAspectId -> JsObject(
                        "someLink" -> JsString(sourceRecordId)
                      )
                    )
                  )
                )
              )
            )

            theRecords.head shouldBe expectedSourceRecord.copy(
              tenantId = Some(TENANT_1)
            )
            theRecords(1) shouldBe expectedSourceRecord.copy(
              tenantId = Some(TENANT_2)
            )

            val expectedTargetRecord = targetRecord.copy(
              aspects = Map(
                withLinkAspectId -> JsObject(
                  "someLink" -> JsObject(
                    "id" -> JsString(sourceRecordId),
                    "name" -> JsString(sourceRecordName),
                    "aspects" -> JsObject(
                      withLinkAspectId -> JsObject(
                        "someLink" -> JsString(targetRecordId)
                      )
                    )
                  )
                )
              )
            )

            theRecords(2) shouldBe expectedTargetRecord.copy(
              tenantId = Some(TENANT_1)
            )
            theRecords(3) shouldBe expectedTargetRecord.copy(
              tenantId = Some(TENANT_2)
            )
          }

          Get(s"/v0/records?aspect=$withLinkAspectId&dereference=true") ~> addSystemTenantHeader ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val theRecordPage: RecordsPage[Record] =
              responseAs[RecordsPage[Record]]
            val theRecords: List[Record] = theRecordPage.records
            theRecords.length shouldBe 4 // (1 source + 1 target) * 2 tenants.

            val expectedSourceRecord = sourceRecord.copy(
              aspects = Map(
                withLinkAspectId -> JsObject(
                  "someLink" -> JsObject(
                    "id" -> JsString(targetRecordId),
                    "name" -> JsString(targetRecordName),
                    "aspects" -> JsObject(
                      withLinkAspectId -> JsObject(
                        "someLink" -> JsString(sourceRecordId)
                      )
                    )
                  )
                )
              )
            )

            theRecords.head shouldBe expectedSourceRecord.copy(
              tenantId = Some(TENANT_1)
            )
            theRecords(1) shouldBe expectedSourceRecord.copy(
              tenantId = Some(TENANT_2)
            )

            val expectedTargetRecord = targetRecord.copy(
              aspects = Map(
                withLinkAspectId -> JsObject(
                  "someLink" -> JsObject(
                    "id" -> JsString(sourceRecordId),
                    "name" -> JsString(sourceRecordName),
                    "aspects" -> JsObject(
                      withLinkAspectId -> JsObject(
                        "someLink" -> JsString(targetRecordId)
                      )
                    )
                  )
                )
              )
            )

            theRecords(2) shouldBe expectedTargetRecord.copy(
              tenantId = Some(TENANT_1)
            )
            theRecords(3) shouldBe expectedTargetRecord.copy(
              tenantId = Some(TENANT_2)
            )
          }
        }

        it("dereferences an array of links if requested") { param =>
          Post("/v0/aspects", withLinksAspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Post("/v0/aspects", withLinksAspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withLinksSourceRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Post("/v0/records", withLinksSourceRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withLinksTargetRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Post("/v0/records", withLinksTargetRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withLinksAnotherTargetRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Post("/v0/records", withLinksAnotherTargetRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get(s"/v0/records/$withLinksSourceRecordId?aspect=$withLinksAspectId") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record] shouldBe withLinksSourceRecord.copy(
              tenantId = Some(TENANT_1),
              aspects = Map(
                withLinksAspectId -> JsObject(
                  "someLinks" -> JsArray(
                    JsString(withLinksTargetRecordId),
                    JsString(withLinksAnotherTargetRecordId)
                  )
                )
              )
            )
          }

          Get(
            s"/v0/records/$withLinksSourceRecordId?optionalAspect=$withLinksAspectId"
          ) ~> addTenantIdHeader(TENANT_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record] shouldBe withLinksSourceRecord.copy(
              tenantId = Some(TENANT_1),
              aspects = Map(
                withLinksAspectId -> JsObject(
                  "someLinks" -> JsArray(
                    JsString(withLinksTargetRecordId),
                    JsString(withLinksAnotherTargetRecordId)
                  )
                )
              )
            )
          }

          Get(
            s"/v0/records/$withLinksSourceRecordId?aspect=$withLinksAspectId&dereference=false"
          ) ~> addTenantIdHeader(TENANT_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record] shouldBe withLinksSourceRecord.copy(
              tenantId = Some(TENANT_1),
              aspects = Map(
                withLinksAspectId -> JsObject(
                  "someLinks" -> JsArray(
                    JsString(withLinksTargetRecordId),
                    JsString(withLinksAnotherTargetRecordId)
                  )
                )
              )
            )
          }

          Get(
            s"/v0/records/$withLinksSourceRecordId?optionalAspect=$withLinksAspectId&dereference=false"
          ) ~> addTenantIdHeader(TENANT_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record] shouldBe withLinksSourceRecord.copy(
              tenantId = Some(TENANT_1),
              aspects = Map(
                withLinksAspectId -> JsObject(
                  "someLinks" -> JsArray(
                    JsString(withLinksTargetRecordId),
                    JsString(withLinksAnotherTargetRecordId)
                  )
                )
              )
            )
          }

          Get(
            s"/v0/records/$withLinksSourceRecordId?aspect=$withLinksAspectId&dereference=true"
          ) ~> addTenantIdHeader(TENANT_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record] shouldBe withLinksSourceRecord.copy(
              tenantId = Some(TENANT_1),
              aspects = Map(
                withLinksAspectId -> JsObject(
                  "someLinks" -> JsArray(
                    JsObject(
                      "id" -> JsString(withLinksTargetRecordId),
                      "name" -> JsString(withLinksTargetRecordName),
                      "aspects" -> JsObject(
                        withLinksAspectId -> JsObject(
                          "someLinks" -> JsArray(
                            JsString(withLinksSourceRecordId)
                          )
                        )
                      )
                    ),
                    JsObject(
                      "id" -> JsString(withLinksAnotherTargetRecordId),
                      "name" -> JsString(withLinksAnotherTargetRecordName),
                      "aspects" -> JsObject(
                        withLinksAspectId -> JsObject(
                          "someLinks" -> JsArray(
                            JsString(withLinksSourceRecordId)
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          }

          Get(
            s"/v0/records/$withLinksSourceRecordId?optionalAspect=$withLinksAspectId&dereference=true"
          ) ~> addTenantIdHeader(TENANT_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record] shouldBe withLinksSourceRecord.copy(
              tenantId = Some(TENANT_1),
              aspects = Map(
                withLinksAspectId -> JsObject(
                  "someLinks" -> JsArray(
                    JsObject(
                      "id" -> JsString(withLinksTargetRecordId),
                      "name" -> JsString(withLinksTargetRecordName),
                      "aspects" -> JsObject(
                        withLinksAspectId -> JsObject(
                          "someLinks" -> JsArray(
                            JsString(withLinksSourceRecordId)
                          )
                        )
                      )
                    ),
                    JsObject(
                      "id" -> JsString(withLinksAnotherTargetRecordId),
                      "name" -> JsString(withLinksAnotherTargetRecordName),
                      "aspects" -> JsObject(
                        withLinksAspectId -> JsObject(
                          "someLinks" -> JsArray(
                            JsString(withLinksSourceRecordId)
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          }

          // An indexing crawler will act as a system tenant and make similar request like this.
          // There is no difference between using query parameter "aspect" and "optionalAspect" for dereferencing.
          Get(s"/v0/records?optionalAspect=$withLinksAspectId&dereference=true") ~> addSystemTenantHeader ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val theRecordsPage = responseAs[RecordsPage[Record]]
            val theRecords = theRecordsPage.records
            theRecords.length shouldBe 6 // (1 source + 1 target + 1 anotherTarget) * 2 tenants

            val expectedWithLinksSourceRecord = withLinksSourceRecord.copy(
              aspects = Map(
                withLinksAspectId -> JsObject(
                  "someLinks" -> JsArray(
                    JsObject(
                      "id" -> JsString(withLinksTargetRecordId),
                      "name" -> JsString(withLinksTargetRecordName),
                      "aspects" -> JsObject(
                        withLinksAspectId -> JsObject(
                          "someLinks" -> JsArray(
                            JsString(withLinksSourceRecordId)
                          )
                        )
                      )
                    ),
                    JsObject(
                      "id" -> JsString(withLinksAnotherTargetRecordId),
                      "name" -> JsString(withLinksAnotherTargetRecordName),
                      "aspects" -> JsObject(
                        withLinksAspectId -> JsObject(
                          "someLinks" -> JsArray(
                            JsString(withLinksSourceRecordId)
                          )
                        )
                      )
                    )
                  )
                )
              )
            )

            theRecords.head shouldBe expectedWithLinksSourceRecord.copy(
              tenantId = Some(TENANT_1)
            )
            theRecords(1) shouldBe expectedWithLinksSourceRecord.copy(
              tenantId = Some(TENANT_2)
            )

            val expectedWithLinksTargetRecord = withLinksTargetRecord.copy(
              aspects = Map(
                withLinksAspectId -> JsObject(
                  "someLinks" -> JsArray(
                    JsObject(
                      "id" -> JsString(withLinksSourceRecordId),
                      "name" -> JsString(withLinksSourceRecordName),
                      "aspects" -> JsObject(
                        withLinksAspectId -> JsObject(
                          "someLinks" -> JsArray(
                            JsString(withLinksTargetRecordId),
                            JsString(withLinksAnotherTargetRecordId)
                          )
                        )
                      )
                    )
                  )
                )
              )
            )

            theRecords(2) shouldBe expectedWithLinksTargetRecord.copy(
              tenantId = Some(TENANT_1)
            )
            theRecords(3) shouldBe expectedWithLinksTargetRecord.copy(
              tenantId = Some(TENANT_2)
            )

            val expectedWithLinksAnotherTargetRecord =
              withLinksAnotherTargetRecord.copy(
                aspects = Map(
                  withLinksAspectId -> JsObject(
                    "someLinks" -> JsArray(
                      JsObject(
                        "id" -> JsString(withLinksSourceRecordId),
                        "name" -> JsString(withLinksSourceRecordName),
                        "aspects" -> JsObject(
                          withLinksAspectId -> JsObject(
                            "someLinks" -> JsArray(
                              JsString(withLinksTargetRecordId),
                              JsString(withLinksAnotherTargetRecordId)
                            )
                          )
                        )
                      )
                    )
                  )
                )
              )

            theRecords(4) shouldBe expectedWithLinksAnotherTargetRecord.copy(
              tenantId = Some(TENANT_1)
            )
            theRecords(5) shouldBe expectedWithLinksAnotherTargetRecord.copy(
              tenantId = Some(TENANT_2)
            )
          }
        }

        it(
          "should not excludes linking aspects when there are no links and dereference=true"
        ) { param =>
          Post("/v0/aspects", withLinksAspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          Post("/v0/aspects", withLinksAspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withEmptyLinksSourceRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withLinksSourceRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get(
            s"/v0/records/$withLinksSourceRecordId?aspect=$withLinksAspectId&dereference=false"
          ) ~> addTenantIdHeader(TENANT_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record] shouldBe withEmptyLinksSourceRecord.copy(
              tenantId = Some(TENANT_1)
            )
          }

          Get(
            s"/v0/records/$withLinksSourceRecordId?optionalAspect=$withLinksAspectId&dereference=false"
          ) ~> addTenantIdHeader(TENANT_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record] shouldBe withEmptyLinksSourceRecord.copy(
              tenantId = Some(TENANT_1)
            )
          }

          Get(
            s"/v0/records/$withLinksSourceRecordId?aspect=$withLinksAspectId&dereference=true"
          ) ~> addTenantIdHeader(TENANT_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record] shouldBe withEmptyLinksSourceRecord.copy(
              tenantId = Some(TENANT_1)
            )
          }

          Get(
            s"/v0/records/$withLinksSourceRecordId?optionalAspect=$withLinksAspectId&dereference=true"
          ) ~> addTenantIdHeader(TENANT_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record] shouldBe withEmptyLinksSourceRecord.copy(
              tenantId = Some(TENANT_1)
            )
          }
        }
      }

      describe("querying by aspect value") {
        val valueKey = "value"
        val queriedValue = "queried"
        val nonQueriedValue = "nonQueried"
        val otherValueKey = "otherValue"
        val alsoQueriedValue = "alsoQueried"
        val aspectId = "example"
        val aspect = AspectDefinition(aspectId, "any name", None)
        val withQueriedValueRecordId1 = "with the queried value 1"
        val withQueriedValueRecord1 = Record(
          withQueriedValueRecordId1,
          "any name",
          Map(aspectId -> JsObject(valueKey -> JsString(queriedValue))),
          Some("blah")
        )
        val with2QueriedValuesRecord1 = Record(
          withQueriedValueRecordId1,
          "any name",
          Map(
            aspectId -> JsObject(
              valueKey -> JsString(queriedValue),
              otherValueKey -> JsString(alsoQueriedValue)
            )
          ),
          Some("blah")
        )
        val deepPath = "object"
        val withQueriedValueInDeepPathRecord1 = Record(
          withQueriedValueRecordId1,
          "any name",
          Map(
            aspectId -> JsObject(
              deepPath -> JsObject(valueKey -> JsString(queriedValue))
            )
          ),
          Some("blah")
        )
        val withQueriedValueRecordId2 = "with the queried value 2"
        val withQueriedValueRecord2 = Record(
          withQueriedValueRecordId2,
          "any name",
          Map(aspectId -> JsObject(valueKey -> JsString(queriedValue))),
          Some("blah")
        )
        val with2QueriedValuesRecord2 = Record(
          withQueriedValueRecordId2,
          "any name",
          Map(
            aspectId -> JsObject(
              valueKey -> JsString(queriedValue),
              otherValueKey -> JsString(alsoQueriedValue)
            )
          ),
          Some("blah")
        )
        val withQueriedValueInDeepPathRecord2 = Record(
          withQueriedValueRecordId2,
          "any name",
          Map(
            aspectId -> JsObject(
              deepPath -> JsObject(valueKey -> JsString(queriedValue))
            )
          ),
          Some("blah")
        )
        val withoutQueriedValueRecordId1 = "without the queried value"
        val withoutQueriedValueRecordId2 = "without the queried value 2"
        val withoutQueriedValueRecord = Record(
          withoutQueriedValueRecordId1,
          "any name",
          Map(aspectId -> JsObject(valueKey -> JsString(nonQueriedValue))),
          Some("blah")
        )
        val withoutQueriedValueInDeepPathRecord = Record(
          withoutQueriedValueRecordId1,
          "any name",
          Map(
            aspectId -> JsObject(
              deepPath -> JsObject(valueKey -> JsString(nonQueriedValue))
            )
          ),
          Some("blah")
        )
        val withOnlyOneQueriedValueRecordId = "with only one queried value"
        val withOnlyOneQueriedValueRecord = Record(
          withOnlyOneQueriedValueRecordId,
          "any name",
          Map(aspectId -> JsObject(valueKey -> JsString(queriedValue))),
          Some("blah")
        )

        it("works for shallow paths") { param =>
          Post("/v0/aspects", aspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/aspects", aspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withQueriedValueRecord1) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withQueriedValueRecord1) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withQueriedValueRecord2) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withQueriedValueRecord2) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withoutQueriedValueRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withoutQueriedValueRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get(
            s"/v0/records?aspectQuery=$aspectId.$valueKey:$queriedValue&aspect=$aspectId"
          ) ~> addTenantIdHeader(TENANT_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 2
            page.records.head shouldBe withQueriedValueRecord1.copy(
              tenantId = Some(TENANT_1)
            )
            page.records(1) shouldBe withQueriedValueRecord2.copy(
              tenantId = Some(TENANT_1)
            )
          }

          Get(
            s"/v0/records/count?aspectQuery=$aspectId.$valueKey:$queriedValue&aspect=$aspectId"
          ) ~> addTenantIdHeader(TENANT_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 2
          }
        }

        it("works without specifying the aspect in aspects or optionalAspects") {
          param =>
            Post("/v0/aspects", aspect) ~> addUserId() ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }

            Post("/v0/aspects", aspect) ~> addUserId() ~> addTenantIdHeader(
              TENANT_2
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }

            Post("/v0/records", withQueriedValueRecord1) ~> addUserId() ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }

            Post("/v0/records", withQueriedValueRecord1) ~> addUserId() ~> addTenantIdHeader(
              TENANT_2
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }

            Post("/v0/records", withQueriedValueRecord2) ~> addUserId() ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }

            Post("/v0/records", withQueriedValueRecord2) ~> addUserId() ~> addTenantIdHeader(
              TENANT_2
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }

            Post("/v0/records", withoutQueriedValueRecord) ~> addUserId() ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }

            Post("/v0/records", withoutQueriedValueRecord) ~> addUserId() ~> addTenantIdHeader(
              TENANT_2
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }

            Get(s"/v0/records?aspectQuery=$aspectId.$valueKey:$queriedValue") ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage[Record]]
              page.records.length shouldBe 2
              // The aspects are empty if not specifying aspect IDs in aspects or optionalAspects.
              page.records.head shouldBe withQueriedValueRecord1.copy(
                tenantId = Some(TENANT_1),
                aspects = Map()
              )
              page.records(1) shouldBe withQueriedValueRecord2.copy(
                tenantId = Some(TENANT_1),
                aspects = Map()
              )
            }

            Get(
              s"/v0/records/count?aspectQuery=$aspectId.$valueKey:$queriedValue"
            ) ~> addTenantIdHeader(TENANT_1) ~> param
              .api(role)
              .routes ~> check {
              status shouldEqual StatusCodes.OK
              val countResponse = responseAs[CountResponse]
              countResponse.count shouldBe 2
            }
        }

        it("works for deep paths") { param =>
          Post("/v0/aspects", aspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/aspects", aspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withQueriedValueInDeepPathRecord1) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withQueriedValueInDeepPathRecord1) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withQueriedValueInDeepPathRecord2) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withQueriedValueInDeepPathRecord2) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withoutQueriedValueInDeepPathRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withoutQueriedValueInDeepPathRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get(
            s"/v0/records?aspectQuery=$aspectId.$deepPath.$valueKey:$queriedValue&aspect=$aspectId"
          ) ~> addTenantIdHeader(TENANT_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 2
            page.records.head shouldBe withQueriedValueInDeepPathRecord1.copy(
              tenantId = Some(TENANT_1)
            )
            page.records(1) shouldBe withQueriedValueInDeepPathRecord2.copy(
              tenantId = Some(TENANT_1)
            )
          }

          Get(
            s"/v0/records/count?aspectQuery=$aspectId.$deepPath.$valueKey:$queriedValue&aspect=$aspectId"
          ) ~> addTenantIdHeader(TENANT_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 2
          }
        }

        it("works as AND when multiple queries specified") { param =>
          Post("/v0/aspects", aspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/aspects", aspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", with2QueriedValuesRecord1) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", with2QueriedValuesRecord1) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", with2QueriedValuesRecord2) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", with2QueriedValuesRecord2) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withOnlyOneQueriedValueRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", withOnlyOneQueriedValueRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get(
            s"/v0/records?aspectQuery=$aspectId.$valueKey:$queriedValue&aspectQuery=$aspectId.$otherValueKey:$alsoQueriedValue&aspect=$aspectId"
          ) ~> addTenantIdHeader(TENANT_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 2
            page.records.head shouldBe with2QueriedValuesRecord1.copy(
              tenantId = Some(TENANT_1)
            )
            page.records(1) shouldBe with2QueriedValuesRecord2.copy(
              tenantId = Some(TENANT_1)
            )
          }

          Get(
            s"/v0/records/count?aspectQuery=$aspectId.$valueKey:$queriedValue&aspectQuery=$aspectId.$otherValueKey:$alsoQueriedValue&aspect=$aspectId"
          ) ~> addTenantIdHeader(TENANT_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 2
          }
        }

        def createAspect(
            aspectDef: AspectDefinition
        )(implicit param: FixtureParam) =
          Post(
            "/v0/aspects",
            aspectDef
          ) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

        def createRecord(
            record: Record
        )(implicit param: FixtureParam) =
          Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

        it("should work with `:!` not equal operqator") { implicit param =>
          createAspect(AspectDefinition("test-aspect-1", "test aspect", None))

          createRecord(
            Record(
              "record-1",
              "record 1",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsString("test-value-1")
                )
              ),
              Some("source-tag")
            )
          )

          createRecord(
            Record(
              "record-2",
              "record 2",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsString("test-value-3")
                )
              ),
              Some("source-tag")
            )
          )

          createRecord(
            Record(
              "record-3",
              "record 3",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsString("test-value-5")
                )
              ),
              Some("source-tag")
            )
          )

          Get(
            s"/v0/records?aspectQuery=test-aspect-1.key1:!test-value-3"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 2
            page.records(0).id shouldBe "record-1"
            page.records(1).id shouldBe "record-3"
          }

          Get(
            s"/v0/records/count?aspectQuery=test-aspect-1.key1:!test-value-3"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 2
          }

        }

        it(
          "should work with `:?` match a field that matches a pattern (case insenstive)"
        ) { implicit param =>
          createAspect(AspectDefinition("test-aspect-1", "test aspect", None))

          createRecord(
            Record(
              "record-1",
              "record 1",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsString("test-value-1")
                )
              ),
              Some("source-tag")
            )
          )

          createRecord(
            Record(
              "record-2",
              "record 2",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsString("another tESt value")
                )
              ),
              Some("source-tag")
            )
          )

          createRecord(
            Record(
              "record-3",
              "record 3",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsString("new-value-5")
                )
              ),
              Some("source-tag")
            )
          )

          // --- match pattern %test%
          Get(
            s"/v0/records?aspectQuery=test-aspect-1.key1:?%2525test%2525"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 2
            page.records(0).id shouldBe "record-1"
            page.records(1).id shouldBe "record-2"
          }

          Get(
            s"/v0/records/count?aspectQuery=test-aspect-1.key1:?%2525test%2525"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 2
          }
        }

        it(
          "should work with `:!?` match a field that does not matches a pattern (case insenstive)"
        ) { implicit param =>
          createAspect(AspectDefinition("test-aspect-1", "test aspect", None))

          createRecord(
            Record(
              "record-1",
              "record 1",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsString("test-value-1")
                )
              ),
              Some("source-tag")
            )
          )

          createRecord(
            Record(
              "record-2",
              "record 2",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsString("another tESt value")
                )
              ),
              Some("source-tag")
            )
          )

          createRecord(
            Record(
              "record-3",
              "record 3",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsString("new-value-5")
                )
              ),
              Some("source-tag")
            )
          )

          // --- match pattern %test%
          Get(
            s"/v0/records?aspectQuery=test-aspect-1.key1:!?%2525test%2525"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 1
            page.records(0).id shouldBe "record-3"
          }

          Get(
            s"/v0/records/count?aspectQuery=test-aspect-1.key1:!?%2525test%2525"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 1
          }
        }

        it(
          "should work with `:~` match a field that matches a POSIX regular expression (case insenstive)"
        ) { implicit param =>
          createAspect(AspectDefinition("test-aspect-1", "test aspect", None))

          createRecord(
            Record(
              "record-1",
              "record 1",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsString("test-value-1")
                )
              ),
              Some("source-tag")
            )
          )

          createRecord(
            Record(
              "record-2",
              "record 2",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsString("another tESt12 value")
                )
              ),
              Some("source-tag")
            )
          )

          createRecord(
            Record(
              "record-3",
              "record 3",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsString("new-test67-5")
                )
              ),
              Some("source-tag")
            )
          )

          // --- match pattern ^.*test\d+.*$
          // --- encoded as `application/x-www-form-urlencoded`: %5E.%2Atest%5Cd%2B.%2A%24
          // --- replaced % with %25 to make sure aspectQuery value still stay in `application/x-www-form-urlencoded` format after url decoding
          // --- %255E.%252Atest%255Cd%252B.%252A%2524
          Get(
            s"/v0/records?aspectQuery=test-aspect-1.key1:~%255E.%252Atest%255Cd%252B.%252A%2524"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 2
            page.records(0).id shouldBe "record-2"
            page.records(1).id shouldBe "record-3"
          }

          Get(
            s"/v0/records/count?aspectQuery=test-aspect-1.key1:~%255E.%252Atest%255Cd%252B.%252A%2524"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 2
          }
        }

        it(
          "should work with `:!~` match a field that does not matches a POSIX regular expression (case insenstive)"
        ) { implicit param =>
          createAspect(AspectDefinition("test-aspect-1", "test aspect", None))

          createRecord(
            Record(
              "record-1",
              "record 1",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsString("test-value-1")
                )
              ),
              Some("source-tag")
            )
          )

          createRecord(
            Record(
              "record-2",
              "record 2",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsString("another tESt12 value")
                )
              ),
              Some("source-tag")
            )
          )

          createRecord(
            Record(
              "record-3",
              "record 3",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsString("new-test67-5")
                )
              ),
              Some("source-tag")
            )
          )

          // --- match pattern ^.*test\d+.*$
          // --- encoded as `application/x-www-form-urlencoded`: %5E.%2Atest%5Cd%2B.%2A%24
          // --- replaced % with %25 to make sure aspectQuery value still stay in `application/x-www-form-urlencoded` format after url decoding:
          // --- %255E.%252Atest%255Cd%252B.%252A%2524
          Get(
            s"/v0/records?aspectQuery=test-aspect-1.key1:!~%255E.%252Atest%255Cd%252B.%252A%2524"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 1
            page.records(0).id shouldBe "record-1"
          }

          Get(
            s"/v0/records/count?aspectQuery=test-aspect-1.key1:!~%255E.%252Atest%255Cd%252B.%252A%2524"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 1
          }
        }

        it("should work with `:>` greater than") { implicit param =>
          createAspect(AspectDefinition("test-aspect-1", "test aspect", None))

          createRecord(
            Record(
              "record-1",
              "record 1",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsNumber(1)
                )
              ),
              Some("source-tag")
            )
          )

          createRecord(
            Record(
              "record-2",
              "record 2",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsNumber(4)
                )
              ),
              Some("source-tag")
            )
          )

          createRecord(
            Record(
              "record-3",
              "record 3",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsNumber(5)
                )
              ),
              Some("source-tag")
            )
          )

          Get(
            s"/v0/records?aspectQuery=test-aspect-1.key1:>4"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 1
            page.records(0).id shouldBe "record-3"
          }

          Get(
            s"/v0/records/count?aspectQuery=test-aspect-1.key1:>4"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 1
          }
        }

        it("should work with `:>=` greater than or equal to") {
          implicit param =>
            createAspect(AspectDefinition("test-aspect-1", "test aspect", None))

            createRecord(
              Record(
                "record-1",
                "record 1",
                Map(
                  "test-aspect-1" -> JsObject(
                    "key1" -> JsNumber(1)
                  )
                ),
                Some("source-tag")
              )
            )

            createRecord(
              Record(
                "record-2",
                "record 2",
                Map(
                  "test-aspect-1" -> JsObject(
                    "key1" -> JsNumber(4)
                  )
                ),
                Some("source-tag")
              )
            )

            createRecord(
              Record(
                "record-3",
                "record 3",
                Map(
                  "test-aspect-1" -> JsObject(
                    "key1" -> JsNumber(5)
                  )
                ),
                Some("source-tag")
              )
            )

            Get(
              s"/v0/records?aspectQuery=test-aspect-1.key1:>=4"
            ) ~> addTenantIdHeader(TENANT_1) ~> param
              .api(role)
              .routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage[Record]]
              page.records.length shouldBe 2
              page.records(0).id shouldBe "record-2"
              page.records(1).id shouldBe "record-3"
            }

            Get(
              s"/v0/records/count?aspectQuery=test-aspect-1.key1:>=4"
            ) ~> addTenantIdHeader(TENANT_1) ~> param
              .api(role)
              .routes ~> check {
              status shouldEqual StatusCodes.OK
              val countResponse = responseAs[CountResponse]
              countResponse.count shouldBe 2
            }
        }

        it("should work with `:<` less than") { implicit param =>
          createAspect(AspectDefinition("test-aspect-1", "test aspect", None))

          createRecord(
            Record(
              "record-1",
              "record 1",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsNumber(1)
                )
              ),
              Some("source-tag")
            )
          )

          createRecord(
            Record(
              "record-2",
              "record 2",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsNumber(4)
                )
              ),
              Some("source-tag")
            )
          )

          createRecord(
            Record(
              "record-3",
              "record 3",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsNumber(5)
                )
              ),
              Some("source-tag")
            )
          )

          Get(
            s"/v0/records?aspectQuery=test-aspect-1.key1:<4"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 1
            page.records(0).id shouldBe "record-1"
          }

          Get(
            s"/v0/records/count?aspectQuery=test-aspect-1.key1:<4"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 1
          }
        }

        it("should work with `:<=` less than or equal to") { implicit param =>
          createAspect(AspectDefinition("test-aspect-1", "test aspect", None))

          createRecord(
            Record(
              "record-1",
              "record 1",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsNumber(1)
                )
              ),
              Some("source-tag")
            )
          )

          createRecord(
            Record(
              "record-2",
              "record 2",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsNumber(4)
                )
              ),
              Some("source-tag")
            )
          )

          createRecord(
            Record(
              "record-3",
              "record 3",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsNumber(5)
                )
              ),
              Some("source-tag")
            )
          )

          Get(
            s"/v0/records?aspectQuery=test-aspect-1.key1:<=4"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 2
            page.records(0).id shouldBe "record-1"
            page.records(1).id shouldBe "record-2"
          }

          Get(
            s"/v0/records/count?aspectQuery=test-aspect-1.key1:<=4"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 2
          }
        }

        it(
          "should work as OR when multiple queries specified with `aspectOrQuery`"
        ) { implicit param =>
          createAspect(AspectDefinition("test-aspect-1", "test aspect", None))
          createAspect(AspectDefinition("test-aspect-2", "test aspect", None))

          createRecord(
            Record(
              "record-1",
              "record 1",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsString("test-value-1"),
                  "key2" -> JsString("test-value-2")
                )
              ),
              Some("source-tag")
            )
          )

          createRecord(
            Record(
              "record-2",
              "record 2",
              Map(
                "test-aspect-2" -> JsObject(
                  "key3" -> JsString("test-value-3"),
                  "key4" -> JsString("test-value-4")
                )
              ),
              Some("source-tag")
            )
          )

          createRecord(
            Record(
              "record-3",
              "record 3",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsString("test-value-5"),
                  "key2" -> JsString("test-value-6")
                )
              ),
              Some("source-tag")
            )
          )

          Get(
            s"/v0/records?aspectOrQuery=test-aspect-1.key1:test-value-1&aspectOrQuery=test-aspect-2.key4:test-value-4"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 2
            page.records.head.id shouldBe "record-1"
            page.records(1).id shouldBe "record-2"
          }

          Get(
            s"/v0/records/count?aspectOrQuery=test-aspect-1.key1:test-value-1&aspectOrQuery=test-aspect-2.key4:test-value-4"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 2
          }
        }

        it(
          "should sorting record correctly using parameters `orderBy`, `orderDir` or `orderNullFirst`"
        ) { implicit param =>
          createAspect(AspectDefinition("test-aspect-1", "test aspect", None))
          createAspect(AspectDefinition("test-aspect-2", "test aspect", None))

          createRecord(
            Record(
              "record-1",
              "record 1",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsString("test-value-1"),
                  "key2" -> JsString("test-value-2")
                )
              ),
              Some("source-tag")
            )
          )

          createRecord(
            Record(
              "record-2",
              "record 2",
              Map(
                "test-aspect-2" -> JsObject(
                  "key3" -> JsString("test-value-3"),
                  "key4" -> JsString("test-value-4")
                )
              ),
              Some("source-tag")
            )
          )

          createRecord(
            Record(
              "record-3",
              "record 3",
              Map(
                "test-aspect-1" -> JsObject(
                  "key1" -> JsString("test-value-5"),
                  "key2" -> JsString("test-value-6")
                )
              ),
              Some("source-tag")
            )
          )

          /**
            * By Default, `orderDir` should default to desc and `orderNullFirst` default to `false`
            */
          Get(
            s"/v0/records?orderBy=test-aspect-1.key1"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 3
            page.records(0).id shouldBe "record-3"
            page.records(1).id shouldBe "record-1"
            page.records(2).id shouldBe "record-2"
          }

          /**
            * By Default, `orderNullFirst` default to `false`
            */
          Get(
            s"/v0/records?orderBy=test-aspect-1.key1&orderByDir=asc"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 3
            page.records(0).id shouldBe "record-1"
            page.records(1).id shouldBe "record-3"
            page.records(2).id shouldBe "record-2"
          }

          Get(
            s"/v0/records?orderBy=test-aspect-1.key1&orderByDir=asc&orderNullFirst=true"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 3
            page.records(0).id shouldBe "record-2"
            page.records(1).id shouldBe "record-1"
            page.records(2).id shouldBe "record-3"
          }

          Get(
            s"/v0/records?orderBy=test-aspect-1.key1&orderByDir=asc&orderNullFirst=false"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 3
            page.records(0).id shouldBe "record-1"
            page.records(1).id shouldBe "record-3"
            page.records(2).id shouldBe "record-2"
          }

          Get(
            s"/v0/records?orderBy=test-aspect-1.key1&orderByDir=desc&orderNullFirst=true"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 3
            page.records(0).id shouldBe "record-2"
            page.records(1).id shouldBe "record-3"
            page.records(2).id shouldBe "record-1"
          }

          Get(
            s"/v0/records?orderBy=test-aspect-1.key1&orderByDir=desc&orderNullFirst=false"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 3
            page.records(0).id shouldBe "record-3"
            page.records(1).id shouldBe "record-1"
            page.records(2).id shouldBe "record-2"
          }

        }

        it(
          "should throw a `BadRequest` error when orderBy & pageToken both specified"
        ) { implicit param =>
          Get(
            s"/v0/records?orderBy=test-aspect-1.key1&pageToken=10232"
          ) ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.BadRequest
          }
        }

        it("allows url encoded paths and values") { param =>
          val rawTestAspectId = "example aspect"
          val rawValueKey = "&value"
          val rawQueriedValue = "/correct"
          val urlEncodedTestAspectId =
            java.net.URLEncoder.encode(rawTestAspectId, "UTF-8")
          val urlEncodedValueKey =
            java.net.URLEncoder.encode(rawValueKey, "UTF-8")
          val urlEncodedQueriedValue =
            java.net.URLEncoder.encode(rawQueriedValue, "UTF-8")

          val testAspect = AspectDefinition(rawTestAspectId, "any name", None)
          Post("/v0/aspects", testAspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/aspects", testAspect) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val theWithQueriedValueRecord = Record(
            withQueriedValueRecordId1,
            "any name",
            Map(
              rawTestAspectId -> JsObject(
                rawValueKey -> JsString(rawQueriedValue)
              )
            ),
            Some("blah"),
            tenantId = Some(TENANT_1)
          )
          Post("/v0/records", theWithQueriedValueRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", theWithQueriedValueRecord) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          // The queriedValue is different from rawQueriedValue.
          val theWithoutQueriedValueRecord1 = Record(
            withoutQueriedValueRecordId1,
            "any name",
            Map(
              rawTestAspectId -> JsObject(rawValueKey -> JsString(queriedValue))
            ),
            Some("blah")
          )
          Post("/v0/records", theWithoutQueriedValueRecord1) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", theWithoutQueriedValueRecord1) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          // The valueKey is different from rawValueKey
          val theWithoutQueriedValueRecord2 = Record(
            withoutQueriedValueRecordId2,
            "any name",
            Map(
              rawTestAspectId -> JsObject(valueKey -> JsString(rawQueriedValue))
            ),
            Some("blah")
          )
          Post("/v0/records", theWithoutQueriedValueRecord2) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Post("/v0/records", theWithoutQueriedValueRecord2) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get(
            s"/v0/records?aspectQuery=$urlEncodedTestAspectId.$urlEncodedValueKey:$urlEncodedQueriedValue&aspect=$urlEncodedTestAspectId"
          ) ~> addTenantIdHeader(TENANT_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 1
            page.records.head shouldBe theWithQueriedValueRecord.copy(
              tenantId = Some(TENANT_1)
            )
          }

          Get(
            s"/v0/records/count?aspectQuery=$urlEncodedTestAspectId.$urlEncodedValueKey:$urlEncodedQueriedValue&aspect=$urlEncodedTestAspectId"
          ) ~> addTenantIdHeader(TENANT_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 1
          }
        }
      }

      describe("paging") {
        describe("full records") {
          pagingTests("?aspect=test&")
        }

        describe("summaries") {
          pagingTests("/summary?")
        }

        def pagingTests(path: String) {
          val testAspectId = "test"
          val testAspect = AspectDefinition(testAspectId, "any name", None)

          it("honors the limit parameter") { param =>
            Post("/v0/aspects", testAspect) ~> addUserId() ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }

            Post("/v0/aspects", testAspect) ~> addUserId() ~> addTenantIdHeader(
              TENANT_2
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }
            for (i <- 1 to 5) {
              val record = Record(
                i.toString,
                i.toString,
                Map(testAspectId -> JsObject("value" -> JsNumber(i))),
                Some("blah")
              )
              Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK
              }

              Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
                TENANT_2
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK
              }
            }

            Get(s"/v0/records${path}limit=2") ~> addTenantIdHeader(TENANT_1) ~> param
              .api(role)
              .routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage[RecordType]]
              val records = page.records
              records.length shouldBe 2
              records.head.id shouldBe "1"
              records.head.name shouldBe "1"
              records.head.tenantId shouldBe Some(TENANT_1)

              records(1).id shouldBe "2"
              records(1).name shouldBe "2"
              records(1).tenantId shouldBe Some(TENANT_1)
            }
          }

          it("honors the start parameter") { param =>
            Post("/v0/aspects", testAspect) ~> addUserId() ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }

            Post("/v0/aspects", testAspect) ~> addUserId() ~> addTenantIdHeader(
              TENANT_2
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }

            for (i <- 1 to 5) {
              val record = Record(
                i.toString,
                i.toString,
                Map(testAspectId -> JsObject("value" -> JsNumber(i))),
                Some("blah")
              )
              Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK
              }

              Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
                TENANT_2
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK
              }
            }

            Get(s"/v0/records${path}start=3&limit=2") ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage[RecordType]]
              page.records.length shouldBe 2
              page.records.head.name shouldBe "4"
              page.records.head.tenantId shouldBe Some(TENANT_1)
              page.records(1).name shouldBe "5"
              page.records(1).tenantId shouldBe Some(TENANT_1)
            }
          }

          it("pageTokens can be used to page through results") { param =>
            Post("/v0/aspects", testAspect) ~> addUserId() ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }

            Post("/v0/aspects", testAspect) ~> addUserId() ~> addTenantIdHeader(
              TENANT_2
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }

            for (i <- 1 to 5) {
              val record = Record(
                i.toString,
                i.toString,
                Map(testAspectId -> JsObject("value" -> JsNumber(i))),
                Some("blah")
              )
              Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK
              }

              Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
                TENANT_2
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK
              }
            }

            var currentPage = Get(s"/v0/records${path}limit=2") ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage[RecordType]]
              page.records.length shouldBe 2
              page.records.head.name shouldBe "1"
              page.records.head.tenantId shouldBe Some(TENANT_1)
              page.records(1).name shouldBe "2"
              page.records(1).tenantId shouldBe Some(TENANT_1)
              page
            }

            currentPage =
              Get(
                s"/v0/records${path}pageToken=${currentPage.nextPageToken.get}&limit=2"
              ) ~> addTenantIdHeader(TENANT_1) ~> param
                .api(role)
                .routes ~> check {
                status shouldEqual StatusCodes.OK
                val page = responseAs[RecordsPage[RecordType]]
                page.records.length shouldBe 2
                page.records.head.name shouldBe "3"
                page.records.head.tenantId shouldBe Some(TENANT_1)
                page.records(1).name shouldBe "4"
                page.records(1).tenantId shouldBe Some(TENANT_1)
                page
              }

            currentPage = Get(
              s"/v0/records${path}pageToken=${currentPage.nextPageToken.get}&limit=2"
            ) ~> addTenantIdHeader(TENANT_1) ~> param
              .api(role)
              .routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage[RecordType]]
              page.records.length shouldBe 1
              page.records.head.name shouldBe "5"
              page.records.head.tenantId shouldBe Some(TENANT_1)
              page
            }

            currentPage.nextPageToken shouldBe None
          }

          it("provides hasMore correctly") { param =>
            Post("/v0/aspects", testAspect) ~> addUserId() ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }

            Post("/v0/aspects", testAspect) ~> addUserId() ~> addTenantIdHeader(
              TENANT_2
            ) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }

            for (i <- 1 to 5) {
              val record = Record(
                i.toString,
                i.toString,
                Map(testAspectId -> JsObject("value" -> JsNumber(i))),
                Some("blah")
              )
              Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK
              }

              Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
                TENANT_2
              ) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK
              }
            }

            Get(s"/v0/records${path}start=0&limit=4") ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage[RecordType]]
              page.hasMore shouldBe true
              page.nextPageToken.isDefined shouldBe true
            }

            Get(s"/v0/records${path}start=0&limit=5") ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage[RecordType]]
              page.hasMore shouldBe false
              page.nextPageToken.isDefined shouldBe false
            }

            Get(s"/v0/records${path}start=0&limit=6") ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage[RecordType]]
              page.hasMore shouldBe false
              page.nextPageToken.isDefined shouldBe false
            }

            Get(s"/v0/records${path}start=3&limit=1") ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage[RecordType]]
              page.hasMore shouldBe true
              page.nextPageToken.isDefined shouldBe true
            }

            Get(s"/v0/records${path}start=4&limit=1") ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage[RecordType]]
              page.hasMore shouldBe false
              page.nextPageToken.isDefined shouldBe false
            }

            Get(s"/v0/records${path}start=5&limit=1") ~> addTenantIdHeader(
              TENANT_1
            ) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage[RecordType]]
              page.hasMore shouldBe false
              page.nextPageToken.isDefined shouldBe false
            }
          }
        }
      }

      describe("pagetokens") {
        case class TestValues(pageSize: Int, recordCount: Int)

        val valuesToTest = Seq(
          TestValues(0, 0),
          TestValues(1, 1),
          TestValues(1, 5),
          TestValues(2, 10),
          TestValues(5, 5),
          TestValues(10, 2)
        )

        describe("generates correct page tokens") {
          describe("without aspect filtering") {
            valuesToTest.foreach {
              case TestValues(pageSize, recordCount) =>
                it(s"for pageSize $pageSize and recordCount $recordCount") {
                  param =>
                    // Add an aspect for our records for tenant 1
                    val testAspectId = "test"
                    val testAspect =
                      AspectDefinition(testAspectId, "any name", None)
                    Post("/v0/aspects", testAspect) ~> addUserId() ~> addTenantIdHeader(
                      TENANT_1
                    ) ~> param.api(Full).routes ~> check {
                      status shouldEqual StatusCodes.OK
                    }

                    Post("/v0/aspects", testAspect) ~> addUserId() ~> addTenantIdHeader(
                      TENANT_2
                    ) ~> param.api(Full).routes ~> check {
                      status shouldEqual StatusCodes.OK
                    }

                    // Add some records for tenants 1 and 2
                    if (recordCount > 0) {
                      for (i <- 1 to recordCount) {
                        val record = Record(
                          i.toString,
                          i.toString,
                          Map(testAspectId -> JsObject("value" -> JsNumber(i))),
                          Some("blah")
                        )
                        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
                          TENANT_1
                        ) ~> param.api(Full).routes ~> check {
                          status shouldEqual StatusCodes.OK
                        }

                        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
                          TENANT_2
                        ) ~> param.api(Full).routes ~> check {
                          status shouldEqual StatusCodes.OK
                        }
                      }
                    }

                    // Get the page tokens for tenant 1
                    Get(s"/v0/records/pagetokens?limit=$pageSize") ~> addTenantIdHeader(
                      TENANT_1
                    ) ~> param.api(role).routes ~> check {
                      status shouldEqual StatusCodes.OK
                      val pageTokens = responseAs[List[String]]
                      pageTokens.length shouldBe recordCount / Math.max(
                        1,
                        pageSize
                      ) + 1

                      // For each page token, GET the corresponding /records page and make sure it has the correct records.
                      for (pageIndex <- pageTokens.indices) {
                        val token = pageTokens(pageIndex)

                        Get(s"/v0/records?pageToken=$token&limit=$pageSize") ~> addTenantIdHeader(
                          TENANT_1
                        ) ~> param.api(role).routes ~> check {
                          status shouldEqual StatusCodes.OK
                          val page = responseAs[RecordsPage[Record]]

                          for (recordNumber <- page.records.indices) {
                            page
                              .records(recordNumber)
                              .name shouldEqual (pageIndex * pageSize + recordNumber + 1).toString
                            page.records(recordNumber).tenantId shouldBe Some(
                              TENANT_1
                            )
                          }
                        }
                      }
                    }

                    // Get the page tokens for system tenant
                    val totalPageSize = pageSize * 2
                    Get(s"/v0/records/pagetokens?limit=$totalPageSize") ~> addSystemTenantHeader ~> param
                      .api(role)
                      .routes ~> check {
                      status shouldEqual StatusCodes.OK
                      val pageTokens = responseAs[List[String]]
                      pageTokens.length shouldBe recordCount * 2 / Math.max(
                        1,
                        totalPageSize
                      ) + 1

                      for (pageIndex <- pageTokens.indices) {
                        val token = pageTokens(pageIndex)

                        Get(
                          s"/v0/records?pageToken=$token&limit=$totalPageSize"
                        ) ~> addSystemTenantHeader ~> param
                          .api(role)
                          .routes ~> check {
                          status shouldEqual StatusCodes.OK
                          val page = responseAs[RecordsPage[Record]]

                          for (recordNumber <- page.records.indices) {
                            val expectedRecordName = pageIndex * pageSize + recordNumber / 2 + 1
                            val expectedTenantId =
                              if (recordNumber % 2 == 0) Some(TENANT_1)
                              else Some(TENANT_2)
                            page
                              .records(recordNumber)
                              .name shouldEqual expectedRecordName.toString
                            page
                              .records(recordNumber)
                              .tenantId shouldBe expectedTenantId
                          }
                        }
                      }
                    }
                }
            }
          }

          describe("while filtering with a single aspect") {
            valuesToTest.foreach {
              case TestValues(pageSize, recordCount) =>
                it(s"for pageSize $pageSize and recordCount $recordCount") {
                  param =>
                    // Insert two aspects
                    for (aspectNumber <- 1 to 2) {
                      val aspectDefinition = AspectDefinition(
                        aspectNumber.toString,
                        aspectNumber.toString,
                        None
                      )
                      Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
                        TENANT_1
                      ) ~> param.api(Full).routes ~> check {
                        status shouldEqual StatusCodes.OK

                        // Insert $recordCount records for each aspect
                        if (recordCount > 0) {
                          for (i <- 1 to recordCount) {
                            val record = Record(
                              aspectNumber + i.toString,
                              i.toString,
                              Map(
                                aspectNumber.toString -> JsObject(
                                  "value" -> JsNumber(i)
                                )
                              ),
                              Some("blah")
                            )
                            Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
                              TENANT_1
                            ) ~> param.api(Full).routes ~> check {
                              status shouldEqual StatusCodes.OK
                            }
                          }
                        }
                      }

                      Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
                        TENANT_2
                      ) ~> param.api(Full).routes ~> check {
                        status shouldEqual StatusCodes.OK

                        // Insert $recordCount records for each aspect
                        if (recordCount > 0) {
                          for (i <- 1 to recordCount) {
                            val record = Record(
                              aspectNumber + i.toString,
                              i.toString,
                              Map(
                                aspectNumber.toString -> JsObject(
                                  "value" -> JsNumber(i)
                                )
                              ),
                              Some("blah")
                            )
                            Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
                              TENANT_2
                            ) ~> param.api(Full).routes ~> check {
                              status shouldEqual StatusCodes.OK
                            }
                          }
                        }
                      }
                    }

                    // Filter by each aspect and make sure that the tokens returned match up with their respective GET /records results.
                    for (aspectNumber <- 1 to 2) {
                      Get(
                        s"/v0/records/pagetokens?limit=$pageSize&aspect=$aspectNumber"
                      ) ~> addTenantIdHeader(TENANT_1) ~> param
                        .api(role)
                        .routes ~> check {
                        status shouldEqual StatusCodes.OK
                        val pageTokens = responseAs[List[String]]
                        pageTokens.length shouldEqual recordCount / Math.max(
                          1,
                          pageSize
                        ) + 1

                        for (pageIndex <- pageTokens.indices) {
                          val token = pageTokens(pageIndex)

                          Get(
                            s"/v0/records?pageToken=$token&limit=$pageSize&aspect=$aspectNumber"
                          ) ~> addTenantIdHeader(TENANT_1) ~> param
                            .api(role)
                            .routes ~> check {
                            status shouldEqual StatusCodes.OK
                            val page = responseAs[RecordsPage[Record]]

                            for (recordNumber <- page.records.indices) {
                              page
                                .records(recordNumber)
                                .name shouldEqual (pageIndex * pageSize + recordNumber + 1).toString
                            }
                          }
                        }
                      }
                    }

                    // Get the page tokens for system tenant
                    val totalPageSize = pageSize * 2
                    for (aspectNumber <- 1 to 2) {
                      Get(
                        s"/v0/records/pagetokens?limit=$totalPageSize&aspect=$aspectNumber"
                      ) ~> addSystemTenantHeader ~> param
                        .api(role)
                        .routes ~> check {
                        status shouldEqual StatusCodes.OK
                        val pageTokens = responseAs[List[String]]
                        pageTokens.length shouldBe recordCount * 2 / Math.max(
                          1,
                          totalPageSize
                        ) + 1

                        for (pageIndex <- pageTokens.indices) {
                          val token = pageTokens(pageIndex)

                          Get(
                            s"/v0/records?pageToken=$token&limit=$totalPageSize&aspect=$aspectNumber"
                          ) ~> addSystemTenantHeader ~> param
                            .api(role)
                            .routes ~> check {
                            status shouldEqual StatusCodes.OK
                            val page = responseAs[RecordsPage[Record]]
                            for (recordNumber <- page.records.indices) {
                              val expectedRecordName = (pageIndex * totalPageSize + recordNumber) % recordCount + 1
                              val expectedTenantId =
                                if (((pageIndex * totalPageSize + recordNumber) / recordCount) % 2 == 0)
                                  Some(TENANT_1)
                                else Some(TENANT_2)
                              page
                                .records(recordNumber)
                                .name shouldEqual expectedRecordName.toString
                              page
                                .records(recordNumber)
                                .tenantId shouldBe expectedTenantId
                            }
                          }
                        }
                      }
                    }
                }
            }
          }

          describe("while filtering with multiple aspects") {
            valuesToTest.foreach {
              case TestValues(pageSize, recordCount) =>
                it(s"for pageSize $pageSize and recordCount $recordCount") {
                  param =>
                    // Insert some aspects
                    val aspectIds = for (aspectNumber <- 1 to 2)
                      yield aspectNumber.toString
                    aspectIds.foreach { aspectNumber =>
                      val aspectDefinition =
                        AspectDefinition(aspectNumber, aspectNumber, None)
                      Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
                        TENANT_1
                      ) ~> param.api(Full).routes ~> check {
                        status shouldEqual StatusCodes.OK
                      }

                      Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
                        TENANT_2
                      ) ~> param.api(Full).routes ~> check {
                        status shouldEqual StatusCodes.OK
                      }
                    }

                    // Insert some records that have both aspects
                    if (recordCount > 0) {
                      for (i <- 1 to recordCount) {
                        val aspectValues = aspectIds.map(
                          id => id -> JsObject("value" -> JsNumber(i))
                        )
                        val record =
                          Record(
                            i.toString,
                            i.toString,
                            aspectValues.toMap,
                            Some("blah")
                          )
                        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
                          TENANT_1
                        ) ~> param.api(Full).routes ~> check {
                          status shouldEqual StatusCodes.OK
                        }

                        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
                          TENANT_2
                        ) ~> param.api(Full).routes ~> check {
                          status shouldEqual StatusCodes.OK
                        }
                      }
                    }

                    // Insert some records that have only one aspect
                    aspectIds.foreach { aspectId =>
                      for (i <- 1 to recordCount) {
                        val record = Record(
                          aspectId + i.toString,
                          i.toString,
                          Map(aspectId -> JsObject("value" -> JsNumber(i))),
                          Some("blah")
                        )
                        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
                          TENANT_1
                        ) ~> param.api(Full).routes ~> check {
                          status shouldEqual StatusCodes.OK
                        }

                        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
                          TENANT_2
                        ) ~> param.api(Full).routes ~> check {
                          status shouldEqual StatusCodes.OK
                        }
                      }
                    }

                    // Check that pagetokens while filtering for both aspects only returns the records with both, not the
                    // records with one or the other.
                    Get(
                      s"/v0/records/pagetokens?limit=$pageSize&${aspectIds.map(id => "aspect=" + id).mkString("&")}"
                    ) ~> addTenantIdHeader(TENANT_1) ~> param
                      .api(role)
                      .routes ~> check {
                      status shouldEqual StatusCodes.OK
                      val pageTokens = responseAs[List[String]]
                      pageTokens.length shouldEqual recordCount / Math.max(
                        1,
                        pageSize
                      ) + 1

                      for (pageIndex <- pageTokens.indices) {
                        val token = pageTokens(pageIndex)

                        Get(
                          s"/v0/records?pageToken=$token&limit=$pageSize&${aspectIds.map(id => "aspect=" + id).mkString("&")}"
                        ) ~> addTenantIdHeader(TENANT_1) ~> param
                          .api(role)
                          .routes ~> check {
                          status shouldEqual StatusCodes.OK
                          val page = responseAs[RecordsPage[Record]]

                          for (recordNumber <- page.records.indices) {
                            page
                              .records(recordNumber)
                              .name shouldEqual (pageIndex * pageSize + recordNumber + 1).toString
                          }
                        }
                      }
                    }

                    // Get the page tokens for system tenant
                    val totalPageSize = pageSize * 2
                    Get(
                      s"/v0/records/pagetokens?limit=$totalPageSize&${aspectIds.map(id => "aspect=" + id).mkString("&")}"
                    ) ~> addSystemTenantHeader ~> param
                      .api(role)
                      .routes ~> check {
                      status shouldEqual StatusCodes.OK
                      val pageTokens = responseAs[List[String]]
                      pageTokens.length shouldBe recordCount * 2 / Math.max(
                        1,
                        totalPageSize
                      ) + 1

                      for (pageIndex <- pageTokens.indices) {
                        val token = pageTokens(pageIndex)

                        Get(
                          s"/v0/records?pageToken=$token&limit=$totalPageSize&${aspectIds
                            .map(id => "aspect=" + id)
                            .mkString("&")}"
                        ) ~> addSystemTenantHeader ~> param
                          .api(role)
                          .routes ~> check {
                          status shouldEqual StatusCodes.OK
                          val page = responseAs[RecordsPage[Record]]

                          for (recordNumber <- page.records.indices) {
                            val expectedRecordName = pageIndex * pageSize + recordNumber / 2 + 1
                            val expectedTenantId =
                              if (recordNumber % 2 == 0) Some(TENANT_1)
                              else Some(TENANT_2)
                            page
                              .records(recordNumber)
                              .name shouldEqual expectedRecordName.toString
                            page
                              .records(recordNumber)
                              .tenantId shouldBe expectedTenantId
                          }
                        }
                      }
                    }
                }
            }
          }
        }
      }
    }
  }

  def checkRecordLastEventId(
      recordId: String,
      eventId: Option[String],
      tenantId: BigInt = TENANT_1
  )(implicit param: FixtureParam): Unit = {
    Get(
      s"/v0/records/${URLEncoder.encode(recordId, "UTF-8").replace("+", "%20")}/history"
    ) ~> addTenantIdHeader(tenantId) ~> param
      .api(ReadOnly)
      .routes ~> check {
      status shouldEqual StatusCodes.OK
      eventId.get shouldEqual responseAs[EventsPage].events.last.id.get.toString
    }
  }

  /**
    *  Todo: this auth logic related test case should be move to a seperate auth test suit
    *  It currently won't work as we turn off the auth in this test suit
    * @param recordId
    * @param eventId
    * @param tenantId
    * @param param
    */
  def checkDeleteRecordOperationEventId(
      recordId: String,
      eventId: Option[String],
      tenantId: BigInt = TENANT_1
  )(implicit param: FixtureParam): Unit = {

    Get(
      s"/v0/records/${URLEncoder.encode(recordId, "UTF-8").replace("+", "%20")}/history"
    ) ~> addTenantIdHeader(
      TENANT_1
    ) ~> param
      .api(ReadOnly)
      .routes ~> check {
      status shouldEqual StatusCodes.OK
      // --- previous delete request response should include correct eventId as header value
      eventId.get shouldEqual responseAs[EventsPage].events.last.id.get.toString
    }
    // todo: we should address the auth logic of history API of deleted record in a separate test case suit.
    // Only people with unconditionally "object/events/read" permission can see deleted record history.
    // otherwise, people has record-access-permission only can only see the record yet in database.
//    Get(
//      s"/v0/records/${URLEncoder.encode(recordId, "UTF-8").replace("+", "%20")}/history"
//    ) ~> addTenantIdHeader(TENANT_1) ~> param
//      .api(ReadOnly)
//      .routes ~> check {
//      status shouldEqual StatusCodes.OK
//      // --- only admin can see deleted record history
//      responseAs[EventsPage].events.size shouldEqual 0
//    }
  }

  def writeTests(role: Role) {
    describe("POST") {
      it("can add a new record") { param =>
        var eventId: Option[String] = None
        val record = Record("testId", "testName", Map(), Some("tag"))
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record.copy(tenantId = Some(TENANT_1))
          // --- try to retrieve eventId generated because of this request
          eventId = header("x-magda-event-id").map(_.value())
        }

        Get("/v0/records/testId") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK

          val recordRes = responseAs[Record]
          recordRes shouldEqual record.copy(tenantId = Some(TENANT_1))
        }

        Get(s"/v0/records/${record.id}/history") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK

          val eventsPage = responseAs[EventsPage]
          eventsPage.events.length shouldEqual 1
          eventsPage.events(0).userId shouldEqual Some(USER_ID)
          eventsPage.events(0).eventType shouldEqual EventType.CreateRecord
          eventsPage
            .events(0)
            .data
            .fields("recordId")
            .convertTo[String] shouldEqual record.id

          // --- check if the event id match the event id in previous POST response header
          eventId.get shouldEqual eventsPage.events(0).id.get.toString
        }

        Get("/v0/records/testId") ~> addTenantIdHeader(TENANT_2) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it(
        "can add two new records with the same record IDs by different tenants"
      ) { implicit param =>
        var eventId: Option[String] = None
        val record_1 =
          Record("aRecordId", "a default tenant", Map(), Some("tag"))
        Post("/v0/records", record_1) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record_1.copy(
            tenantId = Some(TENANT_1)
          )
          // --- try to retrieve eventId generated because of this request
          eventId = header("x-magda-event-id").map(_.value())
        }

        checkRecordLastEventId("aRecordId", eventId, TENANT_1)

        val record_2 = Record("aRecordId", "a new tenant", Map(), Some("tag"))
        Post("/v0/records", record_2) ~> addUserId() ~> addTenantIdHeader(
          TENANT_2
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record_2.copy(
            tenantId = Some(TENANT_2)
          )
          // --- try to retrieve eventId generated because of this request
          eventId = header("x-magda-event-id").map(_.value())
        }

        checkRecordLastEventId("aRecordId", eventId, TENANT_2)

        Get("/v0/records/aRecordId") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK

          val recordRes = responseAs[Record]
          recordRes shouldEqual record_1.copy(tenantId = Some(TENANT_1))
        }

        Get("/v0/records/aRecordId") ~> addTenantIdHeader(TENANT_2) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK

          val recordRes = responseAs[Record]
          recordRes shouldEqual record_2.copy(tenantId = Some(TENANT_2))
        }
      }

      it("sets sourcetag to NULL by default") { implicit param =>
        val record = Record("testId", "testName", Map(), None)
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record.copy(tenantId = Some(TENANT_1))

          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        Get("/v0/records/testId") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK

          val recordRes = responseAs[Record]
          recordRes shouldEqual record.copy(tenantId = Some(TENANT_1))
        }

        Get("/v0/records/testId") ~> addTenantIdHeader(TENANT_2) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it("supports invalid URL characters in ID") { implicit param =>
        val record = Record("in valid", "testName", Map(), Some("blah"))
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record.copy(tenantId = Some(TENANT_1))

          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "in valid",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        Get("/v0/records/in%20valid") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record(
            "in valid",
            "testName",
            Map(),
            Some("blah"),
            tenantId = Some(TENANT_1)
          )
        }

        Get("/v0/records/in%20valid") ~> addTenantIdHeader(TENANT_2) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it("returns 400 if a record with the given ID already exists") {
        implicit param =>
          val record = Record("testId", "testName", Map(), Some("blah"))
          Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record] shouldEqual record.copy(
              tenantId = Some(TENANT_1)
            )

            // --- check if response eventId = latest event of the record
            checkRecordLastEventId(
              "testId",
              header("x-magda-event-id").map(_.value()),
              TENANT_1
            )
          }

          val updated = record.copy(name = "foo")
          Post("/v0/records", updated) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.BadRequest
            responseAs[ApiError].message should include("already exists")

            header("x-magda-event-id").isEmpty shouldBe true
          }

          Post("/v0/records", updated) ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK

            // --- check if response eventId = latest event of the record
            checkRecordLastEventId(
              "testId",
              header("x-magda-event-id").map(_.value()),
              TENANT_2
            )
          }
      }

    }

    describe("PUT") {
      it("can add a new record") { implicit param =>
        val record = Record("testId", "testName", Map(), Some("policy"))
        Put("/v0/records/testId", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record.copy(tenantId = Some(TENANT_1))
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        Get("/v0/records") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK

          val recordsPage = responseAs[RecordsPage[Record]]
          recordsPage.records.length shouldEqual 1
          recordsPage.records.head shouldEqual record.copy(
            tenantId = Some(TENANT_1)
          )
        }

        Get(s"/v0/records/${record.id}/history") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK

          val eventsPage = responseAs[EventsPage]
          eventsPage.events.length shouldEqual 1
          eventsPage.events(0).userId shouldEqual Some(USER_ID)
          eventsPage.events(0).eventType shouldEqual EventType.CreateRecord
          eventsPage
            .events(0)
            .data
            .fields("recordId")
            .convertTo[String] shouldEqual record.id
        }

        Get("/v0/records") ~> addTenantIdHeader(TENANT_2) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          val recordsPage = responseAs[RecordsPage[Record]]
          recordsPage.records.length shouldEqual 0
        }
      }

      it("can add a new record when `merge`=true") { implicit param =>
        val record = Record("testId", "testName", Map(), Some("source-tag"))
        Put("/v0/records/testId?merge=true", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record.copy(tenantId = Some(TENANT_1))
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        Get("/v0/records") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK

          val recordsPage = responseAs[RecordsPage[Record]]
          recordsPage.records.length shouldEqual 1
          recordsPage.records.head shouldEqual record.copy(
            tenantId = Some(TENANT_1)
          )
        }

        Get(s"/v0/records/${record.id}/history") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK

          val eventsPage = responseAs[EventsPage]
          eventsPage.events.length shouldEqual 1
          eventsPage.events(0).userId shouldEqual Some(USER_ID)
          eventsPage.events(0).eventType shouldEqual EventType.CreateRecord
          eventsPage
            .events(0)
            .data
            .fields("recordId")
            .convertTo[String] shouldEqual record.id
        }

        Get("/v0/records") ~> addTenantIdHeader(TENANT_2) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          val recordsPage = responseAs[RecordsPage[Record]]
          recordsPage.records.length shouldEqual 0
        }
      }

      it("can update an existing record") { implicit param =>
        val record =
          Record(
            "testId",
            "testName",
            Map(),
            tenantId = Some(TENANT_1)
          )

        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK

          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        val newRecord =
          record.copy(name = "newName")
        Put("/v0/records/testId", newRecord) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual newRecord.copy(
            tenantId = Some(TENANT_1)
          )

          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        Put("/v0/records/testId", newRecord) ~> addUserId() ~> addTenantIdHeader(
          TENANT_2
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual newRecord.copy(
            tenantId = Some(TENANT_2)
          )

          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_2
          )
        }

        Get("/v0/records/testId") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record(
            "testId",
            "newName",
            Map(),
            tenantId = Some(TENANT_1)
          )
        }

        Get(s"/v0/records/testId/history") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK

          val eventsPage = responseAs[EventsPage]
          eventsPage.events.length shouldEqual 2
          eventsPage.events(1).userId shouldEqual Some(USER_ID)
          eventsPage.events(1).eventType shouldEqual EventType.PatchRecord
          eventsPage
            .events(1)
            .data
            .fields("recordId")
            .convertTo[String] shouldEqual record.id
        }

        Get("/v0/records/testId") ~> addTenantIdHeader(TENANT_2) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record(
            "testId",
            "newName",
            Map(),
            tenantId = Some(TENANT_2)
          )
        }
      }

      it(
        "updates the sourcetag of an otherwise identical record without generating events"
      ) { implicit param =>
        val record = Record("testId", "testName", Map(), Some("tag1"))
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        Get(s"/v0/records/${record.id}/history") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[EventsPage].events.length shouldEqual 1
        }

        Get(s"/v0/records/${record.id}/history") ~> addTenantIdHeader(TENANT_2) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[EventsPage].events.length shouldEqual 0
        }

        val newRecord = record.copy(sourceTag = Some("tag2"))
        Put("/v0/records/testId", newRecord) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual newRecord.copy(
            tenantId = Some(TENANT_1)
          )
          // -- as no event generated, the header value should be "0"
          header("x-magda-event-id").map(_.value()).get shouldEqual "0"
        }

        Put("/v0/records/testId", newRecord) ~> addUserId() ~> addTenantIdHeader(
          TENANT_2
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual newRecord.copy(
            tenantId = Some(TENANT_2)
          )
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_2
          )
        }

        Get("/v0/records/testId") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record].sourceTag shouldEqual Some("tag2")
        }

        Get(s"/v0/records/${record.id}/history") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[EventsPage].events.length shouldEqual 1
        }

        Get("/v0/records/testId") ~> addTenantIdHeader(TENANT_2) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual newRecord.copy(
            tenantId = Some(TENANT_2)
          )
        }

        Get(s"/v0/records/${record.id}/history") ~> addTenantIdHeader(TENANT_2) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[EventsPage].events.length shouldEqual 1
        }
      }

      it("cannot change the ID of an existing record") { implicit param =>
        val record = Record("testId", "testName", Map(), Some("blah"))
        Put("/v0/records/testId", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record.copy(tenantId = Some(TENANT_1))
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        val updated = record.copy(id = "foo")
        Put("/v0/records/testId", updated) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          responseAs[ApiError].message should include(
            "does not match the record"
          )
          header("x-magda-event-id").isEmpty shouldBe true
        }

        Put("/v0/records/testId", updated) ~> addUserId() ~> addTenantIdHeader(
          TENANT_2
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          header("x-magda-event-id").isEmpty shouldBe true
        }
      }

      it("supports invalid URL characters in ID") { implicit param =>
        val record = Record("in valid", "testName", Map(), Some("blah"))
        Put("/v0/records/in%20valid", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record.copy(tenantId = Some(TENANT_1))
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "in valid",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        Get("/v0/records/in%20valid") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record.copy(tenantId = Some(TENANT_1))
        }
      }

      it("can add an aspect") { implicit param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map(), Some("blah"))
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        val updated = record.copy(aspects = Map("test" -> JsObject()))
        Put("/v0/records/testId", updated) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual updated.copy(tenantId = Some(TENANT_1))
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual updated.copy(tenantId = Some(TENANT_1))
        }
      }

      it("can add an aspect when `merge` = true") { implicit param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record(
          "testId",
          "testName",
          Map(),
          Some("blah")
        )

        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        val updated = record.copy(
          aspects = Map(
            "test" -> JsObject(
              "foo2" -> JsString("bar2")
            )
          )
        )

        Put("/v0/records/testId?merge=true", updated) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual updated.copy(tenantId = Some(TENANT_1))
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual updated.copy(tenantId = Some(TENANT_1))
        }
      }

      it("can modify an aspect") { implicit param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record(
          "testId",
          "testName",
          Map("test" -> JsObject("foo" -> JsString("bar"))),
          Some("blah")
        )
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        val updated = record.copy(
          aspects = Map("test" -> JsObject("foo" -> JsString("baz")))
        )
        Put("/v0/records/testId", updated) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual updated.copy(tenantId = Some(TENANT_1))
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual updated.copy(tenantId = Some(TENANT_1))
        }
      }

      it(
        "should update an aspect without losing existing fields when `merge`=true"
      ) { implicit param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record(
          "testId",
          "testName",
          Map(
            "test" -> JsObject(
              "field1" -> JsString("123"),
              "field2" -> JsString("456")
            )
          ),
          Some("blah")
        )
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        val updates = record.copy(
          aspects = Map("test" -> JsObject("field2" -> JsString("abc")))
        )
        val updated = record.copy(
          aspects = Map(
            "test" -> JsObject(
              "field1" -> JsString("123"),
              "field2" -> JsString("abc")
            )
          )
        )
        Put("/v0/records/testId?merge=true", updates) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual updated.copy(tenantId = Some(TENANT_1))
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual updated.copy(tenantId = Some(TENANT_1))
        }
      }

      it(
        "does not remove aspects simply because they're missing from the PUT payload"
      ) { implicit param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record(
          "testId",
          "testName",
          Map("test" -> JsObject("foo" -> JsString("bar"))),
          Some("blah")
        )
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        // TODO: the PUT should return the real record, not just echo back what the user provided.
        //       i.e. the aspects should be included.  I think.
        val updated = record.copy(aspects = Map())
        Put("/v0/records/testId", updated) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual updated.copy(tenantId = Some(TENANT_1))
          // -- as no event generated, the header value should be "0"
          header("x-magda-event-id").map(_.value()).get shouldEqual "0"
        }

        Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record.copy(tenantId = Some(TENANT_1))
        }
      }

    }

    describe("PATCH") {
      it("returns an error when the record does not exist") { param =>
        val patch = JsonPatch()
        Patch("/v0/records/doesnotexist", patch) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          responseAs[String] should include(
            "Cannot locate request record by id:"
          )
          header("x-magda-event-id").isEmpty shouldBe true
        }
      }

      it("can modify a record's name") { implicit param =>
        val record = Record("testId", "testName", Map(), Some("blah"))
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        val patch = JsonPatch(Replace(Pointer.root / "name", JsString("foo")))
        Patch("/v0/records/testId", patch) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record(
            "testId",
            "foo",
            Map(),
            Some("blah"),
            tenantId = Some(TENANT_1)
          )
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        Patch("/v0/records/testId", patch) ~> addUserId() ~> addTenantIdHeader(
          TENANT_2
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          header("x-magda-event-id").isEmpty shouldBe true
        }

        Get("/v0/records/testId") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record(
            "testId",
            "foo",
            Map(),
            Some("blah"),
            tenantId = Some(TENANT_1)
          )
        }

        Get(s"/v0/records/${record.id}/history") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK

          val eventsPage = responseAs[EventsPage]
          eventsPage.events.length shouldEqual 2
          eventsPage.events(1).userId shouldEqual Some(USER_ID)
          eventsPage.events(1).eventType shouldEqual EventType.PatchRecord
          eventsPage
            .events(1)
            .data
            .fields("recordId")
            .convertTo[String] shouldEqual record.id
        }

        Get("/v0/records/testId") ~> addTenantIdHeader(TENANT_2) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it("cannot modify a record's ID") { implicit param =>
        val record = Record("testId", "testName", Map(), Some("blah"))
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        val patch = JsonPatch(Replace(Pointer.root / "id", JsString("foo")))
        Patch("/v0/records/testId", patch) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          responseAs[ApiError].message should include("ID")
          header("x-magda-event-id").isEmpty shouldBe true
        }
      }

      it("can add an aspect") { implicit param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map(), Some("blah"))
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        val patch =
          JsonPatch(Add(Pointer.root / "aspects" / "test", JsObject()))
        Patch("/v0/records/testId", patch) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record(
            "testId",
            "testName",
            Map("test" -> JsObject()),
            Some("blah"),
            tenantId = Some(TENANT_1)
          )
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        Patch("/v0/records/testId", patch) ~> addUserId() ~> addTenantIdHeader(
          TENANT_2
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          header("x-magda-event-id").isEmpty shouldBe true
        }

        Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record(
            "testId",
            "testName",
            Map("test" -> JsObject()),
            Some("blah"),
            tenantId = Some(TENANT_1)
          )
        }

        Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(TENANT_2) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it("can modify an aspect") { implicit param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record(
          "testId",
          "testName",
          Map("test" -> JsObject("foo" -> JsString("bar"))),
          Some("blah")
        )
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        val patch = JsonPatch(
          Replace(Pointer.root / "aspects" / "test" / "foo", JsString("baz"))
        )
        Patch("/v0/records/testId", patch) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record(
            "testId",
            "testName",
            Map("test" -> JsObject("foo" -> JsString("baz"))),
            Some("blah"),
            tenantId = Some(TENANT_1)
          )
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        Patch("/v0/records/testId", patch) ~> addUserId() ~> addTenantIdHeader(
          TENANT_2
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          header("x-magda-event-id").isEmpty shouldBe true
        }

        Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record(
            "testId",
            "testName",
            Map("test" -> JsObject("foo" -> JsString("baz"))),
            Some("blah"),
            tenantId = Some(TENANT_1)
          )
        }

        Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(TENANT_2) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it("can add a new property to an aspect") { implicit param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record(
          "testId",
          "testName",
          Map("test" -> JsObject("foo" -> JsString("bar"))),
          Some("blah")
        )
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        val patch = JsonPatch(
          Add(Pointer.root / "aspects" / "test" / "newprop", JsString("test"))
        )
        Patch("/v0/records/testId", patch) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record(
            "testId",
            "testName",
            Map(
              "test" -> JsObject(
                "foo" -> JsString("bar"),
                "newprop" -> JsString("test")
              )
            ),
            Some("blah"),
            tenantId = Some(TENANT_1)
          )
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        Patch("/v0/records/testId", patch) ~> addUserId() ~> addTenantIdHeader(
          TENANT_2
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          header("x-magda-event-id").isEmpty shouldBe true
        }

        Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record(
            "testId",
            "testName",
            Map(
              "test" -> JsObject(
                "foo" -> JsString("bar"),
                "newprop" -> JsString("test")
              )
            ),
            Some("blah"),
            tenantId = Some(TENANT_1)
          )
        }

        Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(TENANT_2) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it("can remove an aspect") { implicit param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record(
          "testId",
          "testName",
          Map("test" -> JsObject("foo" -> JsString("bar"))),
          Some("blah")
        )
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        val patch = JsonPatch(Remove(Pointer.root / "aspects" / "test"))
        Patch("/v0/records/testId", patch) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record(
            "testId",
            "testName",
            Map(),
            Some("blah"),
            tenantId = Some(TENANT_1)
          )
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        Patch("/v0/records/testId", patch) ~> addUserId() ~> addTenantIdHeader(
          TENANT_2
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          header("x-magda-event-id").isEmpty shouldBe true
        }

        Get("/v0/records/testId?optionalAspect=test") ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record(
            "testId",
            "testName",
            Map(),
            Some("blah"),
            tenantId = Some(TENANT_1)
          )
        }

        Get("/v0/records/testId?optionalAspect=test") ~> addTenantIdHeader(
          TENANT_2
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it("can remove a property from an aspect") { implicit param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record(
          "testId",
          "testName",
          Map(
            "test" -> JsObject(
              "foo" -> JsString("bar"),
              "newprop" -> JsString("test")
            )
          ),
          Some("blah")
        )
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        val patch =
          JsonPatch(Remove(Pointer.root / "aspects" / "test" / "newprop"))
        Patch("/v0/records/testId", patch) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record(
            "testId",
            "testName",
            Map("test" -> JsObject("foo" -> JsString("bar"))),
            Some("blah"),
            tenantId = Some(TENANT_1)
          )
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        Patch("/v0/records/testId", patch) ~> addUserId() ~> addTenantIdHeader(
          TENANT_2
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          header("x-magda-event-id").isEmpty shouldBe true
        }

        Get("/v0/records/testId?optionalAspect=test") ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record(
            "testId",
            "testName",
            Map("test" -> JsObject("foo" -> JsString("bar"))),
            Some("blah"),
            tenantId = Some(TENANT_1)
          )
        }

        Get("/v0/records/testId?optionalAspect=test") ~> addTenantIdHeader(
          TENANT_2
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it("supports Move within an aspect") { implicit param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record(
          "testId",
          "testName",
          Map("test" -> JsObject("foo" -> JsString("bar"))),
          Some("blah")
        )
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        val patch = JsonPatch(
          Move(
            Pointer.root / "aspects" / "test" / "foo",
            Pointer.root / "aspects" / "test" / "bar"
          )
        )
        Patch("/v0/records/testId", patch) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record(
            "testId",
            "testName",
            Map("test" -> JsObject("bar" -> JsString("bar"))),
            Some("blah"),
            tenantId = Some(TENANT_1)
          )
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        Patch("/v0/records/testId", patch) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          header("x-magda-event-id").isEmpty shouldBe true
        }

        Get("/v0/records/testId?optionalAspect=test") ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record(
            "testId",
            "testName",
            Map("test" -> JsObject("bar" -> JsString("bar"))),
            Some("blah"),
            tenantId = Some(TENANT_1)
          )
        }

        Get("/v0/records/testId?optionalAspect=test") ~> addTenantIdHeader(
          TENANT_2
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it("supports Copy within an aspect") { implicit param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record(
          "testId",
          "testName",
          Map("test" -> JsObject("foo" -> JsString("bar"))),
          Some("blah")
        )
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        val patch = JsonPatch(
          Copy(
            Pointer.root / "aspects" / "test" / "foo",
            Pointer.root / "aspects" / "test" / "bar"
          )
        )
        Patch("/v0/records/testId", patch) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record(
            "testId",
            "testName",
            Map(
              "test" -> JsObject(
                "foo" -> JsString("bar"),
                "bar" -> JsString("bar")
              )
            ),
            Some("blah"),
            tenantId = Some(TENANT_1)
          )
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        Patch("/v0/records/testId", patch) ~> addUserId() ~> addTenantIdHeader(
          TENANT_2
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          header("x-magda-event-id").isEmpty shouldBe true
        }

        Get("/v0/records/testId?optionalAspect=test") ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record(
            "testId",
            "testName",
            Map(
              "test" -> JsObject(
                "foo" -> JsString("bar"),
                "bar" -> JsString("bar")
              )
            ),
            Some("blah"),
            tenantId = Some(TENANT_1)
          )
        }

        Get("/v0/records/testId?optionalAspect=test") ~> addTenantIdHeader(
          TENANT_2
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it("evaluates Test operations") { implicit param =>
        val A = AspectDefinition("A", "A", None)
        Post("/v0/aspects", A) ~> addUserId() ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record(
          "testId",
          "testName",
          Map("A" -> JsObject("foo" -> JsString("bar"))),
          Some("blah")
        )
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        val patchSuccess = JsonPatch(
          Test(Pointer.root / "aspects" / "A" / "foo", JsString("bar"))
        )
        Patch("/v0/records/testId", patchSuccess) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record(
            "testId",
            "testName",
            Map("A" -> JsObject("foo" -> JsString("bar"))),
            Some("blah"),
            tenantId = Some(TENANT_1)
          )
          // --- as it's a test operation, no event should be created
          header("x-magda-event-id").map(_.value()).get shouldEqual "0"
        }

        Patch("/v0/records/testId", patchSuccess) ~> addUserId() ~> addTenantIdHeader(
          TENANT_2
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          header("x-magda-event-id").isEmpty shouldBe true
        }

        val patchFail = JsonPatch(
          Test(
            Pointer.root / "aspects" / "A" / "foo",
            JsString("not this value")
          )
        )
        Patch("/v0/records/testId", patchFail) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          responseAs[ApiError].message should include("test failed")
          header("x-magda-event-id").isEmpty shouldBe true
        }
      }

      it("does not support Move between aspects") { implicit param =>
        val A = AspectDefinition("A", "A", None)
        Post("/v0/aspects", A) ~> addUserId() ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val B = AspectDefinition("B", "B", None)
        Post("/v0/aspects", B) ~> addUserId() ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record(
          "testId",
          "testName",
          Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject()),
          Some("blah")
        )
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        val patch = JsonPatch(
          Move(
            Pointer.root / "aspects" / "A" / "foo",
            Pointer.root / "aspects" / "B" / "foo"
          )
        )
        Patch("/v0/records/testId", patch) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          responseAs[ApiError].message should include("two different aspects")
          header("x-magda-event-id").isEmpty shouldBe true
        }
      }

      it("does not support Copy between aspects") { implicit param =>
        val A = AspectDefinition("A", "A", None)
        Post("/v0/aspects", A) ~> addUserId() ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val B = AspectDefinition("B", "B", None)
        Post("/v0/aspects", B) ~> addUserId() ~> addTenantIdHeader(TENANT_1) ~> param
          .api(role)
          .routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record(
          "testId",
          "testName",
          Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject()),
          Some("blah")
        )
        Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          // --- check if response eventId = latest event of the record
          checkRecordLastEventId(
            "testId",
            header("x-magda-event-id").map(_.value()),
            TENANT_1
          )
        }

        val patch = JsonPatch(
          Copy(
            Pointer.root / "aspects" / "A" / "foo",
            Pointer.root / "aspects" / "B" / "foo"
          )
        )
        Patch("/v0/records/testId", patch) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          responseAs[ApiError].message should include("two different aspects")
          header("x-magda-event-id").isEmpty shouldBe true
        }
      }

    }

    describe("DELETE") {
      describe("by id") {
        it("can delete a record without any aspects") { implicit param =>
          val record = Record("without", "without", Map(), Some("blah"))
          Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            // --- check if response eventId = latest event of the record
            checkRecordLastEventId(
              "without",
              header("x-magda-event-id").map(_.value()),
              TENANT_1
            )
          }

          var eventId: Option[String] = None
          Delete("/v0/records/without") ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[DeleteResult].deleted shouldBe true
            eventId = header("x-magda-event-id").map(_.value())
          }

          Get(s"/v0/records/without/history") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK

            val eventsPage = responseAs[EventsPage]
            eventsPage.events.length shouldEqual 2
            eventsPage.events(1).userId shouldEqual Some(USER_ID)
            eventsPage.events(1).eventType shouldEqual EventType.DeleteRecord
            eventsPage
              .events(0)
              .data
              .fields("recordId")
              .convertTo[String] shouldEqual record.id

            // --- previous delete request response should include correct eventId as header value
            eventId.get shouldEqual responseAs[EventsPage].events.last.id.get.toString
          }

          Delete("/v0/records/without") ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[DeleteResult].deleted shouldBe false
            // --- event id is 0 as no event is generated
            header("x-magda-event-id").map(_.value()).get shouldEqual "0"
          }
        }

        it(
          "returns 200 and deleted=false when asked to delete a record that doesn't exist"
        ) { param =>
          Delete("/v0/records/doesnotexist") ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[DeleteResult].deleted shouldBe false
            // --- event id is 0 as no event is generated
            header("x-magda-event-id").map(_.value()).get shouldEqual "0"
          }
        }

        it("can delete a record with an aspect") { implicit param =>
          val aspectDefinition = AspectDefinition("test", "test", None)
          Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val record =
            Record("with", "with", Map("test" -> JsObject()), Some("blah"))
          Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            // --- check if response eventId = latest event of the record
            checkRecordLastEventId(
              "with",
              header("x-magda-event-id").map(_.value()),
              TENANT_1
            )
          }

          Delete("/v0/records/with") ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[DeleteResult].deleted shouldBe false
            // --- event id is 0 as no event is generated
            header("x-magda-event-id").map(_.value()).get shouldEqual "0"
          }

          Delete("/v0/records/with") ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[DeleteResult].deleted shouldBe true
            // --- check if response eventId is correct
            checkDeleteRecordOperationEventId(
              "with",
              header("x-magda-event-id").map(_.value()),
              TENANT_1
            )
          }
        }
      }

      describe("based on a source tag") {

        def buildAspects(id: String) = {
          Map(
            "source" -> JsObject(
              Map[String, JsValue](
                "id" -> JsString(id),
                "name" -> JsString("name"),
                "url" -> JsString("http://example.com"),
                "type" -> JsString("fake")
              )
            )
          )
        }

        it(
          "deletes only records with the correct source and without the specified tag"
        ) { param =>
          val parentDirSchema = new java.io.File(
            "../magda-registry-aspects/source.schema.json"
          ).getCanonicalFile
          val thisDirSchema = new java.io.File(
            "./magda-registry-aspects/source.schema.json"
          ).getCanonicalFile

          val file =
            if (parentDirSchema.exists) parentDirSchema else thisDirSchema

          val source = scala.io.Source.fromFile(file)
          val lines = try source.mkString
          finally source.close()

          val aspectDefinition = AspectDefinition(
            "source",
            "source",
            Some(lines.parseJson.asJsObject)
          )
          Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val noTagNoSource =
            Record("notag-nosource", "name", Map(), Some("blah"))
          val noTagWrongSource =
            Record(
              "notag-wrongsource",
              "name",
              buildAspects("wrong"),
              Some("blah")
            )
          val noTagRightSource =
            Record(
              "notag-rightsource",
              "name",
              buildAspects("right"),
              Some("blah")
            )

          val wrongTagNoSource =
            Record(
              "wrongtag-nosource",
              "name",
              Map(),
              Some("wrongtag")
            )
          val wrongTagWrongSource = Record(
            "wrongtag-wrongsource",
            "name",
            buildAspects("wrong"),
            Some("wrongtag")
          )
          val wrongTagRightSource = Record(
            "wrongtag-rightsource",
            "name",
            buildAspects("right"),
            Some("wrongtag")
          )

          val rightTagNoSource =
            Record("righttag-nosource", "name", Map(), Some("righttag"))
          val rightTagWrongSource = Record(
            "righttag-wrongsource",
            "name",
            buildAspects("wrong"),
            Some("righttag")
          )

          val rightTagRightSource1 = Record(
            "righttag-rightsource",
            "name",
            buildAspects("right"),
            Some("righttag")
          )

          val all = List(
            noTagNoSource,
            noTagWrongSource,
            noTagRightSource,
            wrongTagNoSource,
            wrongTagWrongSource,
            wrongTagRightSource,
            rightTagNoSource,
            rightTagWrongSource,
            rightTagRightSource1
          )

          all.foreach(
            record =>
              Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(role).routes ~> check {
                status shouldEqual StatusCodes.OK
              }
          )

          Get("/v0/records") ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val res = responseAs[RecordsPage[Record]]
            res.records.length shouldEqual all.length
          }

          Get("/v0/records") ~> addTenantIdHeader(TENANT_2) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val res = responseAs[RecordsPage[Record]]
            res.records.length shouldEqual 0
          }

          Delete("/v0/records?sourceTagToPreserve=righttag&sourceId=right") ~> addUserId() ~> addTenantIdHeader(
            TENANT_2
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[MultipleDeleteResult].count shouldEqual 0
          }

          Delete("/v0/records?sourceTagToPreserve=righttag&sourceId=right") ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[MultipleDeleteResult].count shouldEqual 2
          }

          Get("/v0/records") ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val res = responseAs[RecordsPage[Record]]
            res.records.length shouldEqual (all.length - 2)
            res.records.count(record => record.id == "wrongtag-rightsource") shouldEqual 0
            res.records.count(record => record.id == "notag-rightsource") shouldEqual 0
          }

          List("wrongtag-rightsource", "notag-rightsource").foreach {
            recordId =>
              Get(s"/v0/records/$recordId") ~> addTenantIdHeader(TENANT_1) ~> param
                .api(role)
                .routes ~> check {
                status shouldEqual StatusCodes.NotFound
              }

              Get(s"/v0/records/$recordId/history") ~> addUserId() ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(role).routes ~> check {
                status shouldEqual StatusCodes.OK
                val res = responseAs[EventsPage]

                val deleteRecordEvents = res.events.filter(
                  event => event.eventType == EventType.DeleteRecord
                )

                deleteRecordEvents.length shouldEqual 1
                val deletedRecordEvent =
                  deleteRecordEvents.head.data.convertTo[Map[String, JsValue]]
                deletedRecordEvent("recordId") shouldEqual JsString(recordId)

                val deleteRecordAspectEvents = res.events.filter(
                  event => event.eventType == EventType.DeleteRecordAspect
                )
                deleteRecordAspectEvents.length shouldEqual 1
                val deletedRecordAspectEvent =
                  deleteRecordAspectEvents.head.data
                    .convertTo[Map[String, JsValue]]
                deletedRecordAspectEvent("recordId") shouldEqual JsString(
                  recordId
                )
                deletedRecordAspectEvent("aspectId") shouldEqual JsString(
                  "source"
                )
              }
          }
        }

        it("returns Accepted HTTP code if delete is taking too long") { param =>
          val mockedRecordPersistence = mock[RecordPersistence]
          val mockedEventPersistence = mock[EventPersistence]
          val mockedApi = new RecordsService(
            param.api(role).config,
            param.webHookActor,
            param.authClient,
            system,
            materializer,
            mockedRecordPersistence,
            mockedEventPersistence
          )

          (mockedRecordPersistence
            .trimRecordsBySource(
              _: SpecifiedTenantId,
              _: String,
              _: String,
              _: String,
              _: Option[LoggingAdapter]
            ))
            .expects(*, *, *, *, *)
            .onCall {
              (
                  _: SpecifiedTenantId,
                  _: String,
                  _: String,
                  _: String,
                  _: Option[LoggingAdapter]
              ) =>
                Thread.sleep(600)
                Success(1)
            }

          Delete("?sourceTagToPreserve=righttag&sourceId=right") ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> mockedApi.route ~> check {
            status shouldEqual StatusCodes.Accepted
          }
        }

        it("returns HTTP 200 if there's nothing to delete") { param =>
          val parentDirSchema = new java.io.File(
            "../magda-registry-aspects/source.schema.json"
          ).getCanonicalFile
          val thisDirSchema = new java.io.File(
            "./magda-registry-aspects/source.schema.json"
          ).getCanonicalFile

          val file =
            if (parentDirSchema.exists) parentDirSchema else thisDirSchema
          val source = scala.io.Source.fromFile(file)
          val lines = try source.mkString
          finally source.close()

          val aspectDefinition = AspectDefinition(
            "source",
            "source",
            Some(lines.parseJson.asJsObject)
          )
          Post("/v0/aspects", aspectDefinition) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val rightTagRightSource1 = Record(
            "righttag-rightsource",
            "name",
            buildAspects("right"),
            Some("righttag")
          )

          val all = List(rightTagRightSource1)

          all.foreach(
            record =>
              Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
                TENANT_1
              ) ~> param.api(role).routes ~> check {
                status shouldEqual StatusCodes.OK
              }
          )

          Get("/v0/records") ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val res = responseAs[RecordsPage[Record]]
            res.records.length shouldEqual all.length
          }

          Delete("/v0/records?sourceTagToPreserve=righttag&sourceId=right") ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[MultipleDeleteResult].count shouldEqual 0
          }

          Get("/v0/records") ~> addTenantIdHeader(TENANT_1) ~> param
            .api(role)
            .routes ~> check {
            status shouldEqual StatusCodes.OK
            val res = responseAs[RecordsPage[Record]]
            res.records.length shouldEqual 1
            res.records.count(record => record.id == "righttag-rightsource") shouldEqual 1
          }

        }
      }
    }
  }
}
