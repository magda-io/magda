package au.csiro.data61.magda.registry

import akka.http.scaladsl.model.StatusCodes
import au.csiro.data61.magda.model.Registry.{AspectDefinition, Record}
import spray.json.{JsObject, JsString, JsonParser}

class RecordsServiceWithOpaQuerySpec extends ApiSpec {
  override def beforeAll(): Unit = {

  }

  it("should get records that have no access control aspect by any user") { param =>
    val aspectDefinition = AspectDefinition("test", "test", None)
    param.asAdmin(Post("/v0/aspects", aspectDefinition)) ~> param.api(Full).routes ~> check {
      status shouldEqual StatusCodes.OK
    }

    val jsonSchema =
      """
        |{
        |    "type": "object",
        |    "title": "Access Control information of a dataset",
        |    "$schema": "http://json-schema.org/hyper-schema#",
        |    "properties": {
        |        "ownerId": {
        |            "type": "string",
        |            "title": "the owner id (uuid) of dataset",
        |            "maxLength": 36,
        |            "minLength": 36
        |        },
        |        "orgUnitOwnerId": {
        |            "type": "string",
        |            "title": "the id of the organisation that the dataset belongs to",
        |            "maxLength": 36,
        |            "minLength": 36
        |        },
        |        "preAuthorisedPermissionIds": {
        |            "type": "array",
        |            "items": {
        |                "type": "string",
        |                "maxLength": 36,
        |                "minLength": 36
        |            },
        |            "title": "A collection of permission Ids that are granted to access this dataset"
        |        }
        |    },
        |    "description": "Access Control information of a dataset. Including: ownership information and pre-authorised permissions"
        |}
      """.stripMargin

    val accessControlAspect = AspectDefinition("dataset-access-control", "access control", Some(JsonParser(jsonSchema).asJsObject))

    param.asAdmin(Post("/v0/aspects", accessControlAspect)) ~> param.api(Full).routes ~> check {
      status shouldEqual StatusCodes.OK
    }

    val recordWithAspect = Record("with", "with", Map(
      "test" -> JsObject("foo" -> JsString("bar"))
    ))
    param.asAdmin(Post("/v0/records", recordWithAspect)) ~> param.api(Full).routes ~> check {
      status shouldEqual StatusCodes.OK
    }

    val recordWithoutAspect = Record("without", "without", Map())
    param.asAdmin(Post("/v0/records", recordWithoutAspect)) ~> param.api(Full).routes ~> check {
      status shouldEqual StatusCodes.OK
    }

    Get("/v0/records?aspect=test") ~> param.api(Full).routes ~> check {
      status shouldEqual StatusCodes.OK
      val page = responseAs[RecordsPage[Record]]
      page.records.length shouldBe 1
      page.records(0) shouldBe recordWithAspect
    }

    Get("/v0/records/count?aspect=test") ~> param.api(Full).routes ~> check {
      status shouldEqual StatusCodes.OK
      val countResponse = responseAs[CountResponse]
      countResponse.count shouldBe 1
    }
  }
}
