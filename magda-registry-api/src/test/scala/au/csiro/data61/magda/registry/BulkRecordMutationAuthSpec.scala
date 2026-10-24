package au.csiro.data61.magda.registry

import akka.http.scaladsl.model.StatusCodes
import au.csiro.data61.magda.model.Auth.UnconditionalTrueDecision
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.model.TenantId.SpecifiedTenantId
import scalikejdbc._
import spray.json._

import java.sql.SQLException
import scala.util.{Failure, Success, Try}

/**
  * Auth logic of routes that mutate a list of records in one request:
  * - {patch} /v0/registry/records
  * - {put} /v0/registry/records/aspects/{aspectId}
  * - {delete} /v0/registry/records/aspectArrayItems/{aspectId}
  *
  * auth will not be skipped in this suit by setting `skipOpaQuery` = false
  */
class BulkRecordMutationAuthSpec extends ApiSpec {

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
       |bulkMutationMaxRecords=2
    """.stripMargin

  val updateOperationUri = "object/record/update"

  def draftRecord(id: String, extraAspects: Map[String, JsObject] = Map()) =
    Record(
      id,
      s"test record ${id}",
      aspects = Map(
        "publishing" -> JsObject("state" -> JsString("draft")),
        "test-aspect" -> JsObject(
          "a" -> JsString(s"value of ${id}"),
          "items" -> JsArray(JsString("A"), JsString("B"))
        )
      ) ++ extraAspects
    )

  def settingUpTestData(
      param: FixtureParam,
      records: List[Record],
      extraAspectIds: List[String] = List()
  ) = {
    param.authFetcher.setAuthDecision(
      "object/aspect/create",
      UnconditionalTrueDecision
    )
    (records.flatMap(_.aspects.keys) ++ extraAspectIds).toSet.foreach {
      aspectId: String =>
        Post("/v0/aspects", AspectDefinition(aspectId, aspectId, None)) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }
    }

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

  def getAspect(
      param: FixtureParam,
      recordId: String,
      aspectId: String
  ): JsObject = {
    param.authFetcher.setAuthDecision(
      "object/record/read",
      UnconditionalTrueDecision
    )
    Get(s"/v0/records/${recordId}/aspects/${aspectId}") ~> addUserId() ~> addTenantIdHeader(
      TENANT_1
    ) ~> param.api(Full).routes ~> check {
      status shouldEqual StatusCodes.OK
      responseAs[JsObject]
    }
  }

  def publishingState(param: FixtureParam, recordId: String) =
    getAspect(param, recordId, "publishing").fields("state")

  def recordFromItem(item: JsObject): JsObject =
    item.fields("object").asJsObject.fields("record").asJsObject

  /**
    * Simulates a user who can only update draft records
    */
  val draftOnlyDecision: JsObject => JsValue = item =>
    JsBoolean(
      recordFromItem(item).fields
        .get("publishing")
        .flatMap(_.asJsObject.fields.get("state")) == Some(JsString("draft"))
    )

  def putPublishedRequest(recordIds: List[String]) =
    Put(
      "/v0/records/aspects/publishing?merge=true",
      JsObject(
        "recordIds" -> JsArray(recordIds.map(JsString(_)).toVector),
        "data" -> JsObject("state" -> JsString("published"))
      )
    ) ~> addUserId() ~> addTenantIdHeader(TENANT_1)

  describe("Bulk record mutation auth logic") {

    describe("{put} /v0/registry/records/aspects/{aspectId}") {

      it(
        "should check every record's current & proposed state in one batch decision request each"
      ) { param =>
        settingUpTestData(param, List(draftRecord("r1"), draftRecord("r2")))
        param.authFetcher.setBatchDecisionFunc(
          updateOperationUri,
          _ => JsTrue
        )

        putPublishedRequest(List("r1", "r2")) ~> param
          .api(Full)
          .routes ~> check {
          withClue(responseAs[String]) {
            status shouldEqual StatusCodes.OK
          }
        }

        val calls = param.authFetcher.batchCallsByOperationUri(
          updateOperationUri
        )
        calls.length shouldBe 2
        // no partial evaluation decision request
        param.authFetcher.totalCallTimes shouldBe 0

        val currentRecords = calls(0)._2.map(recordFromItem)
        currentRecords.map(_.fields("id")).toSet shouldBe Set(
          JsString("r1"),
          JsString("r2")
        )
        // complete record context data incl. all aspects
        currentRecords.foreach { record =>
          record.fields("publishing") shouldBe JsObject(
            "state" -> JsString("draft")
          )
          record.fields.contains("test-aspect") shouldBe true
          record.fields.contains("name") shouldBe true
        }

        val proposedRecords = calls(1)._2.map(recordFromItem)
        proposedRecords.foreach { record =>
          record.fields("publishing") shouldBe JsObject(
            "state" -> JsString("published")
          )
        }

        publishingState(param, "r1") shouldBe JsString("published")
        publishingState(param, "r2") shouldBe JsString("published")
      }

      it(
        "should respond 403 and change no records when any record's proposed state is not permitted"
      ) { param =>
        settingUpTestData(param, List(draftRecord("r1"), draftRecord("r2")))
        param.authFetcher.setBatchDecisionFunc(
          updateOperationUri,
          draftOnlyDecision
        )

        putPublishedRequest(List("r1", "r2")) ~> param
          .api(Full)
          .routes ~> check {
          status shouldEqual StatusCodes.Forbidden
        }

        param.authFetcher
          .batchCallsByOperationUri(updateOperationUri)
          .length shouldBe 2
        // the transaction has been rolled back
        publishingState(param, "r1") shouldBe JsString("draft")
        publishingState(param, "r2") shouldBe JsString("draft")
      }

      it(
        "should respond 403 and change no records when any record's current state is not permitted"
      ) { param =>
        settingUpTestData(param, List(draftRecord("r1"), draftRecord("r2")))
        param.authFetcher.setBatchDecisionFunc(
          updateOperationUri,
          item => JsBoolean(recordFromItem(item).fields("id") != JsString("r2"))
        )

        putPublishedRequest(List("r1", "r2")) ~> param
          .api(Full)
          .routes ~> check {
          status shouldEqual StatusCodes.Forbidden
        }

        // no mutation is attempted
        param.authFetcher
          .batchCallsByOperationUri(updateOperationUri)
          .length shouldBe 1
        publishingState(param, "r1") shouldBe JsString("draft")
        publishingState(param, "r2") shouldBe JsString("draft")
      }

      it(
        "should respond 403 without any decision request when a record doesn't exist"
      ) { param =>
        settingUpTestData(param, List(draftRecord("r1")))
        param.authFetcher.setBatchDecisionFunc(
          updateOperationUri,
          _ => JsTrue
        )

        putPublishedRequest(List("r1", "not-exist")) ~> param
          .api(Full)
          .routes ~> check {
          status shouldEqual StatusCodes.Forbidden
        }

        param.authFetcher.batchAuthCallLog.length shouldBe 0
        publishingState(param, "r1") shouldBe JsString("draft")
      }

      def putNewAspectRequest(recordIds: List[String]) =
        Put(
          "/v0/records/aspects/new-aspect",
          JsObject(
            "recordIds" -> JsArray(recordIds.map(JsString(_)).toVector),
            "data" -> JsObject("c" -> JsString("new"))
          )
        ) ~> addUserId() ~> addTenantIdHeader(TENANT_1)

      def newAspectStatus(param: FixtureParam, recordId: String) = {
        param.authFetcher.setAuthDecision(
          "object/record/read",
          UnconditionalTrueDecision
        )
        Get(s"/v0/records/${recordId}/aspects/new-aspect") ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          status
        }
      }

      it("should create the aspect for records that don't have it yet") {
        param =>
          settingUpTestData(
            param,
            List(draftRecord("r1"), draftRecord("r2")),
            List("new-aspect")
          )
          param.authFetcher.setBatchDecisionFunc(
            updateOperationUri,
            _ => JsTrue
          )

          putNewAspectRequest(List("r1", "r2")) ~> param
            .api(Full)
            .routes ~> check {
            withClue(responseAs[String]) {
              status shouldEqual StatusCodes.OK
            }
          }

          getAspect(param, "r1", "new-aspect") shouldBe JsObject(
            "c" -> JsString("new")
          )
          getAspect(param, "r2", "new-aspect") shouldBe JsObject(
            "c" -> JsString("new")
          )
      }

      it(
        "should not keep created aspects when the proposed state is not permitted"
      ) { param =>
        settingUpTestData(
          param,
          List(draftRecord("r1"), draftRecord("r2")),
          List("new-aspect")
        )
        // the user can't add `new-aspect` to any record
        param.authFetcher.setBatchDecisionFunc(
          updateOperationUri,
          item => JsBoolean(!recordFromItem(item).fields.contains("new-aspect"))
        )

        putNewAspectRequest(List("r1", "r2")) ~> param
          .api(Full)
          .routes ~> check {
          status shouldEqual StatusCodes.Forbidden
        }

        newAspectStatus(param, "r1") shouldEqual StatusCodes.NotFound
        newAspectStatus(param, "r2") shouldEqual StatusCodes.NotFound
      }

      it(
        "should respond 500 and change no records when the decision request fails"
      ) { param =>
        settingUpTestData(param, List(draftRecord("r1")))
        param.authFetcher.setError(new Exception("something wrong"))

        putPublishedRequest(List("r1")) ~> param
          .api(Full)
          .routes ~> check {
          status shouldEqual StatusCodes.InternalServerError
        }

        param.authFetcher.resetMock()
        publishingState(param, "r1") shouldBe JsString("draft")
      }
    }

    describe("{patch} /v0/registry/records") {

      def patchRequest(recordIds: List[String], jsonPatch: String) =
        Patch(
          "/v0/records",
          JsObject(
            "recordIds" -> JsArray(recordIds.map(JsString(_)).toVector),
            "jsonPath" -> jsonPatch.parseJson
          )
        ) ~> addUserId() ~> addTenantIdHeader(TENANT_1)

      val publishPatch =
        """[{"op": "replace", "path": "/aspects/publishing/state", "value": "published"}]"""

      it("should update all records when every record's states are permitted") {
        param =>
          settingUpTestData(param, List(draftRecord("r1"), draftRecord("r2")))
          param.authFetcher.setBatchDecisionFunc(
            updateOperationUri,
            _ => JsTrue
          )

          patchRequest(List("r1", "r2"), publishPatch) ~> param
            .api(Full)
            .routes ~> check {
            withClue(responseAs[String]) {
              status shouldEqual StatusCodes.OK
            }
          }

          param.authFetcher
            .batchCallsByOperationUri(updateOperationUri)
            .length shouldBe 2
          publishingState(param, "r1") shouldBe JsString("published")
          publishingState(param, "r2") shouldBe JsString("published")
      }

      it(
        "should respond 403 and change no records when the proposed state is not permitted"
      ) { param =>
        settingUpTestData(param, List(draftRecord("r1"), draftRecord("r2")))
        param.authFetcher.setBatchDecisionFunc(
          updateOperationUri,
          draftOnlyDecision
        )

        patchRequest(List("r1", "r2"), publishPatch) ~> param
          .api(Full)
          .routes ~> check {
          status shouldEqual StatusCodes.Forbidden
        }

        publishingState(param, "r1") shouldBe JsString("draft")
        publishingState(param, "r2") shouldBe JsString("draft")
      }

      it("should change no records when the mutation fails on any record") {
        param =>
          settingUpTestData(
            param,
            List(
              draftRecord(
                "r1",
                Map("extra-aspect" -> JsObject("b" -> JsString("old")))
              ),
              // the patch can't be applied to r2: no `extra-aspect` aspect
              draftRecord("r2")
            )
          )
          param.authFetcher.setBatchDecisionFunc(
            updateOperationUri,
            _ => JsTrue
          )

          patchRequest(
            List("r1", "r2"),
            """[{"op": "replace", "path": "/aspects/extra-aspect/b", "value": "new"}]"""
          ) ~> param.api(Full).routes ~> check {
            status should not equal StatusCodes.OK
          }

          // the change to r1 has been rolled back
          getAspect(param, "r1", "extra-aspect") shouldBe JsObject(
            "b" -> JsString("old")
          )
      }
    }

    describe("Request size limit (`bulkMutationMaxRecords`)") {

      def recordIdsJson(recordIds: List[String]) =
        JsArray(recordIds.map(JsString(_)).toVector)

      val tooManyRecordIds = List("r1", "r2", "r3")

      val requests = List(
        "patch records" -> (
            () =>
              Patch(
                "/v0/records",
                JsObject(
                  "recordIds" -> recordIdsJson(tooManyRecordIds),
                  "jsonPath" -> """[{"op": "replace", "path": "/aspects/publishing/state", "value": "published"}]""".parseJson
                )
              )
          ),
        "put records aspect" -> (
            () =>
              Put(
                "/v0/records/aspects/publishing?merge=true",
                JsObject(
                  "recordIds" -> recordIdsJson(tooManyRecordIds),
                  "data" -> JsObject("state" -> JsString("published"))
                )
              )
          ),
        "delete records aspect array items" -> (
            () =>
              Delete(
                "/v0/records/aspectArrayItems/test-aspect",
                JsObject(
                  "recordIds" -> recordIdsJson(tooManyRecordIds),
                  "jsonPath" -> JsString("$.items"),
                  "items" -> JsArray(JsString("B"))
                )
              )
          )
      )

      requests.foreach {
        case (desc, request) =>
          it(
            s"should respond 400 without changing any records or asking for any decisions when a ${desc} request has too many records"
          ) { param =>
            settingUpTestData(
              param,
              List(draftRecord("r1"), draftRecord("r2"), draftRecord("r3"))
            )
            param.authFetcher.setBatchDecisionFunc(
              updateOperationUri,
              _ => JsTrue
            )

            request() ~> addUserId() ~> addTenantIdHeader(TENANT_1) ~> param
              .api(Full)
              .routes ~> check {
              status shouldEqual StatusCodes.BadRequest
              responseAs[String] should include(
                "A request can change at most 2 records"
              )
            }

            param.authFetcher.batchAuthCallLog.length shouldBe 0
            List("r1", "r2", "r3").foreach { recordId =>
              publishingState(param, recordId) shouldBe JsString("draft")
              getAspect(param, recordId, "test-aspect").fields("items") shouldBe JsArray(
                JsString("A"),
                JsString("B")
              )
            }
          }
      }
    }

    describe("Record context data loading") {

      /**
        * Run `sql` in a separate connection that gives up waiting for row locks quickly.
        * Returns `Some(SQLState)` when the statement failed.
        */
      def runInAnotherConnection(
          statement: SQL[Nothing, NoExtractor]
      ): Option[String] =
        using(DB(ConnectionPool.borrow())) { db =>
          db.localTx { implicit session =>
            sql"SET LOCAL lock_timeout = '200ms'".execute.apply()
            Try(statement.execute.apply()) match {
              case Success(_)               => None
              case Failure(e: SQLException) => Some(e.getSQLState)
              case Failure(e)               => throw e
            }
          }
        }

      val LOCK_NOT_AVAILABLE = Some("55P03")

      val concurrentChanges = List(
        "lock the record" -> sql"SELECT 1 FROM records WHERE recordid='r1' FOR UPDATE",
        "update an existing aspect" -> sql"UPDATE recordaspects SET data='{}'::json WHERE recordid='r1' AND aspectid='test-aspect'",
        "delete an existing aspect" -> sql"DELETE FROM recordaspects WHERE recordid='r1' AND aspectid='publishing'",
        "add a new aspect" -> sql"INSERT INTO recordaspects (recordid, tenantid, aspectid, lastupdate, data) SELECT 'r1', tenantid, 'new-aspect', lastupdate, '{}'::json FROM records WHERE recordid='r1'"
      )

      it(
        "should lock the records and their aspects until the transaction ends when `lockRecords` = true"
      ) { param =>
        settingUpTestData(param, List(draftRecord("r1")), List("new-aspect"))

        DB localTx { implicit session =>
          val records = RecordMutationAuthorization.loadRecordsContextData(
            SpecifiedTenantId(TENANT_1),
            List("r1"),
            lockRecords = true
          )
          records.keySet shouldBe Set("r1")
          concurrentChanges.foreach {
            case (desc, statement) =>
              withClue(s"another transaction should not be able to ${desc}: ") {
                runInAnotherConnection(statement) shouldBe LOCK_NOT_AVAILABLE
              }
          }
        }

        // locks are released when the transaction ends
        runInAnotherConnection(concurrentChanges.head._2) shouldBe None
      }

      it("should not lock any rows when `lockRecords` = false") { param =>
        settingUpTestData(param, List(draftRecord("r1")), List("new-aspect"))

        DB localTx { implicit session =>
          RecordMutationAuthorization.loadRecordsContextData(
            SpecifiedTenantId(TENANT_1),
            List("r1"),
            lockRecords = false
          )
          concurrentChanges.foreach {
            case (desc, statement) =>
              withClue(s"another transaction should be able to ${desc}: ") {
                runInAnotherConnection(statement) shouldBe None
              }
          }
        }
      }
    }

    describe("{delete} /v0/registry/records/aspectArrayItems/{aspectId}") {

      def deleteItemsRequest(recordIds: List[String]) =
        Delete(
          "/v0/records/aspectArrayItems/test-aspect",
          JsObject(
            "recordIds" -> JsArray(recordIds.map(JsString(_)).toVector),
            "jsonPath" -> JsString("$.items"),
            "items" -> JsArray(JsString("B"))
          )
        ) ~> addUserId() ~> addTenantIdHeader(TENANT_1)

      it("should delete items when every record's states are permitted") {
        param =>
          settingUpTestData(param, List(draftRecord("r1"), draftRecord("r2")))
          param.authFetcher.setBatchDecisionFunc(
            updateOperationUri,
            _ => JsTrue
          )

          deleteItemsRequest(List("r1", "r2")) ~> param
            .api(Full)
            .routes ~> check {
            withClue(responseAs[String]) {
              status shouldEqual StatusCodes.OK
            }
          }

          val calls =
            param.authFetcher.batchCallsByOperationUri(updateOperationUri)
          calls.length shouldBe 2
          calls(1)._2.map(recordFromItem).foreach { record =>
            record
              .fields("test-aspect")
              .asJsObject
              .fields("items") shouldBe JsArray(
              JsString("A")
            )
          }
          getAspect(param, "r1", "test-aspect").fields("items") shouldBe JsArray(
            JsString("A")
          )
      }

      it(
        "should respond 403 and change no records when any record is not permitted"
      ) { param =>
        settingUpTestData(param, List(draftRecord("r1"), draftRecord("r2")))
        param.authFetcher.setBatchDecisionFunc(
          updateOperationUri,
          item => JsBoolean(recordFromItem(item).fields("id") != JsString("r2"))
        )

        deleteItemsRequest(List("r1", "r2")) ~> param
          .api(Full)
          .routes ~> check {
          status shouldEqual StatusCodes.Forbidden
        }

        getAspect(param, "r1", "test-aspect").fields("items") shouldBe JsArray(
          JsString("A"),
          JsString("B")
        )
      }
    }
  }
}
