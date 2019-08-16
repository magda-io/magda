package au.csiro.data61.magda.opa

import akka.http.scaladsl.model.StatusCodes
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.registry._
import spray.json._

import scala.collection.immutable
import scala.concurrent.duration._
import scala.io.BufferedSource
import scala.io.Source.fromFile

class RecordsOpaSpec extends ApiWithOpaSpec {

  s"""
     |     Relationship among users, organizations and records.
     |
     |              +----------+
     |              |  Dep. A  |
     |              | userId0  |
     |              | record-0 |
     |              +----+-----+
     |                   |
     |          +--------+--------+
     |          |                 |
     |      +----+-----+       +----+-----+
     |      | Branch A |       | Branch B |
     |      | userId1  |       | userId2  |
     |      | record-1 |       | record-2 |
     |      +----------+       +----+-----+
     |                              |
     |               +--------------------------+
     |               |             |            |
     |           +----+----+  +----+----+  +----+-----+      +----------+
     |           |Section A|  |Section B|  |Section C |      | (Public) |
     |           |         |  |         |  | userId3  |      | record-4 | (No access control but orgUnit = Section C)
     |           |         |  |         |  | record-3 |      +----------+
     |           +---------+  +---------+  +----------+
     """


  val userIdsAndExpectedRecordIdIndexes = List(
    (userId0, List(0, 1, 2, 3, 4)),
    (userId1, List(1, 4)),
    (userId2, List(2, 3, 4)),
    (userId3, List(3, 4)),
    (anonymous, List(4)))

  val orgNames = List("Dep. A", "Branch A, Dep. A", "Branch B, Dep. A", "Section C, Branch B, Dep. A", "Section C, Branch B, Dep. A")
  val dataPath = "magda-registry-api/src/test/scala/au/csiro/data61/magda/opa/data/"
  val accessControlSchemaFile = "magda-registry-aspects/dataset-access-control.schema.json"
  private def createAspectDefinitions(param: RecordsOpaSpec.this.FixtureParam) = {
    val accessControlSchemaSource: BufferedSource = fromFile(accessControlSchemaFile)
    val orgAspectSchemaSource: BufferedSource = fromFile(dataPath + "organization-schema.json")
    val accessControlSchema: String = try accessControlSchemaSource.mkString finally accessControlSchemaSource.close()
    val orgAspectSchema: String = try orgAspectSchemaSource.mkString finally orgAspectSchemaSource.close()
    val accessControlAspectId = "dataset-access-control"
    val orgAspectId = "organization"
    val accessControlDef = AspectDefinition(accessControlAspectId, "dataset-access-control", Some(JsonParser(accessControlSchema).asJsObject))
    val orgAspectDef = AspectDefinition(orgAspectId, "dataset-access-control", Some(JsonParser(orgAspectSchema).asJsObject))
    val aspectData = List((accessControlAspectId, accessControlDef), (orgAspectId, orgAspectDef))

    aspectData.map(a => {
      val aspectId = a._1
      val aspectDef = a._2
      Get(s"/v0/aspects/$aspectId")   ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(userId0) ~>  param.api(Full).routes ~> check {
        response.entity.toStrict(1 second).map(entity => {
          val json = entity.data.utf8String.parseJson.asJsObject()
          if (json.fields("message").equals(JsString("No aspect exists with that ID."))){
            Post(s"/v0/aspects", aspectDef) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(userId0) ~>  param.api(Full).routes ~> check {
              status shouldBe StatusCodes.OK
            }
          }
        })
      }
    })
  }

  private def createRecords(param: RecordsOpaSpec.this.FixtureParam) = {
    val recordsSource: BufferedSource = fromFile(dataPath + "records.json")
    val recordsJsonStr: String = try recordsSource.mkString finally recordsSource.close()
    val recordsJson = JsonParser(recordsJsonStr)
    val records: List[Record] = recordsJson.convertTo[List[Record]]

    records.map(record => {
      Get(s"/v0/records/${record.id}") ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(userId0) ~>  param.api(Full).routes ~> check {
        if (status == StatusCodes.NotFound){
          Post(s"/v0/records", record) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(userId0) ~>  param.api(Full).routes ~> check {
            status shouldBe StatusCodes.OK
          }
        }
      }
    })
  }


  it("should apply access control when responding to query aspect by record ID") { param =>

    createAspectDefinitions(param)
    createRecords(param)

    val recordIds: immutable.Seq[(Int, String)] = for {
      i <- 1 to 5
      recordId = "record-"+i
    } yield (i, recordId)

    userIdsAndExpectedRecordIdIndexes.map(userIdAndExpectedRecordIndexes => {
      val userId = userIdAndExpectedRecordIndexes._1
      val expectedRecordIndexes = userIdAndExpectedRecordIndexes._2

      var isMeaningful = false
      recordIds.map( recordIdAndIndex => {
        val recordIndex = recordIdAndIndex._1
        val recordId = recordIdAndIndex._2

        Get(s"/v0/records/$recordId/aspects/organization") ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(userId) ~>  param.api(Full).routes ~> check {
          if (expectedRecordIndexes.contains(recordIndex)){
            status shouldBe StatusCodes.OK
            response.entity.toStrict(1 second).map(entity => {
              val json = entity.data.utf8String.parseJson.asJsObject()
              isMeaningful = true
              json.fields("name") shouldBe orgNames(recordIndex)
            })
          }
          else {
            status shouldBe StatusCodes.OK
            val result: Option[Long] = response.entity.contentLengthOption
            result.get shouldBe 0
          }
        }
      })

      isMeaningful shouldBe true
    })
  }

  it("should apply access control when responding to aspect query") { param =>
    createAspectDefinitions(param)
    createRecords(param)

    userIdsAndExpectedRecordIdIndexes.map(userIdAndExpectedRecordIndexes => {
      val userId = userIdAndExpectedRecordIndexes._1
      val expectedRecordIndexes = userIdAndExpectedRecordIndexes._2
      val aspectId = "organization"

      Get(s"/v0/records?aspect=$aspectId") ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(userId) ~>  param.api(Full).routes ~> check {
        status shouldBe StatusCodes.OK
        val records = responseAs[RecordsPage[Record]].records
        records.length shouldBe expectedRecordIndexes.length
        val results: List[(Record, Int)] = records.zip(expectedRecordIndexes)
        results.map(res => {
          val record = res._1
          val index = res._2
          record.id shouldBe "record-" + index
          val aspect = record.aspects(aspectId)
          aspect.fields("name") shouldEqual JsString(orgNames(index))
        })
      }

    })

  }
}
