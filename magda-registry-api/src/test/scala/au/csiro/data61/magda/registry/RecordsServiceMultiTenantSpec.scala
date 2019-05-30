package au.csiro.data61.magda.registry

import akka.event.LoggingAdapter
import akka.http.scaladsl.model.StatusCodes
import au.csiro.data61.magda.model.Registry._
import gnieh.diffson._
import gnieh.diffson.sprayJson._
import scalikejdbc.DBSession
import spray.json._

import scala.util.Success

class RecordsServiceMultiTenantSpec extends ApiSpec {
  describe("with role Full") {
    readOnlyTests(Full)
    writeTests(Full)
  }

  describe("with role ReadOnly") {
    readOnlyTests(ReadOnly)
  }

  routesShouldBeNonExistentWithRole(ReadOnly, List((
    "POST", Post.apply, "/v0/records"), (
    "PUT", Put.apply, "/v0/records/1"), (
    "PATCH", Patch.apply, "/v0/records/1"), (
    "DELETE", Delete.apply, "/v0/records"), (
    "DELETE", Delete.apply, "/v0/records/1"), (
    "POST", Post.apply, "/v0/records/aspects"), (
    "PUT", Put.apply, "/v0/records/1/aspects/1"), (
    "PATCH", Patch.apply, "/v0/records/1/aspects/1"), (
    "DELETE", Delete.apply, "/v0/records/1/aspects/1")))

  def readOnlyTests(role: Role) {
    describe("GET") {
      it("starts with no records defined") { param =>
        Get("/v0/records") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[RecordsPage[Record]].records shouldBe empty
        }
      }

      it("returns 404 if the given ID does not exist") { param =>
        Get("/v0/records/foo") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.NotFound
          responseAs[BadRequest].message should include("exist")
        }
      }

      it("returns 404 if the given ID does not have a required aspect") { param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("foo", "foo", Map())
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Get("/v0/records/foo?aspect=test") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.NotFound
          responseAs[BadRequest].message should include("exist")
        }
      }

      describe("summary") {
        it("/records/summary/{id} returns a summary with id, name, and aspect ids for which the record has data in the aspect") { param =>
          insertAspectDefs(param)

          val recordWithAspects = Record("id", "name", Map("test1" -> JsObject(), "test2" -> JsObject()))
          param.asAdmin(Post("/v0/records", recordWithAspects)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get("/v0/records/summary/id") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val recordSummary = responseAs[RecordSummary]
            recordSummary.id shouldEqual "id"
            recordSummary.name shouldEqual "name"
            recordSummary.aspects shouldEqual List("test2", "test1")
          }

          Get("/v0/records/summary/id") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.NotFound
          }
        }

        it("/records/summary returns a list of summaries with id, name, and aspect ids for which the record has data in the aspect") { param =>
          insertAspectDefs(param)

          val recordWithAspects1 = Record("id1", "name1", Map("test1" -> JsObject(), "test2" -> JsObject()))
          param.asAdmin(Post("/v0/records", recordWithAspects1)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordWithAspects2 = Record("id2", "name2", Map("test2" -> JsObject(), "test3" -> JsObject()))
          param.asAdmin(Post("/v0/records", recordWithAspects2)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordWithoutAspects = Record("id3", "name3", Map())
          param.asAdmin(Post("/v0/records", recordWithoutAspects)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get("/v0/records/summary") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val recordsSummary = responseAs[RecordsPage[RecordSummary]]
            recordsSummary.records.length shouldEqual 3

            recordsSummary.records.head.id shouldEqual "id1"
            recordsSummary.records.head.name shouldEqual "name1"
            recordsSummary.records.head.aspects shouldEqual List("test2", "test1")

            recordsSummary.records(1).id shouldEqual "id2"
            recordsSummary.records(1).name shouldEqual "name2"
            recordsSummary.records(1).aspects shouldEqual List("test3", "test2")

            recordsSummary.records(2).id shouldEqual "id3"
            recordsSummary.records(2).name shouldEqual "name3"
            recordsSummary.records(2).aspects shouldEqual List()
          }

          Get("/v0/records/summary") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val recordsSummary = responseAs[RecordsPage[RecordSummary]]
            recordsSummary.records.length shouldEqual 0
          }
        }

        def insertAspectDefs(param: FixtureParam) {
          val aspectDefinition1 = AspectDefinition("test1", "test1", None)
          param.asAdmin(Post("/v0/aspects", aspectDefinition1)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          val aspectDefinition2 = AspectDefinition("test2", "test2", None)
          param.asAdmin(Post("/v0/aspects", aspectDefinition2)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          val aspectDefinition3 = AspectDefinition("test3", "test3", None)
          param.asAdmin(Post("/v0/aspects", aspectDefinition3)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
        }
      }

      describe("count") {
        it("returns the right count when no parameters are given") { param =>
          for (i <- 1 to 5) {
            val recordWithoutAspects = Record("id" + i, "name" + i, Map())
            param.asAdmin(Post("/v0/records", recordWithoutAspects)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }
          }

          Get("/v0/records/count") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 5
          }

          Get("/v0/records/count") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 0
          }
        }
      }

      describe("aspects") {
        it("includes optionalAspect if it exists") { param =>
          val aspectDefinition = AspectDefinition("test", "test", None)
          param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordWithAspect = Record("with", "with", Map("test" -> JsObject("foo" -> JsString("bar"))), tenantId = Some(tenant_1))
          param.asAdmin(Post("/v0/records", recordWithAspect)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordWithoutAspect = Record("without", "without", Map(), tenantId = Some(tenant_1))
          param.asAdmin(Post("/v0/records", recordWithoutAspect)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get("/v0/records?optionalAspect=test") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 2
            page.records.head shouldBe recordWithAspect
            page.records(1) shouldBe recordWithoutAspect
          }

          Get("/v0/records?optionalAspect=test") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 0
          }
        }

        it("requires presence of aspect") { param =>
          val aspectDefinition = AspectDefinition("test", "test", None)
          param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordWithAspect = Record("with", "with", Map("test" -> JsObject("foo" -> JsString("bar"))), tenantId = Some(tenant_1))
          param.asAdmin(Post("/v0/records", recordWithAspect)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordWithoutAspect = Record("without", "without", Map(), tenantId = Some(tenant_1))
          param.asAdmin(Post("/v0/records", recordWithoutAspect)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get("/v0/records?aspect=test") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 1
            page.records.head shouldBe recordWithAspect
          }

          Get("/v0/records/count?aspect=test") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 1
          }

          Get("/v0/records?aspect=test") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 0
          }

          Get("/v0/records/count?aspect=test") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 0
          }
        }

        it("requires any specified aspects to be present") { param =>
          val fooAspect = AspectDefinition("foo", "foo", None)
          param.asAdmin(Post("/v0/aspects", fooAspect)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val barAspect = AspectDefinition("bar", "bar", None)
          param.asAdmin(Post("/v0/aspects", barAspect)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val withFoo = Record("withFoo", "with foo", Map("foo" -> JsObject("test" -> JsString("test"))))
          param.asAdmin(Post("/v0/records", withFoo)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val withBar = Record("withBar", "with bar", Map("bar" -> JsObject("test" -> JsString("test"))))
          param.asAdmin(Post("/v0/records", withBar)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val withFooAndBar = Record("withFooAndBar", "with foo and bar", Map("foo" -> JsObject(), "bar" -> JsObject("test" -> JsString("test"))), tenantId = Some(tenant_1))
          param.asAdmin(Post("/v0/records", withFooAndBar)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get("/v0/records?aspect=foo&aspect=bar") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 1
            page.records.head shouldBe withFooAndBar
          }

          Get("/v0/records/count?aspect=foo&aspect=bar") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 1
          }

          Get("/v0/records?aspect=foo&aspect=bar") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 0
          }

          Get("/v0/records/count?aspect=foo&aspect=bar") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 0
          }
        }

        it("optionalAspects are optional") { param =>
          val fooAspect = AspectDefinition("foo", "foo", None)
          param.asAdmin(Post("/v0/aspects", fooAspect)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val barAspect = AspectDefinition("bar", "bar", None)
          param.asAdmin(Post("/v0/aspects", barAspect)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val withFoo = Record("withFoo", "with foo", Map("foo" -> JsObject("test" -> JsString("test"))), tenantId = Some(tenant_1))
          param.asAdmin(Post("/v0/records", withFoo)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val withBar = Record("withBar", "with bar", Map("bar" -> JsObject("test" -> JsString("test"))), tenantId = Some(tenant_1))
          param.asAdmin(Post("/v0/records", withBar)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val withFooAndBar = Record("withFooAndBar", "with foo and bar", Map("foo" -> JsObject(), "bar" -> JsObject("test" -> JsString("test"))), tenantId = Some(tenant_1))
          param.asAdmin(Post("/v0/records", withFooAndBar)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val withNone = Record("withNone", "with none", Map(), tenantId = Some(tenant_1))
          param.asAdmin(Post("/v0/records", withNone)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get("/v0/records?optionalAspect=foo&optionalAspect=bar") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 4
            page.records.head shouldBe withFoo
            page.records(1) shouldBe withBar
            page.records(2) shouldBe withFooAndBar
            page.records(3) shouldBe withNone
          }

          Get("/v0/records?optionalAspect=foo&optionalAspect=bar") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 0
          }
        }

        it("supports a mix of aspects and optionalAspects") { param =>
          val fooAspect = AspectDefinition("foo", "foo", None)
          param.asAdmin(Post("/v0/aspects", fooAspect)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val barAspect = AspectDefinition("bar", "bar", None)
          param.asAdmin(Post("/v0/aspects", barAspect)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val bazAspect = AspectDefinition("baz", "baz", None)
          param.asAdmin(Post("/v0/aspects", bazAspect)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val withFoo = Record("withFoo", "with foo", Map("foo" -> JsObject("test" -> JsString("test"))), tenantId = Some(tenant_1))
          param.asAdmin(Post("/v0/records", withFoo)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val withBar = Record("withBar", "with bar", Map("bar" -> JsObject("test" -> JsString("test"))))
          param.asAdmin(Post("/v0/records", withBar)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val withFooAndBarAndBaz = Record("withFooAndBarAndBaz", "with foo and bar", Map("foo" -> JsObject(), "bar" -> JsObject("test" -> JsString("test")), "baz" -> JsObject()), tenantId = Some(tenant_1))
          param.asAdmin(Post("/v0/records", withFooAndBarAndBaz)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val withNone = Record("withNone", "with none", Map())
          param.asAdmin(Post("/v0/records", withNone)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get("/v0/records?aspect=foo&optionalAspect=bar") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 2
            page.records.head shouldBe withFoo

            // withFooAndBarAndBaz shouldn't include the baz aspect because it wasn't requested
            page.records(1) shouldBe withFooAndBarAndBaz.copy(aspects = withFooAndBarAndBaz.aspects - "baz")
          }

          Get("/v0/records?aspect=foo&optionalAspect=bar") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 0
          }
        }

        it("accepts URL-encoded aspect names") { param =>
          val aspect = AspectDefinition("with space", "foo", None)
          param.asAdmin(Post("/v0/aspects", aspect)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val record = Record("whatever", "whatever", Map("with space" -> JsObject("test" -> JsString("test"))), tenantId = Some(tenant_1))
          param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get("/v0/records?optionalAspect=with%20space") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 1
            page.records.head shouldBe record
          }

          Get("/v0/records?aspect=with%20space") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 1
            page.records.head shouldBe record
          }

          Get("/v0/records/count?aspect=with%20space") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 1
          }

          Get("/v0/records?optionalAspect=with%20space") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 0
          }

          Get("/v0/records?aspect=with%20space") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 0
          }

          Get("/v0/records/count?aspect=with%20space") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 0
          }
        }

        it("returns the specified aspect of the specified record of the specified tenant") { param =>
          val aspectDefinition_1 = AspectDefinition("test", "test", None)
          param.asAdmin(Post("/v0/aspects", aspectDefinition_1)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }
          val aspectDefinition_2 = AspectDefinition("test", "test", None)
          param.asAdmin(Post("/v0/aspects", aspectDefinition_2)) ~> addTenantIdHeader(tenant_2) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val expected_aspect_1 = JsObject("foo_1" -> JsString("bar_1"))
          val recordWithAspect_1 = Record("with", "with", Map("test" -> expected_aspect_1))
          param.asAdmin(Post("/v0/records", recordWithAspect_1)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val expected_aspect_2 = JsObject("foo_2" -> JsString("bar_2"))
          val recordWithAspect_2 = Record("with", "with", Map("test" -> expected_aspect_2))
          param.asAdmin(Post("/v0/records", recordWithAspect_2)) ~> addTenantIdHeader(tenant_2) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get("/v0/records/with/aspects/test") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val actual_aspect_1 = responseAs[JsObject]
            actual_aspect_1 shouldBe expected_aspect_1
          }

          Get("/v0/records/with/aspects/test") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val actual_aspect_2 = responseAs[JsObject]
            actual_aspect_2 shouldBe expected_aspect_2
          }
        }
      }

      describe("dereference") {
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
          val aspect = AspectDefinition("withLink", "with link", Some(JsonParser(jsonSchema).asJsObject))
          param.asAdmin(Post("/v0/aspects", aspect)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val source = Record("source", "source", Map("withLink" -> JsObject("someLink" -> JsString("target"))))
          param.asAdmin(Post("/v0/records", source)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val target = Record("target", "target", Map("withLink" -> JsObject("someLink" -> JsString("source"))))
          param.asAdmin(Post("/v0/records", target)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get("/v0/records/source?aspect=withLink") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record].aspects("withLink") shouldBe JsObject(
              "someLink" -> JsString("target"))
          }

          Get("/v0/records/source?aspect=withLink&dereference=false") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record].aspects("withLink") shouldBe JsObject(
              "someLink" -> JsString("target"))
          }

          Get("/v0/records/source?aspect=withLink&dereference=true") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record].aspects("withLink") shouldBe JsObject(
              "someLink" -> JsObject(
                "id" -> JsString("target"),
                "name" -> JsString("target"),
                "aspects" -> JsObject(
                  "withLink" -> JsObject(
                    "someLink" -> JsString("source")))))
          }

          Get("/v0/records/source?aspect=withLink") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.NotFound
          }
        }

        it("dereferences an array of links if requested") { param =>
          val jsonSchema =
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
          val aspect = AspectDefinition("withLinks", "with links", Some(JsonParser(jsonSchema).asJsObject))
          param.asAdmin(Post("/v0/aspects", aspect)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val source = Record("source", "source", Map("withLinks" -> JsObject("someLinks" -> JsArray(JsString("target"), JsString("anotherTarget")))))
          param.asAdmin(Post("/v0/records", source)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val target = Record("target", "target", Map("withLinks" -> JsObject("someLinks" -> JsArray(JsString("source")))))
          param.asAdmin(Post("/v0/records", target)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val anotherTarget = Record("anotherTarget", "anotherTarget", Map("withLinks" -> JsObject("someLinks" -> JsArray(JsString("source")))))
          param.asAdmin(Post("/v0/records", anotherTarget)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get("/v0/records/source?aspect=withLinks") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record].aspects("withLinks") shouldBe JsObject(
              "someLinks" -> JsArray(JsString("target"), JsString("anotherTarget")))
          }

          Get("/v0/records/source?aspect=withLinks&dereference=false") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record].aspects("withLinks") shouldBe JsObject(
              "someLinks" -> JsArray(JsString("target"), JsString("anotherTarget")))
          }

          Get("/v0/records/source?aspect=withLinks&dereference=true") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record].aspects("withLinks") shouldBe JsObject(
              "someLinks" -> JsArray(
                JsObject(
                  "id" -> JsString("target"),
                  "name" -> JsString("target"),
                  "aspects" -> JsObject(
                    "withLinks" -> JsObject(
                      "someLinks" -> JsArray(JsString("source"))))),
                JsObject(
                  "id" -> JsString("anotherTarget"),
                  "name" -> JsString("anotherTarget"),
                  "aspects" -> JsObject(
                    "withLinks" -> JsObject(
                      "someLinks" -> JsArray(JsString("source")))))))
          }
        }

        it("should not excludes linking aspects when there are no links and dereference=true") { param =>
          val jsonSchema =
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
          val aspect = AspectDefinition("withLinks", "with links", Some(JsonParser(jsonSchema).asJsObject))
          param.asAdmin(Post("/v0/aspects", aspect)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val source = Record("source", "source", Map("withLinks" -> JsObject("someLinks" -> JsArray())))
          param.asAdmin(Post("/v0/records", source)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get("/v0/records/source?aspect=withLinks&dereference=true") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record].aspects("withLinks") shouldBe JsObject(
              "someLinks" -> JsArray())
          }
        }
      }

      describe("querying by aspect value") {
        it("works for shallow paths") { param =>
          val aspect = AspectDefinition("exampleAspect", "exampleAspect", None)
          param.asAdmin(Post("/v0/aspects", aspect)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordWithValue1 = Record("withValue1", "withValue1", Map("exampleAspect" -> JsObject("value" -> JsString("correct"))), tenantId = Some(tenant_1))
          param.asAdmin(Post("/v0/records", recordWithValue1)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordWithValue2 = Record("withValue2", "withValue2", Map("exampleAspect" -> JsObject("value" -> JsString("correct"))), tenantId = Some(tenant_1))
          param.asAdmin(Post("/v0/records", recordWithValue2)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordWithoutValue = Record("withoutValue", "withoutValue", Map("exampleAspect" -> JsObject("value" -> JsString("incorrect"))))
          param.asAdmin(Post("/v0/records", recordWithoutValue)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get("/v0/records?aspectQuery=exampleAspect.value:correct&aspect=exampleAspect") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 2
            page.records.head shouldBe recordWithValue1
            page.records(1) shouldBe recordWithValue2
          }

          Get("/v0/records/count?aspectQuery=exampleAspect.value:correct&aspect=exampleAspect") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 2
          }
        }

        it("works without specifying the aspect in aspects or optionalAspects") { param =>
          val aspect = AspectDefinition("exampleAspect", "exampleAspect", None)
          param.asAdmin(Post("/v0/aspects", aspect)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordWithValue1 = Record("withValue1", "withValue1", Map("exampleAspect" -> JsObject("value" -> JsString("correct"))))
          param.asAdmin(Post("/v0/records", recordWithValue1)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordWithValue2 = Record("withValue2", "withValue2", Map("exampleAspect" -> JsObject("value" -> JsString("correct"))))
          param.asAdmin(Post("/v0/records", recordWithValue2)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordWithoutValue = Record("withoutValue", "withoutValue", Map("exampleAspect" -> JsObject("value" -> JsString("incorrect"))))
          param.asAdmin(Post("/v0/records", recordWithoutValue)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get("/v0/records?aspectQuery=exampleAspect.value:correct") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 2
            page.records.head.id shouldBe "withValue1"
            page.records(1).id shouldBe "withValue2"
          }

          Get("/v0/records/count?aspectQuery=exampleAspect.value:correct") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 2
          }
        }

        it("works for deep paths") { param =>
          val aspect = AspectDefinition("exampleAspect", "exampleAspect", None)
          param.asAdmin(Post("/v0/aspects", aspect)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordWithValue1 = Record("withValue1", "withValue1", Map("exampleAspect" -> JsObject("object" -> JsObject("value" -> JsString("correct")))), tenantId = Some(tenant_1))
          param.asAdmin(Post("/v0/records", recordWithValue1)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordWithValue2 = Record("withValue2", "withValue2", Map("exampleAspect" -> JsObject("object" -> JsObject("value" -> JsString("correct")))), tenantId = Some(tenant_1))
          param.asAdmin(Post("/v0/records", recordWithValue2)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordWithoutValue = Record("withoutValue", "withoutValue", Map("exampleAspect" -> JsObject("object" -> JsObject("value" -> JsString("incorrect")))))
          param.asAdmin(Post("/v0/records", recordWithoutValue)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get("/v0/records?aspectQuery=exampleAspect.object.value:correct&aspect=exampleAspect") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 2
            page.records.head shouldBe recordWithValue1
            page.records(1) shouldBe recordWithValue2
          }

          Get("/v0/records/count?aspectQuery=exampleAspect.object.value:correct&aspect=exampleAspect") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 2
          }
        }

        it("works as AND when multiple queries specified") { param =>
          val aspect = AspectDefinition("exampleAspect", "exampleAspect", None)
          param.asAdmin(Post("/v0/aspects", aspect)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordWithValue1 = Record("withValue1", "withValue1", Map("exampleAspect" -> JsObject("value" -> JsString("correct"), "otherValue" -> JsString("alsoCorrect"))), tenantId = Some(tenant_1))
          param.asAdmin(Post("/v0/records", recordWithValue1)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordWithValue2 = Record("withValue2", "withValue2", Map("exampleAspect" -> JsObject("value" -> JsString("correct"), "otherValue" -> JsString("alsoCorrect"))), tenantId = Some(tenant_1))
          param.asAdmin(Post("/v0/records", recordWithValue2)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordWithoutValue = Record("withoutValue", "withoutValue", Map("exampleAspect" -> JsObject("value" -> JsString("correct"))))
          param.asAdmin(Post("/v0/records", recordWithoutValue)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get("/v0/records?aspectQuery=exampleAspect.value:correct&aspectQuery=exampleAspect.otherValue:alsoCorrect&aspect=exampleAspect") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 2
            page.records.head shouldBe recordWithValue1
            page.records(1) shouldBe recordWithValue2
          }

          Get("/v0/records/count?aspectQuery=exampleAspect.value:correct&aspectQuery=exampleAspect.otherValue:alsoCorrect&aspect=exampleAspect") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe 2
          }
        }

        it("allows url encoded paths and values") { param =>
          val aspect = AspectDefinition("example Aspect", "example Aspect", None)
          param.asAdmin(Post("/v0/aspects", aspect)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordWithValue = Record("withValue", "withValue", Map("example Aspect" -> JsObject("&value" -> JsString("/correct"))), tenantId = Some(tenant_1))
          param.asAdmin(Post("/v0/records", recordWithValue)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val recordWithoutValue = Record("withoutValue", "withoutValue", Map("example Aspect" -> JsObject("value" -> JsString("incorrect"))))
          param.asAdmin(Post("/v0/records", recordWithoutValue)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          Get("/v0/records?aspectQuery=example%20Aspect.%26value:%2Fcorrect&aspect=example%20Aspect") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val page = responseAs[RecordsPage[Record]]
            page.records.length shouldBe 1
            page.records.head shouldBe recordWithValue
          }

          Get("/v0/records/count?aspectQuery=example%20Aspect.%26value:%2Fcorrect&aspect=example%20Aspect") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
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
          it("honors the limit parameter") { param =>
            val aspectDefinition = AspectDefinition("test", "test", None)
            param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }

            for (i <- 1 to 5) {
              val record = Record(i.toString, i.toString, Map("test" -> JsObject("value" -> JsNumber(i))))
              param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK
              }
            }

            Get(s"/v0/records${path}limit=2") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage[RecordType]]
              page.records.length shouldBe 2
              page.records.head.name shouldBe "1"
              page.records(1).name shouldBe "2"
            }
          }

          it("honors the start parameter") { param =>
            val aspectDefinition = AspectDefinition("test", "test", None)
            param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }

            for (i <- 1 to 5) {
              val record = Record(i.toString, i.toString, Map("test" -> JsObject("value" -> JsNumber(i))))
              param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK
              }
            }

            Get(s"/v0/records${path}start=3&limit=2") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage[RecordType]]
              page.records.length shouldBe 2
              page.records.head.name shouldBe "4"
              page.records(1).name shouldBe "5"
            }
          }

          it("pageTokens can be used to page through results") { param =>
            val aspectDefinition = AspectDefinition("test", "test", None)
            param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }

            for (i <- 1 to 5) {
              val record = Record(i.toString, i.toString, Map("test" -> JsObject("value" -> JsNumber(i))))
              param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK
              }
            }

            var currentPage = Get(s"/v0/records${path}limit=2") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage[RecordType]]
              page.records.length shouldBe 2
              page.records.head.name shouldBe "1"
              page.records(1).name shouldBe "2"
              page
            }

            currentPage =
              Get(s"/v0/records${path}pageToken=${currentPage.nextPageToken.get}&limit=2") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
                status shouldEqual StatusCodes.OK
                val page = responseAs[RecordsPage[RecordType]]
                page.records.length shouldBe 2
                page.records.head.name shouldBe "3"
                page.records(1).name shouldBe "4"
                page
              }

            currentPage = Get(s"/v0/records${path}pageToken=${currentPage.nextPageToken.get}&limit=2") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage[RecordType]]
              page.records.length shouldBe 1
              page.records.head.name shouldBe "5"
              page
            }
          }

          it("provides hasMore correctly") { param =>
            val aspectDefinition = AspectDefinition("test", "test", None)
            param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
              status shouldEqual StatusCodes.OK
            }

            for (i <- 1 to 5) {
              val record = Record(i.toString, i.toString, Map("test" -> JsObject("value" -> JsNumber(i))))
              param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
                status shouldEqual StatusCodes.OK
              }
            }

            Get(s"/v0/records${path}start=0&limit=4") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage[RecordType]]
              page.hasMore shouldBe true
              page.nextPageToken.isDefined shouldBe true
            }

            Get(s"/v0/records${path}start=0&limit=5") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage[RecordType]]
              page.hasMore shouldBe false
              page.nextPageToken.isDefined shouldBe false
            }

            Get(s"/v0/records${path}start=0&limit=6") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage[RecordType]]
              page.hasMore shouldBe false
              page.nextPageToken.isDefined shouldBe false
            }

            Get(s"/v0/records${path}start=3&limit=1") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage[RecordType]]
              page.hasMore shouldBe true
              page.nextPageToken.isDefined shouldBe true
            }

            Get(s"/v0/records${path}start=4&limit=1") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.OK
              val page = responseAs[RecordsPage[RecordType]]
              page.hasMore shouldBe false
              page.nextPageToken.isDefined shouldBe false
            }

            Get(s"/v0/records${path}start=5&limit=1") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
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

        val valuesToTest = Seq(TestValues(0, 0), TestValues(1, 1), TestValues(1, 5), TestValues(2, 10), TestValues(5, 5), TestValues(10, 2))

        describe("generates correct page tokens") {
          describe("without aspect filtering") {
            valuesToTest.foreach {
              case TestValues(pageSize, recordCount) =>
                it(s"for pageSize $pageSize and recordCount $recordCount") { param =>
                  // Add an aspect for our records
                  val aspectDefinition = AspectDefinition("test", "test", None)
                  param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
                    status shouldEqual StatusCodes.OK
                  }

                  // Add some records
                  if (recordCount > 0) {
                    for (i <- 1 to recordCount) {
                      val record = Record(i.toString, i.toString, Map("test" -> JsObject("value" -> JsNumber(i))))
                      param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
                        status shouldEqual StatusCodes.OK
                      }
                    }
                  }

                  // Get the page tokens
                  Get(s"/v0/records/pagetokens?limit=$pageSize") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
                    status shouldEqual StatusCodes.OK
                    val pageTokens = responseAs[List[String]]
                    pageTokens.length shouldBe recordCount / Math.max(1, pageSize) + 1

                    // For each page token, GET the corresponding /records page and make sure it has the correct records.
                    for (pageIndex <- pageTokens.indices) {
                      val token = pageTokens(pageIndex)

                      Get(s"/v0/records?pageToken=$token&limit=$pageSize") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
                        status shouldEqual StatusCodes.OK
                        val page = responseAs[RecordsPage[Record]]

                        for (recordNumber <- page.records.indices) {
                          page.records(recordNumber).name shouldEqual (pageIndex * pageSize + recordNumber + 1).toString
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
                it(s"for pageSize $pageSize and recordCount $recordCount") { param =>
                  // Insert two aspects
                  for (aspectNumber <- 1 to 2) {
                    val aspectDefinition = AspectDefinition(aspectNumber.toString, aspectNumber.toString, None)
                    param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
                      status shouldEqual StatusCodes.OK

                      // Insert $recordCount records for each aspect
                      if (recordCount > 0) {
                        for (i <- 1 to recordCount) {
                          val record = Record(aspectNumber + i.toString, i.toString, Map(aspectNumber.toString -> JsObject("value" -> JsNumber(i))))
                          param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
                            status shouldEqual StatusCodes.OK
                          }
                        }
                      }
                    }
                  }

                  // Filter by each aspect and make sure that the tokens returned match up with their respective GET /records results.
                  for (aspectNumber <- 1 to 2) {
                    Get(s"/v0/records/pagetokens?limit=$pageSize&aspect=$aspectNumber") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
                      status shouldEqual StatusCodes.OK
                      val pageTokens = responseAs[List[String]]
                      pageTokens.length shouldEqual recordCount / Math.max(1, pageSize) + 1

                      for (pageIndex <- pageTokens.indices) {
                        val token = pageTokens(pageIndex)

                        Get(s"/v0/records?pageToken=$token&limit=$pageSize&aspect=$aspectNumber") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
                          status shouldEqual StatusCodes.OK
                          val page = responseAs[RecordsPage[Record]]

                          for (recordNumber <- page.records.indices) {
                            page.records(recordNumber).name shouldEqual (pageIndex * pageSize + recordNumber + 1).toString
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
                it(s"for pageSize $pageSize and recordCount $recordCount") { param =>
                  // Insert some aspects
                  val aspectIds = for (aspectNumber <- 1 to 2) yield aspectNumber.toString
                  aspectIds.foreach { aspectNumber =>
                    val aspectDefinition = AspectDefinition(aspectNumber, aspectNumber, None)
                    param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
                      status shouldEqual StatusCodes.OK
                    }
                  }

                  // Insert some records that have both aspects
                  if (recordCount > 0) {
                    for (i <- 1 to recordCount) {
                      val aspectValues = aspectIds.map(id => id -> JsObject("value" -> JsNumber(i)))
                      val record = Record(i.toString, i.toString, aspectValues.toMap)
                      param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
                        status shouldEqual StatusCodes.OK
                      }
                    }
                  }

                  // Insert some records that have only one aspect
                  aspectIds.foreach { aspectId =>
                    for (i <- 1 to recordCount) {
                      val record = Record(aspectId + i.toString, i.toString, Map(aspectId -> JsObject("value" -> JsNumber(i))))
                      param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(Full).routes ~> check {
                        status shouldEqual StatusCodes.OK
                      }
                    }
                  }

                  // Check that pagetokens while filtering for both aspects only returns the records with both, not the
                  // records with one or the other.
                  Get(s"/v0/records/pagetokens?limit=$pageSize&${aspectIds.map(id => "aspect=" + id).mkString("&")}") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
                    status shouldEqual StatusCodes.OK
                    val pageTokens = responseAs[List[String]]
                    pageTokens.length shouldEqual recordCount / Math.max(1, pageSize) + 1

                    for (pageIndex <- pageTokens.indices) {
                      val token = pageTokens(pageIndex)

                      Get(s"/v0/records?pageToken=$token&limit=$pageSize&${aspectIds.map(id => "aspect=" + id).mkString("&")}") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
                        status shouldEqual StatusCodes.OK
                        val page = responseAs[RecordsPage[Record]]

                        for (recordNumber <- page.records.indices) {
                          page.records(recordNumber).name shouldEqual (pageIndex * pageSize + recordNumber + 1).toString
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

  def writeTests(role: Role) {
    describe("POST") {
      it("can add a new record") { param =>
        val record = Record("testId", "testName", Map(), Some("tag"))
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record.copy(tenantId = Some(tenant_1))
        }

        Get("/v0/records/testId") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK

          val recordRes = responseAs[Record]
          recordRes shouldEqual record.copy(tenantId = Some(tenant_1))
        }

        Get("/v0/records/testId") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it("can add two new records with the same record IDs by different tenants") { param =>
        val record_1 = Record("aRecordId", "a default tenant", Map(), Some("tag"))
        param.asAdmin(Post("/v0/records", record_1)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record_1.copy(tenantId = Some(tenant_1))
        }


        val record_2 = Record("aRecordId", "a new tenant", Map(), Some("tag"))
        param.asAdmin(Post("/v0/records", record_2)) ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record_2.copy(tenantId = Some(tenant_2))
        }

        Get("/v0/records/aRecordId") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK

          val recordRes = responseAs[Record]
          recordRes shouldEqual record_1.copy(tenantId = Some(tenant_1))
        }

        Get("/v0/records/aRecordId") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK

          val recordRes = responseAs[Record]
          recordRes shouldEqual record_2.copy(tenantId = Some(tenant_2))
        }
      }

      it("sets sourcetag to NULL by default") { param =>
        val record = Record("testId", "testName", Map(), None)
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record.copy(tenantId = Some(tenant_1))
        }

        Get("/v0/records/testId") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK

          val recordRes = responseAs[Record]
          recordRes shouldEqual record.copy(tenantId = Some(tenant_1))
        }

        Get("/v0/records/testId") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it("supports invalid URL characters in ID") { param =>
        val record = Record("in valid", "testName", Map())
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record.copy(tenantId = Some(tenant_1))
        }

        Get("/v0/records/in%20valid") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record("in valid", "testName", Map(), tenantId = Some(tenant_1))
        }

        Get("/v0/records/in%20valid") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it("returns 400 if a record with the given ID already exists") { param =>
        val record = Record("testId", "testName", Map())
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record.copy(tenantId = Some(tenant_1))
        }

        val updated = record.copy(name = "foo")
        param.asAdmin(Post("/v0/records", updated)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          responseAs[BadRequest].message should include("already exists")
        }

        param.asAdmin(Post("/v0/records", updated)) ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }
      }

      checkMustBeAdmin(role) {
        val record = Record("testId", "testName", Map())
        Post("/v0/records", record)
      }
    }

    describe("PUT") {
      it("can add a new record") { param =>
        val record = Record("testId", "testName", Map())
        param.asAdmin(Put("/v0/records/testId", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record.copy( tenantId = Some(tenant_1))
        }

        Get("/v0/records") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK

          val recordsPage = responseAs[RecordsPage[Record]]
          recordsPage.records.length shouldEqual 1
          recordsPage.records.head shouldEqual record.copy( tenantId = Some(tenant_1))
        }

        Get("/v0/records") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          val recordsPage = responseAs[RecordsPage[Record]]
          recordsPage.records.length shouldEqual 0
        }
      }

      it("can update an existing record") { param =>
        val record = Record("testId", "testName", Map(), tenantId = Some(tenant_1))
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val newRecord = record.copy(name = "newName")
        param.asAdmin(Put("/v0/records/testId", newRecord)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual newRecord.copy(tenantId = Some(tenant_1))
        }

        param.asAdmin(Put("/v0/records/testId", newRecord)) ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual newRecord.copy(tenantId = Some(tenant_2))
        }

        Get("/v0/records/testId") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record("testId", "newName", Map(), tenantId = Some(tenant_1))
        }

        Get("/v0/records/testId") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record("testId", "newName", Map(), tenantId = Some(tenant_2))
        }
      }

      it("updates the sourcetag of an otherwise identical record without generating events") { param =>
        val record = Record("testId", "testName", Map(), Some("tag1"))
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        Get(s"/v0/records/${record.id}/history") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[EventsPage].events.length shouldEqual 1
        }

        Get(s"/v0/records/${record.id}/history") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[EventsPage].events.length shouldEqual 0
        }

        val newRecord = record.copy(sourceTag = Some("tag2"))
        param.asAdmin(Put("/v0/records/testId", newRecord)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual newRecord.copy(tenantId = Some(tenant_1))
        }

        param.asAdmin(Put("/v0/records/testId", newRecord)) ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual newRecord.copy(tenantId = Some(tenant_2))
        }

        Get("/v0/records/testId") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record].sourceTag shouldEqual Some("tag2")
        }

        Get(s"/v0/records/${record.id}/history") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[EventsPage].events.length shouldEqual 1
        }

        Get("/v0/records/testId") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual newRecord.copy(tenantId = Some(tenant_2))
        }

        Get(s"/v0/records/${record.id}/history") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[EventsPage].events.length shouldEqual 1
        }
      }

      it("cannot change the ID of an existing record") { param =>
        val record = Record("testId", "testName", Map())
        param.asAdmin(Put("/v0/records/testId", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record.copy(tenantId = Some(tenant_1))
        }

        val updated = record.copy(id = "foo")
        param.asAdmin(Put("/v0/records/testId", updated)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          responseAs[BadRequest].message should include("does not match the record")
        }

        param.asAdmin(Put("/v0/records/testId", updated)) ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
        }
      }

      it("supports invalid URL characters in ID") { param =>
        val record = Record("in valid", "testName", Map())
        param.asAdmin(Put("/v0/records/in%20valid", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record.copy(tenantId = Some(tenant_1))
        }

        Get("/v0/records/in%20valid") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record.copy(tenantId = Some(tenant_1))
        }
      }

      it("can add an aspect") { param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map())
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val updated = record.copy(aspects = Map("test" -> JsObject()))
        param.asAdmin(Put("/v0/records/testId", updated)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual updated.copy(tenantId = Some(tenant_1))
        }

        Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual updated.copy(tenantId = Some(tenant_1))
        }
      }

      it("can modify an aspect") { param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))))
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val updated = record.copy(aspects = Map("test" -> JsObject("foo" -> JsString("baz"))))
        param.asAdmin(Put("/v0/records/testId", updated)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual updated.copy(tenantId = Some(tenant_1))
        }

        Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual updated.copy(tenantId = Some(tenant_1))
        }
      }

      it("does not remove aspects simply because they're missing from the PUT payload") { param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))))
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        // TODO: the PUT should return the real record, not just echo back what the user provided.
        //       i.e. the aspects should be included.  I think.
        val updated = record.copy(aspects = Map())
        param.asAdmin(Put("/v0/records/testId", updated)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual updated.copy(tenantId = Some(tenant_1))
        }

        Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual record.copy(tenantId = Some(tenant_1))
        }
      }

      checkMustBeAdmin(role) {
        val record = Record("testId", "testName", Map())
        Put("/v0/records/testId", record)
      }
    }

    describe("PATCH") {
      it("returns an error when the record does not exist") { param =>
        val patch = JsonPatch()
        param.asAdmin(Patch("/v0/records/doesnotexist", patch)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          responseAs[BadRequest].message should include("exists")
          responseAs[BadRequest].message should include("ID")
        }
      }

      it("can modify a record's name") { param =>
        val record = Record("testId", "testName", Map())
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val patch = JsonPatch(Replace(Pointer.root / "name", JsString("foo")))
        param.asAdmin(Patch("/v0/records/testId", patch)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record("testId", "foo", Map(), tenantId = Some(tenant_1))
        }

        param.asAdmin(Patch("/v0/records/testId", patch)) ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
        }

        Get("/v0/records/testId") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record("testId", "foo", Map(), tenantId = Some(tenant_1))
        }

        Get("/v0/records/testId") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it("cannot modify a record's ID") { param =>
        val record = Record("testId", "testName", Map())
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val patch = JsonPatch(Replace(Pointer.root / "id", JsString("foo")))
        param.asAdmin(Patch("/v0/records/testId", patch)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          responseAs[BadRequest].message should include("ID")
        }
      }

      it("can add an aspect") { param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map())
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val patch = JsonPatch(Add(Pointer.root / "aspects" / "test", JsObject()))
        param.asAdmin(Patch("/v0/records/testId", patch)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject()), tenantId = Some(tenant_1))
        }

        param.asAdmin(Patch("/v0/records/testId", patch)) ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
        }

        Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject()), tenantId = Some(tenant_1))
        }

        Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it("can modify an aspect") { param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))))
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val patch = JsonPatch(Replace(Pointer.root / "aspects" / "test" / "foo", JsString("baz")))
        param.asAdmin(Patch("/v0/records/testId", patch)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("baz"))), tenantId = Some(tenant_1))
        }

        param.asAdmin(Patch("/v0/records/testId", patch)) ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
        }

        Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("baz"))), tenantId = Some(tenant_1))
        }

        Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it("can add a new property to an aspect") { param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))))
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val patch = JsonPatch(Add(Pointer.root / "aspects" / "test" / "newprop", JsString("test")))
        param.asAdmin(Patch("/v0/records/testId", patch)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"), "newprop" -> JsString("test"))), tenantId = Some(tenant_1))
        }

        param.asAdmin(Patch("/v0/records/testId", patch)) ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
        }

        Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"), "newprop" -> JsString("test"))), tenantId = Some(tenant_1))
        }

        Get("/v0/records/testId?aspect=test") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it("can remove an aspect") { param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))))
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val patch = JsonPatch(Remove(Pointer.root / "aspects" / "test"))
        param.asAdmin(Patch("/v0/records/testId", patch)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record("testId", "testName", Map(), tenantId = Some(tenant_1))
        }

        param.asAdmin(Patch("/v0/records/testId", patch)) ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
        }

        Get("/v0/records/testId?optionalAspect=test") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record("testId", "testName", Map(), tenantId = Some(tenant_1))
        }

        Get("/v0/records/testId?optionalAspect=test") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it("can remove a property from an aspect") { param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"), "newprop" -> JsString("test"))))
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val patch = JsonPatch(Remove(Pointer.root / "aspects" / "test" / "newprop"))
        param.asAdmin(Patch("/v0/records/testId", patch)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))), tenantId = Some(tenant_1))
        }

        param.asAdmin(Patch("/v0/records/testId", patch)) ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
        }

        Get("/v0/records/testId?optionalAspect=test") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))), tenantId = Some(tenant_1))
        }

        Get("/v0/records/testId?optionalAspect=test") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it("supports Move within an aspect") { param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))))
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val patch = JsonPatch(Move(Pointer.root / "aspects" / "test" / "foo", Pointer.root / "aspects" / "test" / "bar"))
        param.asAdmin(Patch("/v0/records/testId", patch)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("bar" -> JsString("bar"))), tenantId = Some(tenant_1))
        }

        param.asAdmin(Patch("/v0/records/testId", patch)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
        }

        Get("/v0/records/testId?optionalAspect=test") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("bar" -> JsString("bar"))), tenantId = Some(tenant_1))
        }

        Get("/v0/records/testId?optionalAspect=test") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it("supports Copy within an aspect") { param =>
        val aspectDefinition = AspectDefinition("test", "test", None)
        param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"))))
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val patch = JsonPatch(Copy(Pointer.root / "aspects" / "test" / "foo", Pointer.root / "aspects" / "test" / "bar"))
        param.asAdmin(Patch("/v0/records/testId", patch)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"), "bar" -> JsString("bar"))), tenantId = Some(tenant_1))
        }

        param.asAdmin(Patch("/v0/records/testId", patch)) ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
        }

        Get("/v0/records/testId?optionalAspect=test") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record("testId", "testName", Map("test" -> JsObject("foo" -> JsString("bar"), "bar" -> JsString("bar"))), tenantId = Some(tenant_1))
        }

        Get("/v0/records/testId?optionalAspect=test") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.NotFound
        }
      }

      it("evaluates Test operations") { param =>
        val A = AspectDefinition("A", "A", None)
        param.asAdmin(Post("/v0/aspects", A)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar"))))
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val patchSuccess = JsonPatch(Test(Pointer.root / "aspects" / "A" / "foo", JsString("bar")))
        param.asAdmin(Patch("/v0/records/testId", patchSuccess)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Record] shouldEqual Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar"))), tenantId = Some(tenant_1))
        }

        param.asAdmin(Patch("/v0/records/testId", patchSuccess)) ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
        }

        val patchFail = JsonPatch(Test(Pointer.root / "aspects" / "A" / "foo", JsString("not this value")))
        param.asAdmin(Patch("/v0/records/testId", patchFail)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          responseAs[BadRequest].message should include("test failed")
        }
      }

      it("does not support Move between aspects") { param =>
        val A = AspectDefinition("A", "A", None)
        param.asAdmin(Post("/v0/aspects", A)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val B = AspectDefinition("B", "B", None)
        param.asAdmin(Post("/v0/aspects", B)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject()))
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val patch = JsonPatch(Move(Pointer.root / "aspects" / "A" / "foo", Pointer.root / "aspects" / "B" / "foo"))
        param.asAdmin(Patch("/v0/records/testId", patch)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          responseAs[BadRequest].message should include("two different aspects")
        }
      }

      it("does not support Copy between aspects") { param =>
        val A = AspectDefinition("A", "A", None)
        param.asAdmin(Post("/v0/aspects", A)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val B = AspectDefinition("B", "B", None)
        param.asAdmin(Post("/v0/aspects", B)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val record = Record("testId", "testName", Map("A" -> JsObject("foo" -> JsString("bar")), "B" -> JsObject()))
        param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
        }

        val patch = JsonPatch(Copy(Pointer.root / "aspects" / "A" / "foo", Pointer.root / "aspects" / "B" / "foo"))
        param.asAdmin(Patch("/v0/records/testId", patch)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.BadRequest
          responseAs[BadRequest].message should include("two different aspects")
        }
      }

      checkMustBeAdmin(role) {
        val patch = JsonPatch(Replace(Pointer.root / "name", JsString("foo")))
        Patch("/v0/records/testId", patch)
      }
    }

    describe("DELETE") {
      describe("by id") {
        it("can delete a record without any aspects") { param =>
          val record = Record("without", "without", Map())
          param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          param.asAdmin(Delete("/v0/records/without")) ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[DeleteResult].deleted shouldBe false
          }

          param.asAdmin(Delete("/v0/records/without")) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[DeleteResult].deleted shouldBe true
          }
        }

        it("returns 200 and deleted=false when asked to delete a record that doesn't exist") { param =>
          param.asAdmin(Delete("/v0/records/doesnotexist")) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[DeleteResult].deleted shouldBe false
          }
        }

        it("can delete a record with an aspect") { param =>
          val aspectDefinition = AspectDefinition("test", "test", None)
          param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val record = Record("with", "with", Map("test" -> JsObject()))
          param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          param.asAdmin(Delete("/v0/records/with")) ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[DeleteResult].deleted shouldBe false
          }

          param.asAdmin(Delete("/v0/records/with")) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[DeleteResult].deleted shouldBe true
          }
        }

        checkMustBeAdmin(role) {
          Delete("/v0/records/without")
        }
      }

      describe("based on a source tag") {

        def buildAspects(id: String) = {
          Map("source" -> JsObject(Map[String, JsValue]("id" -> JsString(id), "name" -> JsString("name"), "url" -> JsString("http://example.com"), "type" -> JsString("fake"))))
        }

        it("deletes only records with the correct source and without the specified tag") { param =>
          val junitFile = new java.io.File("../magda-registry-aspects/source.schema.json").getCanonicalFile
          val commandLineFile = new java.io.File("./magda-registry-aspects/source.schema.json").getCanonicalFile

          val file = if (junitFile.exists) junitFile else commandLineFile
          val source = scala.io.Source.fromFile(file)
          val lines = try source.mkString finally source.close()

          val aspectDefinition = AspectDefinition("source", "source", Some(lines.parseJson.asJsObject))
          param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val noTagNoSource = Record("notag-nosource", "name", Map())
          val noTagWrongSource = Record("notag-wrongsource", "name", buildAspects("wrong"))
          val noTagRightSource = Record("notag-rightsource", "name", buildAspects("right"))

          val wrongTagNoSource = Record("wrongtag-nosource", "name", Map(), Some("wrongtag"))
          val wrongTagWrongSource = Record("wrongtag-wrongsource", "name", buildAspects("wrong"), Some("wrongtag"))
          val wrongTagRightSource = Record("wrongtag-rightsource", "name", buildAspects("right"), Some("wrongtag"))

          val rightTagNoSource = Record("righttag-nosource", "name", Map(), Some("righttag"))
          val rightTagWrongSource = Record("righttag-wrongsource", "name", buildAspects("wrong"), Some("righttag"))

          val rightTagRightSource1 = Record("righttag-rightsource", "name", buildAspects("right"), Some("righttag"))

          val all = List(noTagNoSource, noTagWrongSource, noTagRightSource, wrongTagNoSource, wrongTagWrongSource,
            wrongTagRightSource, rightTagNoSource, rightTagWrongSource, rightTagRightSource1)

          all.foreach(record => param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
          })

          Get("/v0/records") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val res = responseAs[RecordsPage[Record]]
            res.records.length shouldEqual all.length
          }

          Get("/v0/records") ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val res = responseAs[RecordsPage[Record]]
            res.records.length shouldEqual 0
          }

          param.asAdmin(Delete("/v0/records?sourceTagToPreserve=righttag&sourceId=right")) ~> addTenantIdHeader(tenant_2) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[MultipleDeleteResult].count shouldEqual 0
          }

          param.asAdmin(Delete("/v0/records?sourceTagToPreserve=righttag&sourceId=right")) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[MultipleDeleteResult].count shouldEqual 2
          }

          Get("/v0/records") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val res = responseAs[RecordsPage[Record]]
            res.records.length shouldEqual (all.length - 2)
            res.records.count(record => record.id == "wrongtag-rightsource") shouldEqual 0
            res.records.count(record => record.id == "notag-rightsource") shouldEqual 0
          }

          List("wrongtag-rightsource", "notag-rightsource").foreach { recordId =>
            Get(s"/v0/records/$recordId") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.NotFound
            }

            Get(s"/v0/records/$recordId/history") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
              status shouldEqual StatusCodes.OK
              val res = responseAs[EventsPage]

              val deleteRecordEvents = res.events.filter(event => event.eventType == EventType.DeleteRecord)

              deleteRecordEvents.length shouldEqual 1
              val deletedRecordEvent = deleteRecordEvents.head.data.convertTo[Map[String, JsValue]]
              deletedRecordEvent("recordId") shouldEqual JsString(recordId)

              val deleteRecordAspectEvents = res.events.filter(event => event.eventType == EventType.DeleteRecordAspect)
              deleteRecordAspectEvents.length shouldEqual 1
              val deletedRecordAspectEvent = deleteRecordAspectEvents.head.data.convertTo[Map[String, JsValue]]
              deletedRecordAspectEvent("recordId") shouldEqual JsString(recordId)
              deletedRecordAspectEvent("aspectId") shouldEqual JsString("source")
            }
          }
        }

        it("returns Accepted HTTP code if delete is taking too long") { param =>
          val mockedRecordPersistence = mock[RecordPersistence]
          val mockedApi = new RecordsService(param.api(role).config, param.webHookActor, param.authClient, system, materializer, mockedRecordPersistence)

          (mockedRecordPersistence.trimRecordsBySource(_: String, _: String, _: BigInt, _: Option[LoggingAdapter])(_: DBSession)).expects(*, *, *, *, *).onCall { (_: String, _: String, _: BigInt, _: Option[LoggingAdapter], _: DBSession) =>
            Thread.sleep(600)
            Success(1)
          }

          param.asAdmin(Delete("?sourceTagToPreserve=righttag&sourceId=right")) ~> addTenantIdHeader(tenant_1) ~> mockedApi.route ~> check {
            status shouldEqual StatusCodes.Accepted
          }
        }

        it("returns HTTP 200 if there's nothing to delete") { param =>

          val junitFile = new java.io.File("../magda-registry-aspects/source.schema.json").getCanonicalFile
          val commandLineFile = new java.io.File("./magda-registry-aspects/source.schema.json").getCanonicalFile

          val file = if (junitFile.exists) junitFile else commandLineFile
          val source = scala.io.Source.fromFile(file)
          val lines = try source.mkString finally source.close()

          val aspectDefinition = AspectDefinition("source", "source", Some(lines.parseJson.asJsObject))
          param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
          }

          val rightTagRightSource1 = Record("righttag-rightsource", "name", buildAspects("right"), Some("righttag"))

          val all = List(rightTagRightSource1)

          all.foreach(record => param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
          })

          Get("/v0/records") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val res = responseAs[RecordsPage[Record]]
            res.records.length shouldEqual all.length
          }

          param.asAdmin(Delete("/v0/records?sourceTagToPreserve=righttag&sourceId=right")) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[MultipleDeleteResult].count shouldEqual 0
          }

          Get("/v0/records") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK
            val res = responseAs[RecordsPage[Record]]
            res.records.length shouldEqual 1
            res.records.count(record => record.id == "righttag-rightsource") shouldEqual 1
          }

        }

        checkMustBeAdmin(role) {
          Delete("/v0/records?sourceTagToPreserve=blah&sourceId=blah2")
        }
      }
    }
  }
}
