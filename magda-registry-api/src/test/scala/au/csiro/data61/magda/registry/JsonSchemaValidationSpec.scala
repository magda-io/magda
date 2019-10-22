package au.csiro.data61.magda.registry

import akka.http.scaladsl.model.StatusCodes
import au.csiro.data61.magda.model.Registry._

import spray.json._
import scalikejdbc._
import gnieh.diffson.sprayJson._

class JsonSchemaValidationSpec extends ApiSpec {

  override def testConfigSource =
    s"""
       |db.default.url = "${databaseUrl}?currentSchema=test"
       |authorization.skip = false
       |authorization.skipOpaQuery = true
       |akka.loglevel = debug
       |authApi.baseUrl = "http://localhost:6104"
       |webhooks.actorTickRate=0
       |webhooks.eventPageSize=10
       |akka.test.timefactor=20.0
       |trimBySourceTagTimeoutThreshold=500
       |validateJsonSchema=true
    """.stripMargin


  val testJsonSchema: String =
    """{
       |  "$id": "https://example.com/person.schema.json",
       |  "$schema": "http://json-schema.org/draft-07/schema#",
       |  "title": "Person",
       |  "type": "object",
       |  "properties": {
       |    "firstName": {
       |      "type": "string",
       |      "description": "The person's first name."
       |    },
       |    "lastName": {
       |      "type": "string",
       |      "description": "The person's last name."
       |    },
       |    "age": {
       |      "description": "Age in years which must be equal to or greater than zero.",
       |      "type": "integer",
       |      "minimum": 0
       |    }
       |  },
       |  "required": ["lastName"]
       |}""".stripMargin

  val testValidAspectData: List[String] = List(
    """{
      |  "firstName": "Joe",
      |  "lastName": "Bloggs",
      |  "age": 20
      |}""".stripMargin,
    """{
      |  "lastName": "Bloggs"
      |}""".stripMargin
  )

  val testinvalidAspectData: List[String] = List(
    """{
      |  "firstName": "Joe",
      |  "age": 20
      |}""".stripMargin,
    """{
      |  "firstName": "Joe",
      |  "lastName": "Bloggs",
      |  "age": -2
      |}""".stripMargin,
    """{
      |  "firstName": "Joe",
      |  "lastName": 50,
      |  "age": 20
      |}""".stripMargin,
    """{
      |  "firstName": "Joe",
      |  "lastName": 50,
      |  "age": [20, 1]
      |}""".stripMargin
  )


  val testAspectDef = AspectDefinition(
    id = "test-aspect",
    name = "Test Aspect",
    jsonSchema = Some(testJsonSchema.parseJson.convertTo[JsObject])
  )


  def createAspectDef(param: FixtureParam, aspectDef: AspectDefinition): Unit = {
    param.asAdmin(Post("/v0/aspects", aspectDef)) ~> addTenantIdHeader(TENANT_1) ~> param.api(Full).routes ~> check {
      status shouldEqual StatusCodes.OK
    }
  }

  def createTestAspectDef(param: FixtureParam): Unit = {
    createAspectDef(param, testAspectDef)
  }


  describe("Test Create a New Record (POST /v0/records)") {
    describe("Test With Valid Aspect Data") {
      testValidAspectData.zipWithIndex.foreach{ case (jsonString, idx) =>
        it(s"Should process valid sample data no.${idx + 1} successfully"){ param =>

          createTestAspectDef(param)

          val record = Record(s"test-record-${idx}", s"test record No: ${idx}", Map(
            "test-aspect" -> jsonString.parseJson.convertTo[JsObject]
          ), Some("tag"))

          param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(TENANT_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record] shouldEqual record.copy(tenantId = Some(TENANT_1))
          }
        }
      }
    }


    describe("Test With invalid Aspect Data") {
      testinvalidAspectData.zipWithIndex.foreach{ case (jsonString, idx) =>
        it(s"Should return 400 statusCode for invalid sample data no.${idx + 1}"){ param =>

          createTestAspectDef(param)

          val record = Record(s"test-record-${idx}", s"test record No: ${idx}", Map(
            "test-aspect" -> jsonString.parseJson.convertTo[JsObject]
          ), Some("tag"))

          param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(TENANT_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.BadRequest
            // --- check there is no record to be created
            val count = DB localTx { implicit session =>
              sql"SELECT COUNT(*) FROM records".map(_.long(1)).single.apply().getOrElse(0L)
            }
            count shouldEqual 0
          }
        }
      }
    }

  }


  describe("Test Modifies a record (PUT /v0/records/{id})") {
    describe("Test With Valid Aspect Data") {
      testValidAspectData.zipWithIndex.foreach{ case (jsonString, idx) =>
        it(s"Should process valid sample data no.${idx + 1} successfully"){ param =>

          createTestAspectDef(param)

          val record = Record(s"test-record-${idx}", s"test record No: ${idx}", Map(), Some("tag"))

          param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(TENANT_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record] shouldEqual record.copy(tenantId = Some(TENANT_1))
          }

          val newRecord = record.copy(aspects = Map(
            "test-aspect" -> jsonString.parseJson.convertTo[JsObject]
          ))
          param.asAdmin(Put(s"/v0/records/${record.id}", newRecord)) ~> addTenantIdHeader(TENANT_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record] shouldEqual newRecord.copy(tenantId = Some(TENANT_1))
          }

        }
      }
    }


    describe("Test With invalid Aspect Data") {
      testinvalidAspectData.zipWithIndex.foreach{ case (jsonString, idx) =>
        it(s"Should return 400 statusCode for invalid sample data no.${idx + 1}"){ param =>

          createTestAspectDef(param)

          val record = Record(s"test-record-${idx}", s"test record No: ${idx}", Map(), Some("tag"))

          param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(TENANT_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record] shouldEqual record.copy(tenantId = Some(TENANT_1))
          }

          val newRecord = record.copy(aspects = Map(
            "test-aspect" -> jsonString.parseJson.convertTo[JsObject]
          ))

          param.asAdmin(Put(s"/v0/records/${record.id}", newRecord)) ~> addTenantIdHeader(TENANT_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.BadRequest
          }
        }
      }
    }

  }


  describe("Test Modify a record by applying a JSON Patch (Patch /v0/records/{id})") {
    describe("Test With Valid Aspect Data") {
      testValidAspectData.zipWithIndex.foreach{ case (jsonString, idx) =>
        it(s"Should process valid sample data no.${idx + 1} successfully"){ param =>

          createTestAspectDef(param)

          val record = Record(s"test-record-${idx}", s"test record No: ${idx}", Map(), Some("tag"))

          param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(TENANT_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record] shouldEqual record.copy(tenantId = Some(TENANT_1))
          }

          val newRecord = record.copy(aspects = Map(
            "test-aspect" -> jsonString.parseJson.convertTo[JsObject]
          ))

          val patch = JsonDiff.diff(record, newRecord, remember = false)

          param.asAdmin(Patch(s"/v0/records/${record.id}", patch)) ~> addTenantIdHeader(TENANT_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record] shouldEqual newRecord.copy(tenantId = Some(TENANT_1), sourceTag = None)
          }

        }
      }
    }


    describe("Test With invalid Aspect Data") {
      testinvalidAspectData.zipWithIndex.foreach{ case (jsonString, idx) =>
        it(s"Should return 400 statusCode for invalid sample data no.${idx + 1}"){ param =>

          createTestAspectDef(param)

          val record = Record(s"test-record-${idx}", s"test record No: ${idx}", Map(), Some("tag"))

          param.asAdmin(Post("/v0/records", record)) ~> addTenantIdHeader(TENANT_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.OK
            responseAs[Record] shouldEqual record.copy(tenantId = Some(TENANT_1))
          }

          val newRecord = record.copy(aspects = Map(
            "test-aspect" -> jsonString.parseJson.convertTo[JsObject]
          ))

          val patch = JsonDiff.diff(record, newRecord, remember = false)

          param.asAdmin(Patch(s"/v0/records/${record.id}", patch)) ~> addTenantIdHeader(TENANT_1) ~> param.api(Full).routes ~> check {
            status shouldEqual StatusCodes.BadRequest
          }
        }
      }
    }

  }



}
