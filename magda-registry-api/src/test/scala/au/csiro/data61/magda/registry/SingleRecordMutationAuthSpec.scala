package au.csiro.data61.magda.registry

import akka.http.scaladsl.model.{HttpRequest, StatusCodes}
import au.csiro.data61.magda.model.Auth.UnconditionalTrueDecision
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.model.TenantId.SpecifiedTenantId
import gnieh.diffson._
import gnieh.diffson.sprayJson._
import scalikejdbc._
import spray.json._

import java.sql.SQLException
import scala.concurrent.{Await, Future}
import scala.concurrent.duration._
import scala.util.{Failure, Success, Try}

/**
  * Auth logic of routes that mutate a single record:
  * - {put} /v0/registry/records/{id}
  * - {patch} /v0/registry/records/{id}
  * - {delete} /v0/registry/records/{id}
  * - {put} /v0/registry/records/{recordId}/aspects/{aspectId}
  * - {patch} /v0/registry/records/{recordId}/aspects/{aspectId}
  * - {delete} /v0/registry/records/{recordId}/aspects/{aspectId}
  *
  * The user's permission is checked on the record's current state and the proposed state (as written to the DB)
  * within the mutation transaction.
  *
  * auth will not be skipped in this suit by setting `skipOpaQuery` = false
  */
class SingleRecordMutationAuthSpec extends ApiSpec {

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

  val updateOperationUri = "object/record/update"
  val createOperationUri = "object/record/create"
  val deleteOperationUri = "object/record/delete"

  val testAspectIds = List("publishing", "test-aspect", "failing-aspect")

  /**
    * Make adding the `failing-aspect` aspect to a record fail in the DB, after the request data has been validated.
    * So a mutation that changes the record before adding the aspect fails after a partial write.
    */
  def makeAddingFailingAspectFail() = DB autoCommit { implicit session =>
    SQL("""CREATE FUNCTION fail_adding_aspect() RETURNS trigger AS $$
          BEGIN
            RAISE EXCEPTION 'failed to add the aspect';
          END;
          $$ LANGUAGE plpgsql""").execute.apply()
    SQL("""CREATE TRIGGER fail_adding_aspect BEFORE INSERT ON recordaspects
          FOR EACH ROW WHEN (NEW.aspectid = 'failing-aspect')
          EXECUTE FUNCTION fail_adding_aspect()""").execute.apply()
  }

  val draftRecord = Record(
    "r1",
    "test record r1",
    aspects = Map(
      "publishing" -> JsObject("state" -> JsString("draft")),
      "test-aspect" -> JsObject(
        "a" -> JsString("original"),
        "b" -> JsString("untouched")
      )
    ),
    sourceTag = Some("original-tag")
  )

  def createTestAspects(param: FixtureParam) = {
    param.authFetcher.setAuthDecision(
      "object/aspect/create",
      UnconditionalTrueDecision
    )
    testAspectIds.foreach { aspectId =>
      Post("/v0/aspects", AspectDefinition(aspectId, aspectId, None)) ~> addUserId() ~> addTenantIdHeader(
        TENANT_1
      ) ~> param.api(Full).routes ~> check {
        status shouldEqual StatusCodes.OK
      }
    }
    param.authFetcher.resetMock()
  }

  def settingUpTestData(param: FixtureParam) = {
    createTestAspects(param)
    param.authFetcher.setAuthDecision(
      createOperationUri,
      UnconditionalTrueDecision
    )
    Post("/v0/records", draftRecord) ~> addUserId() ~> addTenantIdHeader(
      TENANT_1
    ) ~> param.api(Full).routes ~> check {
      status shouldEqual StatusCodes.OK
    }
    param.authFetcher.resetMock()
  }

  def withReadPermission[T](param: FixtureParam)(f: => T): T = {
    param.authFetcher.setAuthDecision(
      "object/record/read",
      UnconditionalTrueDecision
    )
    f
  }

  def getRecord(param: FixtureParam): Option[Record] =
    withReadPermission(param) {
      Get("/v0/records/r1") ~> addUserId() ~> addTenantIdHeader(TENANT_1) ~> param
        .api(Full)
        .routes ~> check {
        if (status == StatusCodes.NotFound) None
        else {
          status shouldEqual StatusCodes.OK
          Some(responseAs[Record])
        }
      }
    }

  def getAspect(param: FixtureParam, aspectId: String): Option[JsObject] =
    withReadPermission(param) {
      Get(s"/v0/records/r1/aspects/${aspectId}") ~> addUserId() ~> addTenantIdHeader(
        TENANT_1
      ) ~> param.api(Full).routes ~> check {
        if (status == StatusCodes.NotFound) None
        else {
          status shouldEqual StatusCodes.OK
          Some(responseAs[JsObject])
        }
      }
    }

  def publishingState(param: FixtureParam): Option[JsValue] =
    getAspect(param, "publishing").flatMap(_.fields.get("state"))

  def testAspectValue(param: FixtureParam): Option[JsValue] =
    getAspect(param, "test-aspect").flatMap(_.fields.get("a"))

  def recordName(param: FixtureParam): Option[String] =
    getRecord(param).map(_.name)

  /**
    * The record's current state in the DB, in the same format as the decision context data
    */
  def recordContextDataInDb(): Option[JsObject] = DB readOnly {
    implicit session =>
      RecordMutationAuthorization
        .loadRecordsContextData(
          SpecifiedTenantId(TENANT_1),
          List("r1"),
          lockRecords = false
        )
        .get("r1")
  }

  def recordFromInput(input: JsObject): JsObject =
    input.fields("object").asJsObject.fields("record").asJsObject

  /**
    * Records in the context data of all decision requests (with input) of the operation, in the order they were made
    */
  def decisionRecords(
      param: FixtureParam,
      operationUri: String
  ): List[JsObject] =
    param.authFetcher
      .getAuthCallLogsByOperationUri(operationUri)
      .reverse
      .flatMap(_._3)
      .map(input => recordFromInput(input.asJsObject))

  def isPublished(record: JsObject): Boolean =
    record.fields
      .get("publishing")
      .flatMap(_.asJsObject.fields.get("state")) == Some(JsString("published"))

  /**
    * Simulates a user who can only modify draft records
    */
  val draftOnlyDecision: JsObject => JsValue = input =>
    JsBoolean(
      recordFromInput(input).fields
        .get("publishing")
        .flatMap(_.asJsObject.fields.get("state")) == Some(JsString("draft"))
    )

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

  val publishInAnotherConnection =
    sql"""UPDATE recordaspects SET data='{"state":"published"}'::json WHERE recordid='r1' AND aspectid='publishing'"""

  def send(request: HttpRequest) =
    request ~> addUserId() ~> addTenantIdHeader(TENANT_1)

  /**
    * @param desc route description
    * @param operationUri the operation checked on the current & proposed state
    * @param changeRequest a request that makes a change (not related to the publishing state) to the record
    * @param isChanged whether the change made by `changeRequest` is in the DB
    * @param publishRequest a request that changes the record's publishing state from draft to something else.
    *                       `None` for routes that don't have a proposed state (i.e. delete record)
    */
  case class RouteCase(
      desc: String,
      operationUri: String,
      changeRequest: () => HttpRequest,
      isChanged: FixtureParam => Boolean,
      publishRequest: Option[() => HttpRequest]
  ) {
    val hasProposedState = publishRequest.isDefined
  }

  val changedName = "changed name"
  val changedValue = JsString("changed")

  val nameIsChanged: FixtureParam => Boolean = param =>
    recordName(param) == Some(changedName)

  val testAspectIsChanged: FixtureParam => Boolean = param =>
    testAspectValue(param) == Some(changedValue)

  def publishedRecord = draftRecord.copy(
    aspects = Map("publishing" -> JsObject("state" -> JsString("published")))
  )

  def changedRecord = draftRecord.copy(
    name = changedName,
    aspects = Map("test-aspect" -> JsObject("a" -> changedValue))
  )

  val publishPatch = JsonPatch(
    Replace(Pointer.root / "state", JsString("published"))
  )

  val routeCases = List(
    RouteCase(
      "{put} /v0/registry/records/{id}",
      updateOperationUri,
      () => Put("/v0/records/r1", changedRecord),
      nameIsChanged,
      Some(() => Put("/v0/records/r1", publishedRecord))
    ),
    RouteCase(
      "{put} /v0/registry/records/{id}?merge=true",
      updateOperationUri,
      () => Put("/v0/records/r1?merge=true", changedRecord),
      nameIsChanged,
      Some(() => Put("/v0/records/r1?merge=true", publishedRecord))
    ),
    RouteCase(
      "{patch} /v0/registry/records/{id}",
      updateOperationUri,
      () =>
        Patch(
          "/v0/records/r1",
          JsonPatch(Replace(Pointer.root / "name", JsString(changedName)))
        ),
      nameIsChanged,
      Some(
        () =>
          Patch(
            "/v0/records/r1",
            JsonPatch(
              Replace(
                Pointer.root / "aspects" / "publishing" / "state",
                JsString("published")
              )
            )
          )
      )
    ),
    RouteCase(
      "{put} /v0/registry/records/{recordId}/aspects/{aspectId}",
      updateOperationUri,
      () =>
        Put(
          "/v0/records/r1/aspects/test-aspect",
          JsObject("a" -> changedValue)
        ),
      testAspectIsChanged,
      Some(
        () =>
          Put(
            "/v0/records/r1/aspects/publishing",
            JsObject("state" -> JsString("published"))
          )
      )
    ),
    RouteCase(
      "{put} /v0/registry/records/{recordId}/aspects/{aspectId}?merge=true",
      updateOperationUri,
      () =>
        Put(
          "/v0/records/r1/aspects/test-aspect?merge=true",
          JsObject("a" -> changedValue)
        ),
      testAspectIsChanged,
      Some(
        () =>
          Put(
            "/v0/records/r1/aspects/publishing?merge=true",
            JsObject("state" -> JsString("published"))
          )
      )
    ),
    RouteCase(
      "{patch} /v0/registry/records/{recordId}/aspects/{aspectId}",
      updateOperationUri,
      () =>
        Patch(
          "/v0/records/r1/aspects/test-aspect",
          JsonPatch(Replace(Pointer.root / "a", changedValue))
        ),
      testAspectIsChanged,
      Some(() => Patch("/v0/records/r1/aspects/publishing", publishPatch))
    ),
    RouteCase(
      "{delete} /v0/registry/records/{recordId}/aspects/{aspectId}",
      updateOperationUri,
      () => Delete("/v0/records/r1/aspects/test-aspect"),
      param => getAspect(param, "test-aspect").isEmpty,
      // the record without the publishing aspect is not a draft record
      Some(() => Delete("/v0/records/r1/aspects/publishing"))
    ),
    RouteCase(
      "{delete} /v0/registry/records/{id}",
      deleteOperationUri,
      () => Delete("/v0/records/r1"),
      param => getRecord(param).isEmpty,
      None
    )
  )

  describe("Single record mutation auth logic") {

    routeCases.foreach { routeCase =>
      describe(routeCase.desc) {

        it(
          "should check the current state and the proposed state as written to the DB"
        ) { param =>
          settingUpTestData(param)
          val currentState = recordContextDataInDb().get
          param.authFetcher.setDecisionFunc(
            routeCase.operationUri,
            _ => JsTrue
          )

          send(routeCase.changeRequest()) ~> param.api(Full).routes ~> check {
            withClue(responseAs[String]) {
              status shouldEqual StatusCodes.OK
            }
          }

          val records = decisionRecords(param, routeCase.operationUri)
          // full evaluation decisions only
          param.authFetcher.totalCallTimes shouldBe records.length
          records.head shouldBe currentState
          if (routeCase.hasProposedState) {
            records.length shouldBe 2
            records(1) shouldBe recordContextDataInDb().get
          } else {
            records.length shouldBe 1
          }
          routeCase.isChanged(param) shouldBe true
        }

        it(
          "should respond 403 and not change the record when the current state is not permitted"
        ) { param =>
          settingUpTestData(param)
          param.authFetcher.setDecisionFunc(
            routeCase.operationUri,
            _ => JsFalse
          )

          send(routeCase.changeRequest()) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.Forbidden
          }

          decisionRecords(param, routeCase.operationUri).length shouldBe 1
          routeCase.isChanged(param) shouldBe false
        }

        routeCase.publishRequest.foreach { publishRequest =>
          it(
            "should respond 403 and roll back the change when the proposed state is not permitted"
          ) { param =>
            settingUpTestData(param)
            param.authFetcher.setDecisionFunc(
              routeCase.operationUri,
              draftOnlyDecision
            )

            send(publishRequest()) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.Forbidden
            }

            decisionRecords(param, routeCase.operationUri).length shouldBe 2
            publishingState(param) shouldBe Some(JsString("draft"))
          }

          it(
            "should respond 500 and roll back the change when the proposed state decision request fails"
          ) { param =>
            settingUpTestData(param)
            var callTimes = 0
            param.authFetcher.setDecisionFunc(
              routeCase.operationUri,
              _ => {
                callTimes += 1
                if (callTimes > 1) throw new Exception("something wrong")
                JsTrue
              }
            )

            send(publishRequest()) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.InternalServerError
            }

            callTimes shouldBe 2
            publishingState(param) shouldBe Some(JsString("draft"))
          }
        }

        it(
          "should respond 500 with a generic error, without any decision requests or changes, when the record can't be loaded for the auth decision"
        ) { param =>
          settingUpTestData(param)
          // not a JSON object, so the record context data can't be created
          DB autoCommit { implicit session =>
            sql"""UPDATE recordaspects SET data='[]'::json WHERE recordid='r1' AND aspectid='publishing'"""
              .update()
              .apply()
          }
          param.authFetcher.setDecisionFunc(
            routeCase.operationUri,
            _ => JsTrue
          )

          send(routeCase.changeRequest()) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.InternalServerError
            responseAs[String] should not include ("JsArray")
            responseAs[String] should not include ("Exception")
          }

          param.authFetcher.totalCallTimes shouldBe 0
          DB readOnly { implicit session =>
            sql"SELECT name FROM records WHERE recordid='r1'"
              .map(_.string("name"))
              .single()
              .apply()
          } shouldBe Some(draftRecord.name)
          DB readOnly { implicit session =>
            sql"SELECT data::text FROM recordaspects WHERE recordid='r1' AND aspectid='test-aspect'"
              .map(_.string(1))
              .single()
              .apply()
              .map(_.parseJson)
          } shouldBe draftRecord.aspects.get("test-aspect")
        }

        it(
          "should lock the record, so it can't be changed by others between the current state check and the mutation"
        ) { param =>
          settingUpTestData(param)
          var concurrentChangeResult: Option[Option[String]] = None
          param.authFetcher.setDecisionFunc(
            routeCase.operationUri,
            input => {
              if (concurrentChangeResult.isEmpty) {
                // another transaction tries to publish the record while the current state is checked
                concurrentChangeResult = Some(
                  runInAnotherConnection(publishInAnotherConnection)
                )
              }
              draftOnlyDecision(input)
            }
          )

          send(routeCase.changeRequest()) ~> param.api(Full).routes ~> check {
            withClue(responseAs[String]) {
              status shouldEqual StatusCodes.OK
            }
          }

          // otherwise, the user would have changed a published record
          concurrentChangeResult shouldBe Some(LOCK_NOT_AVAILABLE)
          routeCase.isChanged(param) shouldBe true
        }
      }
    }

    describe("{put} /v0/registry/records/{id}") {

      it(
        "should roll back all changes when the mutation fails after a partial write"
      ) { param =>
        settingUpTestData(param)
        param.authFetcher.setDecisionFunc(updateOperationUri, _ => JsTrue)

        makeAddingFailingAspectFail()
        // the name change is written before adding `failing-aspect` fails
        send(
          Put(
            "/v0/records/r1",
            changedRecord.copy(
              aspects = Map("failing-aspect" -> JsObject("a" -> changedValue))
            )
          )
        ) ~> param.api(Full).routes ~> check {
          status should not equal StatusCodes.OK
        }

        recordName(param) shouldBe Some(draftRecord.name)
      }

      it(
        "should check the proposed state as written: a record without `sourceTag` clears the record's `sourceTag`"
      ) { param =>
        settingUpTestData(param)
        param.authFetcher.setDecisionFunc(updateOperationUri, _ => JsTrue)

        send(Put("/v0/records/r1", changedRecord.copy(sourceTag = None))) ~> param
          .api(Full)
          .routes ~> check {
          withClue(responseAs[String]) {
            status shouldEqual StatusCodes.OK
          }
        }

        val records = decisionRecords(param, updateOperationUri)
        records.head.fields.get("sourceTag") shouldBe Some(
          JsString("original-tag")
        )
        records(1).fields.get("sourceTag") shouldBe None
        getRecord(param).get.sourceTag shouldBe None
      }

      it(
        "should respond 400 without any decision requests or changes when the record ID doesn't match the ID in the path"
      ) { param =>
        settingUpTestData(param)
        param.authFetcher.setDecisionFunc(updateOperationUri, _ => JsTrue)
        param.authFetcher.setDecisionFunc(createOperationUri, _ => JsTrue)

        send(Put("/v0/records/r2", changedRecord)) ~> param
          .api(Full)
          .routes ~> check {
          status shouldEqual StatusCodes.BadRequest
        }

        param.authFetcher.totalCallTimes shouldBe 0
        recordName(param) shouldBe Some(draftRecord.name)
      }

      describe("When the record doesn't exist") {

        it(
          "should create the record and check `object/record/create` on the record as written to the DB"
        ) { param =>
          createTestAspects(param)
          param.authFetcher.setDecisionFunc(createOperationUri, _ => JsTrue)

          send(Put("/v0/records/r1", draftRecord)) ~> param
            .api(Full)
            .routes ~> check {
            withClue(responseAs[String]) {
              status shouldEqual StatusCodes.OK
            }
          }

          decisionRecords(param, createOperationUri) shouldBe List(
            recordContextDataInDb().get
          )
          param.authFetcher.totalCallTimes shouldBe 1
          getRecord(param).map(_.name) shouldBe Some(draftRecord.name)
        }

        it(
          "should respond 403 and roll back the creation when the created record is not permitted"
        ) { param =>
          createTestAspects(param)
          param.authFetcher.setDecisionFunc(
            createOperationUri,
            draftOnlyDecision
          )

          send(Put("/v0/records/r1", publishedRecord)) ~> param
            .api(Full)
            .routes ~> check {
            status shouldEqual StatusCodes.Forbidden
          }

          decisionRecords(param, createOperationUri).length shouldBe 1
          getRecord(param) shouldBe None
        }

        it(
          "should check `object/record/update` instead when another request creates the record first"
        ) { param =>
          createTestAspects(param)
          param.authFetcher.setDecisionFunc(createOperationUri, _ => JsTrue)
          // the user can't update the record created by another request
          param.authFetcher.setDecisionFunc(updateOperationUri, _ => JsFalse)

          val persistence = new DefaultRecordPersistence(testConfig)
          val anotherRecord = draftRecord.copy(name = "created by another")

          using(DB(ConnectionPool.borrow())) { db =>
            db.begin()
            // another request has created the record, but not committed yet
            val anotherTxPid = db.withinTx { implicit session =>
              persistence
                .createRecord(
                  SpecifiedTenantId(TENANT_1),
                  anotherRecord,
                  USER_ID
                )
                .get
              sql"SELECT pg_backend_pid()".map(_.int(1)).single().apply().get
            }
            val response = Future {
              send(Put("/v0/records/r1", changedRecord)) ~> param
                .api(Full)
                .routes ~> check {
                status
              }
            }
            // Only commit once the request has found no record and is trying to create it:
            // its insert waits for the other transaction.
            def requestIsWaitingToCreate() = DB readOnly { implicit session =>
              sql"""SELECT count(*) FROM pg_stat_activity
                    WHERE ${anotherTxPid} = ANY(pg_blocking_pids(pid))
                    AND query ILIKE '%insert into Records%'"""
                .map(_.int(1))
                .single()
                .apply()
                .get > 0
            }
            val deadline = System.currentTimeMillis() + 30000
            while (!requestIsWaitingToCreate()) {
              if (System.currentTimeMillis() > deadline) {
                fail("The request didn't try to create the record")
              }
              Thread.sleep(50)
            }
            db.commit()
            Await.result(response, 60.seconds) shouldEqual StatusCodes.Forbidden
          }

          recordName(param) shouldBe Some(anotherRecord.name)
          // the creation failed, so the request was retried as an update of the record created by the other request
          decisionRecords(param, createOperationUri) shouldBe empty
          val updateDecisions = decisionRecords(param, updateOperationUri)
          updateDecisions.length shouldBe 1
          updateDecisions.head.fields("name") shouldBe JsString(
            anotherRecord.name
          )
        }
      }
    }

    describe("{patch} /v0/registry/records/{id}") {

      it(
        "should roll back all changes when the mutation fails after a partial write"
      ) { param =>
        settingUpTestData(param)
        param.authFetcher.setDecisionFunc(updateOperationUri, _ => JsTrue)

        makeAddingFailingAspectFail()
        // the name change is written before adding `failing-aspect` fails
        send(
          Patch(
            "/v0/records/r1",
            JsonPatch(
              Replace(Pointer.root / "name", JsString(changedName)),
              Add(
                Pointer.root / "aspects" / "failing-aspect",
                JsObject("a" -> changedValue)
              )
            )
          )
        ) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
        }

        recordName(param) shouldBe Some(draftRecord.name)
      }
    }
  }
}
