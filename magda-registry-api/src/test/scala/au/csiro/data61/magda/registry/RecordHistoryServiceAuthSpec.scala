package au.csiro.data61.magda.registry

import akka.http.scaladsl.model.StatusCodes
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
class RecordHistoryServiceAuthSpec extends ApiSpec {

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

  describe("Record History Service Auth Logic") {

    describe(
      "History Version API {get} {get} /v0/registry/records/{recordId}/history/{eventId}:"
    ) {
      endpointStandardAuthTestCase(
        Get("/v0/records/testId/history/2"),
        // user needs either "object/event/read" (unconditional) or "object/record/read" (of this record) to access this API
        List("object/event/read", "object/record/read"),
        hasPermissionCheck = param => {
          status shouldEqual StatusCodes.OK
          val record = responseAs[Record]
          // as we navigate to event 2 (create record event)
          // the name should be "testName" rather than "testName2"
          record.name shouldBe "testName"
          param.authFetcher
            .callTimesByOperationUri("object/event/read") shouldBe 1
        },
        noPermissionCheck = param => {
          status shouldEqual StatusCodes.Forbidden
          param.authFetcher
            .callTimesByOperationUri("object/event/read") shouldBe 1
        },
        beforeRequest = param => {
          param.authFetcher.setAuthDecision(
            "object/record/create",
            UnconditionalTrueDecision
          )
          param.authFetcher.setAuthDecision(
            "object/record/update",
            UnconditionalTrueDecision
          )
          param.authFetcher.setAuthDecision(
            "object/record/read",
            UnconditionalTrueDecision
          )
          // create the record, event id should be 2
          Post(
            "/v0/records",
            Record("testId", "testName", Map(), Some("blah"))
          ) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          // create the record, event id should be 3
          Put(
            "/v0/records/testId",
            Record("testId", "testName2", Map(), Some("blah"))
          ) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record].name shouldBe "testName2"
          }
          // check current record name
          Get("/v0/records/testId") ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record].name shouldBe "testName2"
          }
          param.authFetcher.resetMock()
        }
      )
    }

    describe(
      "Record event history API {get} /v0/registry/records/{recordId}/history:"
    ) {

      describe("when access events of a deleted record:") {
        it(
          "should allow access when user has `object/event/read` but no access for users has only `object/record/read`"
        ) { param =>
          // create dummy record and delete it to generate events
          param.authFetcher.setAuthDecision(
            "object/record/create",
            UnconditionalTrueDecision
          )
          param.authFetcher.setAuthDecision(
            "object/record/delete",
            UnconditionalTrueDecision
          )

          var lastEventId: Option[String] = None

          Post("/v0/records", Record("testId", "testName", Map(), Some("blah"))) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Delete("/v0/records/testId") ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            lastEventId = header("x-magda-event-id").map(_.value())
          }
          param.authFetcher.resetMock()

          //preset policy engine response
          param.authFetcher.setAuthDecision(
            "object/event/read",
            UnconditionalTrueDecision
          )
          param.authFetcher.setAuthDecision(
            "object/record/read",
            UnconditionalFalseDecision
          )

          // can access the deleted record event
          Get("/v0/records/testId/history") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            param.authFetcher
              .callTimesByOperationUri("object/event/read") shouldBe 1
            param.authFetcher
              .callTimesByOperationUri("object/record/read") shouldBe 0

            val eventPage = responseAs[EventsPage]
            val deleteEvent = eventPage.events.reverse.head

            eventPage.events.length shouldBe 2
            deleteEvent.id.get.toString shouldBe lastEventId.get
            deleteEvent.eventType.isDeleteEvent shouldBe true
          }
          param.authFetcher.resetMock()

          //preset policy engine response
          param.authFetcher.setAuthDecision(
            "object/event/read",
            UnconditionalFalseDecision
          )
          param.authFetcher.setAuthDecision(
            "object/record/read",
            UnconditionalTrueDecision
          )

          Get("/v0/records/testId/history") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.Forbidden
            param.authFetcher
              .callTimesByOperationUri("object/event/read") shouldBe 1
            param.authFetcher
              .callTimesByOperationUri("object/record/read") shouldBe 0
          }
        }
      }

      describe("when user only has `object/event/read` permission") {
        it(
          "should allow access the record event if user has `object/event/read` permission"
        ) { param =>
          // create dummy record to generate event
          param.authFetcher.setAuthDecision(
            "object/record/create",
            UnconditionalTrueDecision
          )

          var eventId: Option[String] = None

          Post("/v0/records", Record("testId", "testName", Map(), Some("blah"))) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            eventId = header("x-magda-event-id").map(_.value())
          }

          param.authFetcher.resetMock()

          // set policy engine to respond "FALSE" (denied) response
          param.authFetcher.setAuthDecision(
            "object/event/read",
            UnconditionalFalseDecision
          )
          param.authFetcher.setAuthDecision(
            "object/record/read",
            UnconditionalFalseDecision
          )

          Get("/v0/records/testId/history") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            // can't access the history when has no permission
            status shouldEqual StatusCodes.Forbidden
            param.authFetcher
              .callTimesByOperationUri("object/event/read") shouldBe 1
            param.authFetcher
              .callTimesByOperationUri("object/record/read") shouldBe 1
          }

          param.authFetcher.resetMock()

          // set policy engine to respond "FALSE" (denied) response to "object/record/read"
          // but "TRUE" to "object/event/read"
          param.authFetcher.setAuthDecision(
            "object/event/read",
            UnconditionalTrueDecision
          )
          param.authFetcher.setAuthDecision(
            "object/record/read",
            UnconditionalFalseDecision
          )

          Get("/v0/records/testId/history") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            param.authFetcher
              .callTimesByOperationUri("object/event/read") shouldBe 1
            param.authFetcher
              .callTimesByOperationUri("object/record/read") shouldBe 0
            val eventPage = responseAs[EventsPage]
            eventPage.events.length shouldBe 1
            eventPage.events.head.id.get.toString shouldEqual eventId.get
          }
        }

        endpointStandardAuthTestCase(
          Get("/v0/records/testId/history"),
          List("object/event/read"),
          hasPermissionCheck = param => {
            status shouldEqual StatusCodes.OK
            val eventsPage = responseAs[EventsPage]
            eventsPage.events.length shouldEqual 1
            param.authFetcher
              .callTimesByOperationUri("object/event/read") shouldBe 1
          },
          noPermissionCheck = param => {
            status shouldEqual StatusCodes.Forbidden
            param.authFetcher
              .callTimesByOperationUri("object/event/read") shouldBe 1
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

            param.authFetcher.setAuthDecision(
              "object/record/read",
              UnconditionalFalseDecision
            )
          }
        )

      }

      describe("when user has `object/record/read` permission") {
        it(
          "should allow access the record event if user has read permission to the record"
        ) { param =>
          // create dummy record to generate event
          param.authFetcher.setAuthDecision(
            "object/record/create",
            UnconditionalTrueDecision
          )

          var eventId: Option[String] = None

          Post("/v0/records", Record("testId", "testName", Map(), Some("blah"))) ~> addUserId() ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            eventId = header("x-magda-event-id").map(_.value())
          }

          param.authFetcher.resetMock()

          // set policy engine to respond "FALSE" (denied) response
          param.authFetcher.setAuthDecision(
            "object/event/read",
            UnconditionalFalseDecision
          )
          param.authFetcher.setAuthDecision(
            "object/record/read",
            UnconditionalFalseDecision
          )

          Get("/v0/records/testId/history") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            // can't access the history when has no permission
            status shouldEqual StatusCodes.Forbidden
            param.authFetcher
              .callTimesByOperationUri("object/event/read") shouldBe 1
            param.authFetcher
              .callTimesByOperationUri("object/record/read") shouldBe 1
          }

          param.authFetcher.resetMock()

          // set policy engine to respond "FALSE" (denied) response to "object/event/read"
          // but "TRUE" to "object/record/read"
          param.authFetcher.setAuthDecision(
            "object/event/read",
            UnconditionalFalseDecision
          )
          param.authFetcher.setAuthDecision(
            "object/record/read",
            UnconditionalTrueDecision
          )

          Get("/v0/records/testId/history") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            param.authFetcher
              .callTimesByOperationUri("object/event/read") shouldBe 1
            param.authFetcher
              .callTimesByOperationUri("object/record/read") shouldBe 1
            val eventPage = responseAs[EventsPage]
            eventPage.events.length shouldBe 1
            eventPage.events.head.id.get.toString shouldEqual eventId.get
          }
        }

        endpointStandardAuthTestCase(
          Get("/v0/records/testId/history"),
          List("object/record/read"),
          hasPermissionCheck = param => {
            status shouldEqual StatusCodes.OK
            val eventsPage = responseAs[EventsPage]
            eventsPage.events.length shouldEqual 1
            param.authFetcher
              .callTimesByOperationUri("object/record/read") shouldBe 1
          },
          noPermissionCheck = param => {
            status shouldEqual StatusCodes.Forbidden
            param.authFetcher
              .callTimesByOperationUri("object/record/read") shouldBe 1
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
            param.authFetcher.setAuthDecision(
              "object/event/read",
              UnconditionalFalseDecision
            )
          }
        )

      }

    }
  }
}
