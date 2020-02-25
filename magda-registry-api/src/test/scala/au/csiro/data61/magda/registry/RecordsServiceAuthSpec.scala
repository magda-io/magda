package au.csiro.data61.magda.registry

import akka.event.LoggingAdapter
import akka.http.scaladsl.model.StatusCodes
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.model.TenantId._
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

class RecordsServiceAuthSpec extends BaseRecordsServiceAuthSpec {
  override def testConfigSource =
    s"""
       |db.default.url = "${databaseUrl}?currentSchema=test"
       |authorization.skip = false
       |authorization.skipOpaQuery = false
    """.stripMargin

  describe("without a default policy set") {
    describe("GET") {
      describe("for a single record") {
        it(
          "if there's no default or specific policy in place, it should deny all access"
        ) { param =>
          addExampleAspectDef(param)
          val recordId = "foo"
          addRecord(
            param,
            Record(
              recordId,
              "foo",
              Map(
                "example" -> JsObject(
                  "nested" -> JsObject("public" -> JsString("true"))
                )
              ),
              authnReadPolicyId = None
            )
          )

          Get(s"/v0/records/foo") ~> addTenantIdHeader(
            TENANT_1
          ) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.NotFound
          }
        }
      }

      commonTests()
    }

  }

}
