package au.csiro.data61.magda.opa

import akka.http.scaladsl.model.StatusCodes
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.registry._
import org.scalatest.Ignore
import spray.json._

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
    *            +--------+---------+
    *            |                  |
    *       +----+-----+       +----+-----+
    *       | Branch A |       | Branch B |
    *       | userId1  |  ref  | userId2  |
    *   +-->| record-1 | <-----| record-2 |      ref
    *   |   |          | <-----| record-5 |----------------+
    *   |   +----------+       +----+-----+                |
    *   |                           |                      |
    *   |              +-------------------------+         |
    *   |              |            |            |         |
    *   |         +----+----+  +----+----+  +----+-----+   |     +----------+
    *   |         |Section A|  |Section B|  |Section C |   |     | (Public) |
    *   |         |         |  |         |  | userId3  |   |     |          |
    *   |         |         |  +---------+  |          | <-+     |          |  (Section C owns record-4 but does
    *   |         +---------+   [empty] <---| record-3 | <-------| record-4 |   not put access restriction on it.)
    *   |                               ref +----------+     ref +----------+
    *   |                                                              | ref
    *   +--------------------------------------------------------------+
    *
    */
  val userId0 = "00000000-0000-1000-0000-000000000000" // admin user
  val userId1 = "00000000-0000-1000-0001-000000000000"
  val userId2 = "00000000-0000-1000-0002-000000000000"
  val userId3 = "00000000-0000-1000-0003-000000000000"
  val anonymous = "anonymous"

  val userIdsAndExpectedRecordIdIndexesWithoutLink = List(
    (userId0, List(0, 1, 2, 3, 4, 5)),
    (userId1, List(1, 4)),
    (userId2, List(2, 3, 4, 5)),
    (userId3, List(3, 4)),
    (anonymous, List(4))
  )

  val userIdsAndExpectedRecordIdIndexesWithSingleLink = List(
    (userId0, List(2)),
    (userId1, List()),
    (userId2, List()),
    (userId3, List()),
    (anonymous, List())
  )

  val singleLinkRecordIdMap: Map[String, String] = Map("record-2" -> "record-1")

  val recordOrgNames = List(
    "Dep. A",
    "Branch A, Dep. A",
    "Branch B, Dep. A",
    "Section C, Branch B, Dep. A",
    "Section C, Branch B, Dep. A",
    "Branch B, Dep. A"
  )

  val accessControlId = "dataset-access-control"
  val organizationId = "organization"
  val withLinkId = "withLink"
  val linkName = "someLink"
  val withLinksId = "withLinks"
  val linksName = "someLinks"

  val dataPath =
    "magda-registry-api/src/test/resources/data/"

  var hasAspectDefinitions = false
  private def createAspectDefinitions(
      param: RecordsOpaSpec.this.FixtureParam
  ): AnyVal = {
    if (hasAspectDefinitions)
      return

    val accessControlSchemaSource: BufferedSource = fromFile(
      "magda-registry-aspects/dataset-access-control.schema.json"
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
      } finally {
        withLinkAspectSchemaSource.close()
      }

    val withLinksAspectSchema: String =
      try {
        withLinksAspectSchemaSource.mkString
      } finally {
        withLinksAspectSchemaSource.close()
      }

    val accessControlDef = AspectDefinition(
      accessControlId,
      "access control aspect",
      Some(JsonParser(accessControlSchema).asJsObject)
    )

    val orgAspectDef = AspectDefinition(
      organizationId,
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
    } finally {
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

  describe("should authorize non-link aspect query") {
    it(
      "on specified record (as path param)"
    ) { param =>
      createAspectDefinitions(param)
      createRecords(param)

      userIdsAndExpectedRecordIdIndexesWithoutLink.map(
        userIdAndExpectedRecordIndexes => {
          val userId = userIdAndExpectedRecordIndexes._1
          val expectedRecordIndexes = userIdAndExpectedRecordIndexes._2
          var foundRecordsCounter = 0

          testRecords.zipWithIndex.map {
            case (record, recordIndex) =>
              val recordId = record.id

              Get(s"/v0/records/$recordId/aspects/$organizationId") ~> addTenantIdHeader(
                TENANT_0
              ) ~> addJwtToken(userId) ~> param.api(Full).routes ~> check {
                val theResponse = responseAs[Option[JsObject]]
                if (expectedRecordIndexes.contains(recordIndex)) {
                  status shouldBe StatusCodes.OK
                  foundRecordsCounter = foundRecordsCounter + 1
                  theResponse.get.fields("name") shouldBe JsString(
                    recordOrgNames(recordIndex)
                  )
                } else {
                  status shouldBe StatusCodes.NotFound
                  theResponse.get.fields("message") shouldBe JsString(
                    "No record or aspect exists with the given IDs."
                  )
                }
              }
          }

          foundRecordsCounter shouldBe expectedRecordIndexes.length
        }
      )
    }

    it(
      "on specified record (as query param)"
    ) { param =>
      createAspectDefinitions(param)
      createRecords(param)

      userIdsAndExpectedRecordIdIndexesWithoutLink.map(
        userIdAndExpectedRecordIndexes => {
          val userId = userIdAndExpectedRecordIndexes._1
          val expectedRecordIndexes = userIdAndExpectedRecordIndexes._2
          var foundRecordsCounter = 0

          testRecords.zipWithIndex.map {
            case (record, index) =>
              val recordId = record.id

              Get(s"/v0/records/$recordId?aspect=$organizationId") ~> addTenantIdHeader(
                TENANT_0
              ) ~> addJwtToken(userId) ~> param.api(Full).routes ~> check {
                if (expectedRecordIndexes.contains(index)) {
                  foundRecordsCounter = foundRecordsCounter + 1
                  val record = responseAs[Option[Record]]
                  status shouldBe StatusCodes.OK
                  record.get.id shouldBe "record-" + index
                  record.get
                    .aspects(organizationId)
                    .fields("name") shouldBe JsString(
                    recordOrgNames(index)
                  )
                } else {
                  status shouldBe StatusCodes.NotFound
                }
              }
          }

          foundRecordsCounter shouldBe expectedRecordIndexes.length
        }
      )
    }

    it(
      "on all records"
    ) { param =>
      createAspectDefinitions(param)
      createRecords(param)

      userIdsAndExpectedRecordIdIndexesWithoutLink.map(
        userIdAndExpectedRecordIndexes => {
          val userId = userIdAndExpectedRecordIndexes._1
          val expectedRecordIndexes = userIdAndExpectedRecordIndexes._2

          Get(s"/v0/records?aspect=$organizationId") ~> addTenantIdHeader(
            TENANT_0
          ) ~> addJwtToken(
            userId
          ) ~> param.api(Full).routes ~> check {
            status shouldBe StatusCodes.OK
            val records = responseAs[RecordsPage[Record]].records
            records.length shouldBe expectedRecordIndexes.length
            val results: List[(Record, Int)] =
              records.zip(expectedRecordIndexes)
            results.map(res => {
              val record = res._1
              val index = res._2
              record.id shouldBe "record-" + index
              record
                .aspects(organizationId)
                .fields("name") shouldEqual JsString(
                recordOrgNames(index)
              )
            })
          }
        }
      )
    }

    it(
      "on all records without specifying any aspects"
    ) { param =>
      createAspectDefinitions(param)
      createRecords(param)

      userIdsAndExpectedRecordIdIndexesWithoutLink.map(
        userIdAndExpectedRecordIndexes => {
          val userId = userIdAndExpectedRecordIndexes._1
          val expectedRecordIndexes = userIdAndExpectedRecordIndexes._2

          Get(s"/v0/records") ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
            userId
          ) ~> param.api(Full).routes ~> check {
            status shouldBe StatusCodes.OK
            val records = responseAs[RecordsPage[Record]].records
            records.length shouldBe expectedRecordIndexes.length
            val results: List[(Record, Int)] =
              records.zip(expectedRecordIndexes)
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
      "on all records with limit"
    ) { param =>
      createAspectDefinitions(param)
      createRecords(param)

      val limit = 3
      val userIdAndExpectedRecordIndexes = (userId0, List(0, 1, 2))

      val userId = userIdAndExpectedRecordIndexes._1
      val expectedRecordIndexes = userIdAndExpectedRecordIndexes._2

      Get(s"/v0/records?aspect=$organizationId&limit=$limit") ~> addTenantIdHeader(
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
          record.aspects(organizationId).fields("name") shouldEqual JsString(
            recordOrgNames(index)
          )
        })
      }

    }

  }

  describe("should authorize page tokens query") {

    it(
      "and return different page tokens for different users"
    ) { param =>
      createAspectDefinitions(param)
      createRecords(param)
      val pageSize = 3

      // If the test records are inserted into a clean table (current sequence = 0),
      // this map represents the expected zero-based page tokens for each users when
      // page size is set to 3. However, during development, records might be inserted
      // and deleted by developer frequently, resulting in non-zero based page tokens.
      // In that case, the expected page tokens will be adjusted later in the test.
      // See expectedPageTokens.
      val expectedPageTokensBaseMap = Map(
        userId0 -> List(0, 2, 5), // authorized to all 6 records
        userId1 -> List(0), // authorized to record-1, record-4
        userId2 -> List(0, 2), // authorized to record-2, record-3, record-4, record-5
        userId3 -> List(0), // authorized to record-3, record-4
        anonymous -> List(0) // authorized to record-4
      )

      userIdsAndExpectedRecordIdIndexesWithoutLink.map(
        userIdAndExpectedRecordIndexes => {
          val userId = userIdAndExpectedRecordIndexes._1

          var firstRecordToken = 0
          Get(s"/v0/records?limit=1") ~> addTenantIdHeader(
            TENANT_0
          ) ~> addJwtToken(
            userId
          ) ~> param.api(Full).routes ~> check {
            val page = responseAs[RecordsPage[Record]]
            if (page.hasMore)
              firstRecordToken = page.nextPageToken.map(Integer.parseInt).get
          }

          Get(s"/v0/records/pagetokens?aspect=$organizationId&limit=$pageSize") ~> addTenantIdHeader(
            TENANT_0
          ) ~> addJwtToken(
            userId
          ) ~> param.api(Full).routes ~> check {
            status shouldBe StatusCodes.OK
            val actualPageTokens = responseAs[List[String]]

            val expectedPageTokens = expectedPageTokensBaseMap(userId).map(
              offset => if (offset == 0) 0 else firstRecordToken + offset
            )

//            println(s"----- $userId, $firstRecordToken, $actualPageTokens")
            actualPageTokens
              .map(Integer.parseInt) shouldEqual expectedPageTokens
          }

        }
      )
    }

  }

  describe("should authorize query by aspect value") {
    def encode(rawQueriedValue: String) = {
      java.net.URLEncoder.encode(rawQueriedValue, "UTF-8")
    }

    val valueKey = "name"
    val queriedValue = encode(recordOrgNames(3)) // org names of record-3 and record-4

    it("and return record-3 and record-4 to userId0") { param =>
      Get(
        s"/v0/records?aspectQuery=$organizationId.$valueKey:$queriedValue&aspect=$organizationId"
      ) ~>
        addTenantIdHeader(TENANT_0) ~> addJwtToken(userId0) ~> param
        .api(Full)
        .routes ~> check {
        status shouldEqual StatusCodes.OK
        val page = responseAs[RecordsPage[Record]]
        page.records.length shouldBe 2
        val actual1 = page.records.head
        val expected1 = testRecords(3)
        actual1.id shouldBe expected1.id
        actual1.aspects(organizationId).fields(valueKey) shouldBe expected1
          .aspects(organizationId)
          .fields(valueKey)

        val actual2 = page.records(1)
        val expected2 = testRecords(4)
        actual2.id shouldBe expected2.id
        actual2.aspects(organizationId).fields(valueKey) shouldBe expected2
          .aspects(organizationId)
          .fields(valueKey)
      }
    }

    it("and only return record-4 to anonymous user") { param =>
      Get(
        s"/v0/records?aspectQuery=$organizationId.$valueKey:$queriedValue&aspect=$organizationId"
      ) ~>
        addTenantIdHeader(TENANT_0) ~> addJwtToken(anonymous) ~> param
        .api(Full)
        .routes ~> check {
        status shouldEqual StatusCodes.OK
        val page = responseAs[RecordsPage[Record]]
        page.records.length shouldBe 1
        val actual = page.records.head
        val expected = testRecords(4)
        actual.id shouldBe expected.id
        actual.aspects(organizationId).fields(valueKey) shouldBe expected
          .aspects(organizationId)
          .fields(valueKey)
      }
    }

  }

  describe("should authorize meta query") {
    it(
      "of summary on all records"
    ) { param =>
      createAspectDefinitions(param)
      createRecords(param)

      userIdsAndExpectedRecordIdIndexesWithoutLink.map(
        userIdAndExpectedRecordIndexes => {
          val userId = userIdAndExpectedRecordIndexes._1
          val expectedRecordIndexes = userIdAndExpectedRecordIndexes._2

          Get(s"/v0/records/summary") ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
            userId
          ) ~> param.api(Full).routes ~> check {
            status shouldBe StatusCodes.OK
            val records = responseAs[RecordsPage[RecordSummary]].records
            records.length shouldBe expectedRecordIndexes.length
            val results: List[(RecordSummary, Int)] =
              records.zip(expectedRecordIndexes)
            results.map(res => {
              val record = res._1
              val index = res._2
              record.id shouldBe "record-" + index
              record.aspects shouldBe testRecords(index).aspects.keys.toList
            })
          }
        }
      )
    }

    it(
      "of summary on specified record"
    ) { param =>
      createAspectDefinitions(param)
      createRecords(param)

      userIdsAndExpectedRecordIdIndexesWithoutLink.map(
        userIdAndExpectedRecordIndexes => {
          val userId = userIdAndExpectedRecordIndexes._1
          val expectedRecordIndexes = userIdAndExpectedRecordIndexes._2
          var foundRecordsCounter = 0

          testRecords.zipWithIndex.map {
            case (record, recordIndex) =>
              val recordId = record.id

              Get(s"/v0/records/summary/$recordId") ~> addTenantIdHeader(
                TENANT_0
              ) ~> addJwtToken(userId) ~> param.api(Full).routes ~> check {
                if (expectedRecordIndexes.contains(recordIndex)) {
                  status shouldBe StatusCodes.OK
                  foundRecordsCounter = foundRecordsCounter + 1
                  val recordSummary = responseAs[RecordSummary]
                  recordSummary.id shouldBe recordId
                  recordSummary.aspects shouldBe testRecords(recordIndex).aspects.keys.toList
                } else {
                  status shouldBe StatusCodes.NotFound
                }
              }
          }

          foundRecordsCounter shouldBe expectedRecordIndexes.length
        }
      )
    }

    it(
      "of count on all records"
    ) { param =>
      createAspectDefinitions(param)
      createRecords(param)

      userIdsAndExpectedRecordIdIndexesWithoutLink.map(
        userIdAndExpectedRecordIndexes => {
          val userId = userIdAndExpectedRecordIndexes._1
          val expectedRecordIndexes = userIdAndExpectedRecordIndexes._2

          Get(s"/v0/records/count") ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
            userId
          ) ~> param.api(Full).routes ~> check {
            status shouldBe StatusCodes.OK
            val countResponse = responseAs[CountResponse]
            countResponse.count shouldBe expectedRecordIndexes.length
          }
        }
      )

    }

  }

  describe("should authorize single link aspect query") {
    it(
      "and return link to authorized user (dereference=false)"
    ) { param =>
      createAspectDefinitions(param)
      createRecords(param)

      val referencingRecordId = "record-2"
      val referencedRecordId = "record-1"

      Get(
        s"/v0/records/$referencingRecordId?aspect=$withLinkId&dereference=false"
      ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
        userId0
      ) ~> param.api(Full).routes ~> check {
        status shouldBe StatusCodes.OK
        val record = responseAs[Record]
        record.id shouldBe referencingRecordId
        record.aspects(withLinkId).fields(linkName) shouldEqual JsString(
          referencedRecordId
        )
      }
    }

    it(
      "and return link to authorized user (dereference=true)"
    ) { param =>
      createAspectDefinitions(param)
      createRecords(param)

      val referencingRecordId = "record-2"
      val referencedRecordIndex = 1 // "record-1"

      Get(
        s"/v0/records/$referencingRecordId?aspect=$withLinkId&dereference=true"
      ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
        userId0
      ) ~> param.api(Full).routes ~> check {
        status shouldBe StatusCodes.OK
        val record = responseAs[Record]
        record.id shouldBe referencingRecordId
        val expectedTarget = testRecords(referencedRecordIndex)
        record
          .aspects(withLinkId)
          .fields(linkName)
          .convertTo[Record] shouldEqual expectedTarget
      }
    }

    it(
      "and not return link to unauthorized user (dereference=false)"
    ) { param =>
      createAspectDefinitions(param)
      createRecords(param)

      val referencingRecordIndex = 2
      val referencingRecordId = "record-" + referencingRecordIndex

      Get(
        s"/v0/records/$referencingRecordId?aspect=$withLinkId&dereference=false"
      ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
        userId2
      ) ~> param.api(Full).routes ~> check {
        status shouldBe StatusCodes.NotFound
      }

      Get(
        s"/v0/records/$referencingRecordId?aspect=$organizationId&optionalAspect=$withLinkId&dereference=false"
      ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
        userId2
      ) ~> param.api(Full).routes ~> check {
        status shouldBe StatusCodes.OK
        val record = responseAs[Record]
        record.id shouldBe referencingRecordId
        record.aspects.get(withLinkId) shouldBe None
        record.aspects(organizationId).fields("name") shouldBe JsString(
          recordOrgNames(referencingRecordIndex)
        )
      }
    }

    it(
      "and not return link to unauthorized user (dereference=true)"
    ) { param =>
      createAspectDefinitions(param)
      createRecords(param)

      val referencingRecordIndex = 2
      val referencingRecordId = "record-" + referencingRecordIndex

      Get(
        s"/v0/records/$referencingRecordId?aspect=$withLinkId&dereference=true"
      ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
        userId2
      ) ~> param.api(Full).routes ~> check {
        status shouldBe StatusCodes.NotFound
      }

      Get(
        s"/v0/records/$referencingRecordId?aspect=$organizationId&optionalAspect=$withLinkId&dereference=true"
      ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
        userId2
      ) ~> param.api(Full).routes ~> check {
        status shouldBe StatusCodes.OK
        val record = responseAs[Record]
        record.id shouldBe referencingRecordId
        record.aspects.get(withLinkId) shouldBe None
        record.aspects(organizationId).fields("name") shouldBe JsString(
          recordOrgNames(referencingRecordIndex)
        )
      }

    }

    it(
      "for all users on all records (dereference=false)"
    ) { param =>
      createAspectDefinitions(param)
      createRecords(param)

      userIdsAndExpectedRecordIdIndexesWithSingleLink.map(
        userIdAndExpectedRecordIndexes => {
          val userId = userIdAndExpectedRecordIndexes._1
          val expectedRecordIndexes = userIdAndExpectedRecordIndexes._2

          Get(s"/v0/records?aspect=$withLinkId") ~> addTenantIdHeader(
            TENANT_0
          ) ~> addJwtToken(
            userId
          ) ~> param.api(Full).routes ~> check {
            status shouldBe StatusCodes.OK
            val records = responseAs[RecordsPage[Record]].records
            records.length shouldBe expectedRecordIndexes.length
            val results: List[(Record, Int)] =
              records.zip(expectedRecordIndexes)
            results.map(res => {
              val record = res._1
              val index = res._2
              record.id shouldBe "record-" + index
              record.aspects(withLinkId).fields(linkName) shouldEqual JsString(
                singleLinkRecordIdMap(record.id)
              )
            })
          }
        }
      )
    }
  }

  describe("should authorize array links aspect query") {
    it(
      "and return record-5 with both record-1 and record-3 to userId0 (dereference=false)"
    ) { param =>
      createAspectDefinitions(param)
      createRecords(param)

      val referencingRecordId = "record-5"

      Get(
        s"/v0/records/$referencingRecordId?aspect=$withLinksId&dereference=false"
      ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
        userId0
      ) ~> param.api(Full).routes ~> check {
        status shouldBe StatusCodes.OK
        val record = responseAs[Record]
        record.id shouldBe referencingRecordId
        record.aspects(withLinksId).fields(linksName) shouldEqual JsArray(
          JsString("record-1"),
          JsString("record-3")
        )
      }
    }

    it(
      "and return record-5 with both record-1 and record-3 to userId0 (dereference=true)"
    ) { param =>
      createAspectDefinitions(param)
      createRecords(param)

      val referencingRecordId = "record-5"

      Get(
        s"/v0/records/$referencingRecordId?aspect=$withLinksId&dereference=true"
      ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
        userId0
      ) ~> param.api(Full).routes ~> check {
        status shouldBe StatusCodes.OK
        val record = responseAs[Record]
        record.id shouldBe referencingRecordId

        val referencedRecordIndex1 = 1
        val expectedTarget1 = testRecords(referencedRecordIndex1)

        val referencedRecordIndex2 = 3
        val expectedTarget2 = testRecords(referencedRecordIndex2)

        val actual = record
          .aspects(withLinksId)
          .fields(linksName)
          .convertTo[Array[Record]]

        actual shouldEqual Array(expectedTarget1, expectedTarget2)
      }
    }

    it(
      "and return record-5 with record-3 but not record-1 to userId2 (dereference=false)"
    ) { param =>
      createAspectDefinitions(param)
      createRecords(param)

      val referencingRecordId = "record-5"

      Get(
        s"/v0/records/$referencingRecordId?aspect=$withLinksId&dereference=false"
      ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
        userId2
      ) ~> param.api(Full).routes ~> check {
        status shouldBe StatusCodes.OK
        val record = responseAs[Record]
        record.id shouldBe referencingRecordId
        record.aspects(withLinksId).fields(linksName) shouldEqual JsArray(
          JsString("record-3")
        )
      }
    }

    it(
      "and return record-5 with record-3 but not record-1 to userId2 (dereference=true)"
    ) { param =>
      createAspectDefinitions(param)
      createRecords(param)

      val referencingRecordId = "record-5" // with links to record-1 and record-3

      Get(
        s"/v0/records/$referencingRecordId?aspect=$withLinksId&dereference=true"
      ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
        userId2
      ) ~> param.api(Full).routes ~> check {
        status shouldBe StatusCodes.OK
        val record = responseAs[Record]
        record.id shouldBe referencingRecordId

        val referencedRecordIndex = 3
        val expectedTarget = testRecords(referencedRecordIndex)

        val actual = record
          .aspects(withLinksId)
          .fields(linksName)
          .convertTo[Array[Record]]

        actual shouldEqual Array(expectedTarget)
      }
    }

    it(
      "and not return any links referenced by record-4 to anonymous user (dereference=true)"
    ) { param =>
      createAspectDefinitions(param)
      createRecords(param)

      val referencingRecordId = "record-4" // with links to record-1 and record-3
      val withLinksAspectId = "withLinks"

      Get(
        s"/v0/records/$referencingRecordId?aspect=$withLinksAspectId&dereference=true"
      ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
        anonymous
      ) ~> param.api(Full).routes ~> check {
        status shouldBe StatusCodes.NotFound
      }
    }

    it(
      "and return record-3 with empty links to userId2 (dereference=true)"
    ) { param =>
      createAspectDefinitions(param)
      createRecords(param)

      val referencingRecordId = "record-3" // with links to nothing

      Get(
        s"/v0/records/$referencingRecordId?aspect=$withLinksId&dereference=true"
      ) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
        userId2
      ) ~> param.api(Full).routes ~> check {
        status shouldBe StatusCodes.OK
        val record = responseAs[Record]
        record.id shouldBe referencingRecordId

        val actual = record
          .aspects(withLinksId)
          .fields(linksName)
          .convertTo[Array[Record]]

        actual.length shouldBe 0
      }
    }
  }

}
