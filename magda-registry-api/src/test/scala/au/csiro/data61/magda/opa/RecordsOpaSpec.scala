package au.csiro.data61.magda.opa

import akka.http.scaladsl.model.StatusCodes
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.registry._
import org.scalatest.Ignore
import spray.json._

import scala.collection.immutable
import scala.io.BufferedSource
import scala.io.Source.fromFile

@Ignore
class RecordsOpaSpec extends ApiWithOpaSpec {

  /**
    *     Relationship among users, organizations and records.
    *
    *                +----------+
    *                |  Dep. A  |  1
    *                | userId0  |
    *                | record-0 |
    *                +----+-----+
    *                     |
    *            +--------+--------+
    *            |                 |
    *       +----+-----+       +----+-----+
    *       | Branch A | 2     | Branch B | 3
    *       | userId1  |  ref  | userId2  |
    *       | record-1 | <---- | record-2 |
    *       +----------+       +----+-----+
    *                               |
    *                  +--------------------------+
    *                  |            |             |
    *             +----+----+  +----+----+  +----+-----+      +----------+
    *             |Section A|  |Section B|  |Section C |      | (Public) |
    *             |         |  |         |  | userId3  |      | record-4 |
    *             |         |  |         |  | record-3 |      +----------+
    *             +---------+  +---------+  +----------+     (Section C owns record-4 but does
    *                                                         not put access restriction on it.)
    */
  val userId0 = "00000000-0000-1000-0000-000000000000" // admin user
  val userId1 = "00000000-0000-1000-0001-000000000000"
  val userId2 = "00000000-0000-1000-0002-000000000000"
  val userId3 = "00000000-0000-1000-0003-000000000000"

  val userIdsAndExpectedRecordIdIndexes = List(
    (userId0, List(0, 1, 2, 3, 4)),
    (userId1, List(1, 4)),
    (userId2, List(2, 3, 4)),
    (userId3, List(3, 4)),
    ("anonymous", List(4))
  )

  val orgNames = List(
    "Dep. A",
    "Branch A, Dep. A",
    "Branch B, Dep. A",
    "Section C, Branch B, Dep. A",
    "Section C, Branch B, Dep. A"
  )

  val dataPath =
    "magda-registry-api/src/test/scala/au/csiro/data61/magda/opa/data/"

  val accessControlSchemaFile =
    "magda-registry-aspects/dataset-access-control.schema.json"

  private def createAspectDefinitions(
      param: RecordsOpaSpec.this.FixtureParam
  ) = {
    val accessControlSchemaSource: BufferedSource = fromFile(
      accessControlSchemaFile
    )

    val orgAspectSchemaSource: BufferedSource = fromFile(
      dataPath + "organization-schema.json"
    )

    val withLinkAspectSchemaSource: BufferedSource = fromFile(
      dataPath + "with-link-schema.json"
    )

    val accessControlSchema: String = try accessControlSchemaSource.mkString
    finally accessControlSchemaSource.close()

    val orgAspectSchema: String = try orgAspectSchemaSource.mkString
    finally orgAspectSchemaSource.close()

    val withLinkAspectSchema: String = try withLinkAspectSchemaSource.mkString
    finally orgAspectSchemaSource.close()

    val accessControlAspectId = "dataset-access-control"
    val orgAspectId = "organization"
    val withLinkId = "withLink"

    val accessControlDef = AspectDefinition(
      accessControlAspectId,
      "access control aspect",
      Some(JsonParser(accessControlSchema).asJsObject)
    )

    val orgAspectDef = AspectDefinition(
      orgAspectId,
      "organization aspect",
      Some(JsonParser(orgAspectSchema).asJsObject)
    )

    val withLinkAspectDef = AspectDefinition(
      withLinkId,
      "with link aspect",
      Some(JsonParser(withLinkAspectSchema).asJsObject)
    )

    val aspectDefs = List(
      accessControlDef,
      orgAspectDef,
      withLinkAspectDef
    )

    aspectDefs.map(aspectDef => {
      Get(s"/v0/aspects/${aspectDef.id}") ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
        userId0
      ) ~> param.api(Full).routes ~> check {
        if (status == StatusCodes.NotFound) {
          Post(s"/v0/aspects", aspectDef) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
            userId0
          ) ~> param.api(Full).routes ~> check {
            status shouldBe StatusCodes.OK
          }
        }
      }
    })
  }

  val recordsSource: BufferedSource = fromFile(dataPath + "records.json")

  val recordsJsonStr: String = try recordsSource.mkString
  finally recordsSource.close()

  val recordsJson = JsonParser(recordsJsonStr)
  val testRecords: List[Record] = recordsJson.convertTo[List[Record]]

  private def createRecords(param: RecordsOpaSpec.this.FixtureParam) = {

    testRecords.map(record => {
      Get(s"/v0/records/${record.id}") ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
        userId0
      ) ~> param.api(Full).routes ~> check {
        if (status == StatusCodes.NotFound) {
          Post(s"/v0/records", record) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
            userId0
          ) ~> param.api(Full).routes ~> check {
            status shouldBe StatusCodes.OK
          }
        }
      }
    })
  }

  it(
    "should apply access control when returning specified aspect (path param) of specified record"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    val recordIds: immutable.Seq[(Int, String)] = for {
      i <- 0 to 4
      recordId = "record-" + i
    } yield (i, recordId)

    userIdsAndExpectedRecordIdIndexes.map(userIdAndExpectedRecordIndexes => {
      val userId = userIdAndExpectedRecordIndexes._1
      val expectedRecordIndexes = userIdAndExpectedRecordIndexes._2
      var foundRecordsCounter = 0

      recordIds.map(recordIdAndIndex => {
        val recordIndex = recordIdAndIndex._1
        val recordId = recordIdAndIndex._2

        Get(s"/v0/records/$recordId/aspects/organization") ~> addTenantIdHeader(
          TENANT_0
        ) ~> addJwtToken(userId) ~> param.api(Full).routes ~> check {
          val theResponse = responseAs[Option[JsObject]]
          if (expectedRecordIndexes.contains(recordIndex)) {
            status shouldBe StatusCodes.OK
            foundRecordsCounter = foundRecordsCounter + 1
            theResponse.get.fields("name") shouldBe JsString(
              orgNames(recordIndex)
            )
          } else {
            status shouldBe StatusCodes.NotFound
            theResponse.get.fields("message") shouldBe JsString(
              "No record or aspect exists with the given IDs."
            )
          }
        }

      })

      foundRecordsCounter shouldBe expectedRecordIndexes.length
    })
  }

  it(
    "should apply access control when returning specified aspect (query param) of specified record"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    val recordIds: immutable.Seq[(Int, String)] = for {
      i <- 0 to 4
      recordId = "record-" + i
    } yield (i, recordId)

    userIdsAndExpectedRecordIdIndexes.map(userIdAndExpectedRecordIndexes => {
      val userId = userIdAndExpectedRecordIndexes._1
      val expectedRecordIndexes = userIdAndExpectedRecordIndexes._2
      var foundRecordsCounter = 0

      recordIds.map(recordIdAndIndex => {
        val index = recordIdAndIndex._1
        val recordId = recordIdAndIndex._2

        Get(s"/v0/records/$recordId?aspect=organization") ~> addTenantIdHeader(
          TENANT_0
        ) ~> addJwtToken(userId) ~> param.api(Full).routes ~> check {
          if (expectedRecordIndexes.contains(index)) {
            foundRecordsCounter = foundRecordsCounter + 1
            val record = responseAs[Option[Record]]
            status shouldBe StatusCodes.OK
            record.get.id shouldBe "record-" + index
            record.get.aspects("organization").fields("name") shouldBe JsString(
              orgNames(index)
            )
          } else {
            status shouldBe StatusCodes.NotFound
          }
        }

      })

      foundRecordsCounter shouldBe expectedRecordIndexes.length
    })
  }

  it(
    "should apply access control when returning records with required aspect"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    userIdsAndExpectedRecordIdIndexes.map(userIdAndExpectedRecordIndexes => {
      val userId = userIdAndExpectedRecordIndexes._1
      val expectedRecordIndexes = userIdAndExpectedRecordIndexes._2
      val aspectId = "organization"

      Get(s"/v0/records?aspect=$aspectId") ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
        userId
      ) ~> param.api(Full).routes ~> check {
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

  it(
    "should apply access control when returning records only"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    userIdsAndExpectedRecordIdIndexes.map(
      userIdAndExpectedRecordIndexes => {
        val userId = userIdAndExpectedRecordIndexes._1
        val expectedRecordIndexes = userIdAndExpectedRecordIndexes._2

        Get(s"/v0/records") ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
          userId
        ) ~> param.api(Full).routes ~> check {
          status shouldBe StatusCodes.OK
          val records = responseAs[RecordsPage[Record]].records
          records.length shouldBe expectedRecordIndexes.length
          val results: List[(Record, Int)] = records.zip(expectedRecordIndexes)
          results.map(res => {
            val record = res._1
            val index = res._2
            record.id shouldBe "record-" + index
            record.aspects shouldBe Map()
          })
        }

      }
    )

  }

  it(
    "should apply access control when returning records with required aspect and required limit"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    val limit = 3
    val userIdAndExpectedRecordIndexes = (userId0, List(0, 1, 2))

    val userId = userIdAndExpectedRecordIndexes._1
    val expectedRecordIndexes = userIdAndExpectedRecordIndexes._2
    val aspectId = "organization"

    Get(s"/v0/records?aspect=$aspectId&limit=$limit") ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
      userId
    ) ~> param.api(Full).routes ~> check {
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

  }

  it(
    "should return referenced record (dereference=false) to authorized user"
    ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    val referencingRecordId = "record-2"
    val aspectId = "withLink"
    val referencedRecordId = "record-1"

    Get(s"/v0/records/$referencingRecordId?aspect=$aspectId&dereference=false") ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
      userId0
    ) ~> param.api(Full).routes ~> check {
      status shouldBe StatusCodes.OK
      val record = responseAs[Record]
      record.id shouldBe referencingRecordId
      record.aspects(aspectId).fields("someLink") shouldEqual JsObject("id" -> JsString(referencedRecordId))
    }
  }

  it(
    "should return referenced record (dereference=true) to authorized user"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    val referencingRecordId = "record-2"
    val aspectId = "withLink"
    val referencedRecordIndex = 1 // "record-1"

    Get(s"/v0/records/$referencingRecordId?aspect=$aspectId&dereference=true") ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
      userId0
    ) ~> param.api(Full).routes ~> check {
      status shouldBe StatusCodes.OK
      val record = responseAs[Record]
      record.id shouldBe referencingRecordId
      val aspect: JsObject = record.aspects(aspectId)
      val target = testRecords(referencedRecordIndex)
      val expected = JsObject("aspects" ->
        JsObject(
          "id" -> JsString(target.id),
          "name" -> JsString(target.name),
          "organization" -> JsObject("name" -> JsString(orgNames(referencedRecordIndex)), "email" -> JsString("Branch.A@somewhere")),
          "dataset-access-control" -> JsObject("orgUnitOwnerId" -> JsString("00000000-0000-2000-0002-000000000000"))
        ))

      aspect.fields("someLink").asJsObject().canEqual(expected) shouldBe true
    }
  }

  it(
    "should not return referenced (dereference=false) record to unauthorized user"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    val referencingRecordId = "record-2"
    val aspectId = "withLink"

    Get(s"/v0/records/$referencingRecordId?aspect=$aspectId&dereference=false") ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
      userId2
    ) ~> param.api(Full).routes ~> check {
      status shouldBe StatusCodes.NotFound
    }

  }

  it(
    "should not return referenced (dereference=true) record to unauthorized user"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    val recordId = "record-2"
    val aspectId = "withLink"

    Get(s"/v0/records/$recordId?aspect=$aspectId&dereference=true") ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
      userId2
    ) ~> param.api(Full).routes ~> check {
      status shouldBe StatusCodes.NotFound
    }

  }
}
