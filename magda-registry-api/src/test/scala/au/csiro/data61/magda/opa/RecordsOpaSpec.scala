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
    *                |  Dep. A  |
    *                | userId0  |
    *                | record-0 |
    *                +----+-----+
    *                     |
    *            +--------+--------+
    *            |                 |
    *       +----+-----+       +----+-----+
    *       | Branch A |       | Branch B |
    *       | userId1  |  ref  | userId2  |
    *   +-->| record-1 | <-----| record-2 |      ref
    *   |   |          | <-----| record-5 |----------------+
    *   |   +----------+       +----+-----+                |
    *   |                           |                      |
    *   |              +--------------------------+        |
    *   |              |            |             |        |
    *   |         +----+----+  +----+----+  +----+-----+   |     +----------+
    *   |         |Section A|  |Section B|  |Section C |   |     | (Public) |
    *   |         |         |  |         |  | userId3  |   |     |          |
    *   |         |         |  +---------+  |          |<--+     |          |  (Section C owns record-4 but does
    *   |         +---------+   [empty] <---| record-3 | <-------| record-4 |   not put access restriction on it.)
    *   |                               ref +----------+     ref +----------+
    *   |                                                              | ref
    *   +------------------------------ -------------------------------+
    *
    */
  val userId0 = "00000000-0000-1000-0000-000000000000" // admin user
  val userId1 = "00000000-0000-1000-0001-000000000000"
  val userId2 = "00000000-0000-1000-0002-000000000000"
  val userId3 = "00000000-0000-1000-0003-000000000000"
  val anonymous = "anonymous"

  val userIdsAndExpectedRecordIdIndexesWithoutReferencing = List(
    (userId0, List(0, 1, 2, 3, 4, 5)),
    (userId1, List(1, 4)),
    (userId2, List(2, 3, 4, 5)),
    (userId3, List(3, 4)),
    (anonymous, List(4))
  )

  val userIdsAndExpectedRecordIdIndexesWithReferencing = List(
    (userId0, List(2)),
    (userId1, List()),
    (userId2, List()),
    (userId3, List()),
    ("anonymous", List())
  )

  val linkedRecordIdsMap: Map[String, String] = Map("record-2" -> "record-1")

  val orgNames = List(
    "Dep. A",
    "Branch A, Dep. A",
    "Branch B, Dep. A",
    "Section C, Branch B, Dep. A",
    "Section C, Branch B, Dep. A",
    "Branch B, Dep. A"
  )

  val dataPath =
    "magda-registry-api/src/test/scala/au/csiro/data61/magda/opa/data/"

  val accessControlSchemaFile =
    "magda-registry-aspects/dataset-access-control.schema.json"

  var hasAspectDefinitions = false
  private def createAspectDefinitions(
      param: RecordsOpaSpec.this.FixtureParam
  ): AnyVal = {
    if (hasAspectDefinitions)
      return

    val accessControlSchemaSource: BufferedSource = fromFile(
      accessControlSchemaFile
    )

    val orgAspectSchemaSource: BufferedSource = fromFile(
      dataPath + "organization-schema.json"
    )

    val withLinkAspectSchemaSource: BufferedSource = fromFile(
      dataPath + "with-link-schema.json"
    )

    val withLinksAspectSchemaSource: BufferedSource = fromFile(
      dataPath + "with-links-schema.json"
    )

    val accessControlSchema: String =
      try {
        accessControlSchemaSource.mkString
      } finally {
        accessControlSchemaSource.close()
      }

    val orgAspectSchema: String =
      try {
        orgAspectSchemaSource.mkString
      } finally {
        orgAspectSchemaSource.close()
      }

    val withLinkAspectSchema: String =
      try {
        withLinkAspectSchemaSource.mkString
      }
      finally {
        withLinkAspectSchemaSource.close()
      }

    val withLinksAspectSchema: String =
      try {
        withLinksAspectSchemaSource.mkString
      }
    finally {
      withLinksAspectSchemaSource.close()
    }

    val accessControlAspectId = "dataset-access-control"
    val orgAspectId = "organization"
    val withLinkId = "withLink"
    val withLinksId = "withLinks"

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

    val withLinksAspectDef = AspectDefinition(
      withLinksId,
      "with links aspect",
      Some(JsonParser(withLinksAspectSchema).asJsObject)
    )

    val aspectDefs = List(
      accessControlDef,
      orgAspectDef,
      withLinkAspectDef,
      withLinksAspectDef
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

    hasAspectDefinitions = true
  }

  private def getTestRecords(file: String): List[Record] = {
    val recordsSource: BufferedSource = fromFile(file)

    val recordsJsonStr: String = try {
      recordsSource.mkString
    }
    finally {
      recordsSource.close()
    }

    JsonParser(recordsJsonStr).convertTo[List[Record]]
  }

  val testRecords: List[Record] = getTestRecords(dataPath + "records.json")

  var hasRecords = false
  private def createRecords(param: RecordsOpaSpec.this.FixtureParam): AnyVal = {
    if (hasRecords)
      return

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

    hasRecords = true
  }

  it(
    "should apply access control when returning specified aspect (path param) of specified record"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    val recordIds: immutable.Seq[(Int, String)] = for {
      i <- testRecords.indices
      recordId = "record-" + i
    } yield (i, recordId)

    userIdsAndExpectedRecordIdIndexesWithoutReferencing.map(
      userIdAndExpectedRecordIndexes => {
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
      }
    )
  }

  it(
    "should apply access control when returning specified aspect (query param) of specified record"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    val recordIds: immutable.Seq[(Int, String)] = for {
      i <- testRecords.indices
      recordId = "record-" + i
    } yield (i, recordId)

    userIdsAndExpectedRecordIdIndexesWithoutReferencing.map(
      userIdAndExpectedRecordIndexes => {
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
              record.get
                .aspects("organization")
                .fields("name") shouldBe JsString(
                orgNames(index)
              )
            } else {
              status shouldBe StatusCodes.NotFound
            }
          }

        })

        foundRecordsCounter shouldBe expectedRecordIndexes.length
      }
    )
  }

  it(
    "should apply access control when returning records with required aspect"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    userIdsAndExpectedRecordIdIndexesWithoutReferencing.map(
      userIdAndExpectedRecordIndexes => {
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

      }
    )

  }

  it(
    "should apply access control when returning records with required referencing aspect"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    userIdsAndExpectedRecordIdIndexesWithReferencing.map(
      userIdAndExpectedRecordIndexes => {
        val userId = userIdAndExpectedRecordIndexes._1
        val expectedRecordIndexes = userIdAndExpectedRecordIndexes._2
        val withLinkAspectId = "withLink"
        val linkName = "someLink"

        Get(s"/v0/records?aspect=$withLinkAspectId") ~> addTenantIdHeader(
          TENANT_0
        ) ~> addJwtToken(
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
            val aspect = record.aspects(withLinkAspectId)
            aspect.fields(linkName) shouldEqual JsString(
              linkedRecordIdsMap(record.id)
            )
          })
        }

      }
    )

  }

  it(
    "should apply access control when returning records only"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    userIdsAndExpectedRecordIdIndexesWithoutReferencing.map(
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

    Get(s"/v0/records?aspect=$aspectId&limit=$limit") ~> addTenantIdHeader(
      TENANT_0
    ) ~> addJwtToken(
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
    val withLinkAspectId = "withLink"
    val linkName = "someLink"
    val referencedRecordId = "record-1"

    Get(
      s"/v0/records/$referencingRecordId?aspect=$withLinkAspectId&dereference=false"
    ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
      userId0
    ) ~> param.api(Full).routes ~> check {
      status shouldBe StatusCodes.OK
      val record = responseAs[Record]
      record.id shouldBe referencingRecordId
      record.aspects(withLinkAspectId).fields(linkName) shouldEqual JsString(
        referencedRecordId
      )
    }
  }

  it(
    "should return referenced record (dereference=true) to authorized user"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    val referencingRecordId = "record-2"
    val withLinkAspectId = "withLink"
    val linkName = "someLink"
    val referencedRecordIndex = 1 // "record-1"

    Get(
      s"/v0/records/$referencingRecordId?aspect=$withLinkAspectId&dereference=true"
    ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
      userId0
    ) ~> param.api(Full).routes ~> check {
      status shouldBe StatusCodes.OK
      val record = responseAs[Record]
      record.id shouldBe referencingRecordId
      val aspect: JsObject = record.aspects(withLinkAspectId)
      val target = testRecords(referencedRecordIndex)
      val expected = JsObject(
        "aspects" ->
          JsObject(
            "id" -> JsString(target.id),
            "name" -> JsString(target.name),
            "organization" -> JsObject(
              "name" -> JsString(orgNames(referencedRecordIndex)),
              "email" -> JsString("Branch.A@somewhere")
            ),
            "dataset-access-control" -> JsObject(
              "orgUnitOwnerId" -> JsString(
                "00000000-0000-2000-0002-000000000000"
              )
            )
          )
      )

      aspect.fields(linkName).asJsObject().canEqual(expected) shouldBe true
    }
  }

  it(
    "should not return referenced (dereference=false) record to unauthorized user"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    val referencingRecordIndex = 2
    val referencingRecordId = "record-" + referencingRecordIndex
    val withLinkAspectId = "withLink"

    Get(
      s"/v0/records/$referencingRecordId?aspect=$withLinkAspectId&dereference=false"
    ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
      userId2
    ) ~> param.api(Full).routes ~> check {
      status shouldBe StatusCodes.NotFound
    }

    val organizationAspectId = "organization"
    Get(
      s"/v0/records/$referencingRecordId?aspect=$organizationAspectId&optionalAspect=$withLinkAspectId&dereference=false"
    ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
      userId2
    ) ~> param.api(Full).routes ~> check {
      status shouldBe StatusCodes.OK
      val record = responseAs[Record]
      record.id shouldBe referencingRecordId
      record.aspects.get(withLinkAspectId) shouldBe None
      record.aspects(organizationAspectId).fields("name") shouldBe JsString(
        orgNames(referencingRecordIndex)
      )
    }
  }

  it(
    "should not return referenced (dereference=true) record to unauthorized user"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    val referencingRecordIndex = 2
    val referencingRecordId = "record-" + referencingRecordIndex
    val withLinkAspectId = "withLink"

    Get(
      s"/v0/records/$referencingRecordId?aspect=$withLinkAspectId&dereference=true"
    ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
      userId2
    ) ~> param.api(Full).routes ~> check {
      status shouldBe StatusCodes.NotFound
    }

    val organizationAspectId = "organization"
    Get(
      s"/v0/records/$referencingRecordId?aspect=$organizationAspectId&optionalAspect=$withLinkAspectId&dereference=true"
    ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
      userId2
    ) ~> param.api(Full).routes ~> check {
      status shouldBe StatusCodes.OK
      val record = responseAs[Record]
      record.id shouldBe referencingRecordId
      record.aspects.get(withLinkAspectId) shouldBe None
      record.aspects(organizationAspectId).fields("name") shouldBe JsString(
        orgNames(referencingRecordIndex)
      )
    }

  }

  it(
    "should return record-5 with both record-1 and record-3 in links (dereference=false) to userId0"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    val referencingRecordId = "record-5"
    val withLinksAspectId = "withLinks"
    val linksName = "someLinks"

    Get(
      s"/v0/records/$referencingRecordId?aspect=$withLinksAspectId&dereference=false"
    ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
      userId0
    ) ~> param.api(Full).routes ~> check {
      status shouldBe StatusCodes.OK
      val record = responseAs[Record]
      record.id shouldBe referencingRecordId
      record.aspects(withLinksAspectId).fields(linksName) shouldEqual JsArray(
        JsString("record-1"),
        JsString("record-3")
      )
    }
  }

  it(
    "should return record-5 with both record-1 and record-3 in links (dereference=true) to userId0"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    val referencingRecordId = "record-5"
    val withLinksAspectId = "withLinks"
    val linksName = "someLinks"

    Get(
      s"/v0/records/$referencingRecordId?aspect=$withLinksAspectId&dereference=true"
    ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
      userId0
    ) ~> param.api(Full).routes ~> check {
      status shouldBe StatusCodes.OK
      val record = responseAs[Record]
      record.id shouldBe referencingRecordId

      val referencedRecordIndex1 = 1
      val target1 = testRecords(referencedRecordIndex1)
      val expected1 = JsObject(
        "aspects" ->
          JsObject(
            "id" -> JsString(target1.id),
            "name" -> JsString(target1.name),
            "organization" -> JsObject(
              "name" -> JsString(orgNames(referencedRecordIndex1)),
              "email" -> JsString("Branch.A@somewhere")
            ),
            "dataset-access-control" -> JsObject(
              "orgUnitOwnerId" -> JsString(
                "00000000-0000-2000-0002-000000000000"
              )
            )
          )
      )

      val referencedRecordIndex2 = 3
      val target2 = testRecords(referencedRecordIndex2)
      val expected2 = JsObject(
        "aspects" ->
          JsObject(
            "id" -> JsString(target2.id),
            "name" -> JsString(target2.name),
            "organization" -> JsObject(
              "name" -> JsString(orgNames(referencedRecordIndex2)),
              "email" -> JsString("Branch.B@somewhere")
            ),
            "dataset-access-control" -> JsObject(
              "orgUnitOwnerId" -> JsString(
                "00000000-0000-2000-0003-000000000000"
              )
            )
          )
      )

      val actual = record
        .aspects(withLinksAspectId)
        .fields(linksName)
        .convertTo[Array[JsObject]]
      actual.length shouldBe 2
      actual(0).canEqual(expected1) shouldBe true
      actual(1).canEqual(expected2) shouldBe true
    }
  }

  it(
    "should return record-5 with record-3 but not record-1 in links (dereference=false) to userId2"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    val referencingRecordId = "record-5"
    val withLinksAspectId = "withLinks"
    val linksName = "someLinks"

    Get(
      s"/v0/records/$referencingRecordId?aspect=$withLinksAspectId&dereference=false"
    ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
      userId2
    ) ~> param.api(Full).routes ~> check {
      status shouldBe StatusCodes.OK
      val record = responseAs[Record]
      record.id shouldBe referencingRecordId
      record.aspects(withLinksAspectId).fields(linksName) shouldEqual JsArray(
        JsString("record-3")
      )
    }
  }

  it(
    "should return record-5 with record-3 but not record-1 in links (dereference=true) to userId2"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    val referencingRecordId = "record-5"
    val withLinksAspectId = "withLinks"
    val linksName = "someLinks"

    Get(
      s"/v0/records/$referencingRecordId?aspect=$withLinksAspectId&dereference=true"
    ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
      userId2
    ) ~> param.api(Full).routes ~> check {
      status shouldBe StatusCodes.OK
      val record = responseAs[Record]
      record.id shouldBe referencingRecordId

      val referencedRecordIndex = 3
      val target = testRecords(referencedRecordIndex)
      val expected = JsObject(
        "aspects" ->
          JsObject(
            "id" -> JsString(target.id),
            "name" -> JsString(target.name),
            "organization" -> JsObject(
              "name" -> JsString(orgNames(referencedRecordIndex)),
              "email" -> JsString("Branch.B@somewhere")
            ),
            "dataset-access-control" -> JsObject(
              "orgUnitOwnerId" -> JsString(
                "00000000-0000-2000-0003-000000000000"
              )
            )
          )
      )

      val actual = record
        .aspects(withLinksAspectId)
        .fields(linksName)
        .convertTo[Array[JsObject]]
      actual.length shouldBe 1
      actual(0).canEqual(expected) shouldBe true
    }
  }

  it(
    "should return not found for record-5 links aspect to anonymous user"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    val referencingRecordId = "record-5"
    val withLinksAspectId = "withLinks"

    Get(
      s"/v0/records/$referencingRecordId?aspect=$withLinksAspectId&dereference=true"
    ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
      anonymous
    ) ~> param.api(Full).routes ~> check {
      // TODO: Should this return OK with empty links?
      status shouldBe StatusCodes.NotFound
    }
  }

  it(
    "should return record-3 with empty links (dereference=true) to userId2"
  ) { param =>
    createAspectDefinitions(param)
    createRecords(param)

    val referencingRecordId = "record-3"
    val withLinksAspectId = "withLinks"
    val linksName = "someLinks"

    Get(
      s"/v0/records/$referencingRecordId?aspect=$withLinksAspectId&dereference=true"
    ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
      userId2
    ) ~> param.api(Full).routes ~> check {
      status shouldBe StatusCodes.OK
      val record = responseAs[Record]
      record.id shouldBe referencingRecordId
      val actual = record
        .aspects(withLinksAspectId)
        .fields(linksName)
        .convertTo[Array[JsObject]]
      actual.length shouldBe 0
    }
  }
}
