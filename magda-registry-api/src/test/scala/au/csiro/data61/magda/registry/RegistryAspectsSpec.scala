package au.csiro.data61.magda.registry

import akka.http.scaladsl.model.StatusCodes
import au.csiro.data61.magda.model.Registry.{AspectDefinition, Record}
import spray.json.{JsObject, JsonParser}

import scala.io.BufferedSource
import scala.io.Source.fromFile

class RegistryAspectsSpec extends ApiSpec {
  val registryAspectsPath = "magda-registry-aspects"
  val testDataPath = "magda-registry-api/src/test/resources/data"

  private def createAspectDefinition(
      schemaFile: String,
      aspectId: String,
      description: String = "a test aspect"
  ): AspectDefinition = {

    val aspectSchemaSrc: BufferedSource = fromFile(
      schemaFile
    )

    val aspectSchema: String =
      try {
        aspectSchemaSrc.mkString
      } finally {
        aspectSchemaSrc.close()
      }

    AspectDefinition(
      aspectId,
      description,
      Some(JsonParser(aspectSchema).asJsObject)
    )
  }

  private def createRecord(recordFilename: String): Record = {
    val recordSrc = fromFile(
      recordFilename
    )

    val recordsJsonStr: String = try {
      recordSrc.mkString
    } finally {
      recordSrc.close()
    }

    JsonParser(recordsJsonStr).convertTo[Record]
  }

  it("should add esri-access-control aspect to a record") { param =>
    val aspectId = "esri-access-control"
    val aspectSchemaFilename =
      s"$registryAspectsPath/esri-access-control.schema.json"
    val aspectDef = createAspectDefinition(aspectSchemaFilename, aspectId)
    param.asAdmin(Post("/v0/aspects", aspectDef)) ~> addTenantIdHeader(TENANT_1) ~> param
      .api(Full)
      .routes ~> check {
      status shouldEqual StatusCodes.OK
      responseAs[AspectDefinition] shouldEqual aspectDef
    }

    Get(s"/v0/aspects/$aspectId") ~> addTenantIdHeader(TENANT_1) ~> param
      .api(Full)
      .routes ~> check {
      status shouldEqual StatusCodes.OK
      responseAs[Option[AspectDefinition]].get shouldEqual aspectDef
    }

    val recordFilename =
      s"$testDataPath/test-record-with-esri-access-control.json"
    val record = createRecord(recordFilename)
    param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(TENANT_1) ~> param
      .api(Full)
      .routes ~> check {
      status shouldEqual StatusCodes.OK
      responseAs[Record] shouldEqual record.copy(tenantId = Some(TENANT_1))
    }

    Get(s"/v0/records/${record.id}?aspect=$aspectId") ~> addTenantIdHeader(
      TENANT_1
    ) ~> param.api(Full).routes ~> check {
      status shouldEqual StatusCodes.OK
      responseAs[Record]
        .aspects(`aspectId`)
        .fields("groups")
        .convertTo[List[String]] shouldBe List("G1", "G2")
    }

    Get(s"/v0/records/${record.id}/aspects/$aspectId") ~> addTenantIdHeader(
      TENANT_1
    ) ~> param.api(Full).routes ~> check {
      status shouldEqual StatusCodes.OK
      responseAs[JsObject]
        .fields("groups")
        .convertTo[List[String]] shouldBe List("G1", "G2")
    }
  }

}
