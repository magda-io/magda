package au.csiro.data61.magda.registry

import akka.http.scaladsl.model.StatusCodes
import au.csiro.data61.magda.model.Registry._
import spray.json._
import scala.io.Source.fromFile

import scala.util.Success
import scala.io.BufferedSource

class RecordHistoryServiceSpec extends ApiSpec {

  describe("History Api") {

    def installAspectSchema(
        aspectId: String
    )(implicit param: FixtureParam): Unit = {
      val schemaSource: BufferedSource = fromFile(
        s"magda-registry-aspects/${aspectId}.schema.json"
      )

      val schemaString: String =
        try {
          schemaSource.mkString
        } finally {
          schemaSource.close()
        }

      val aspectDef = AspectDefinition(
        aspectId,
        s"${aspectId} aspect",
        Some(JsonParser(schemaString).asJsObject)
      )

      param.asAdmin(Post(s"/v0/aspects", aspectDef)) ~> addTenantIdHeader(
        TENANT_1
      ) ~> param.api(Full).routes ~> check {
        status shouldBe StatusCodes.OK
      }
    }

    def createAspects()(implicit param: FixtureParam): Unit = {
      val requiredAspects = List(
        "dcat-dataset-strings",
        "dataset-distributions",
        "dcat-distribution-strings",
        "dataset-publisher",
        "organization-details"
      )
      requiredAspects.foreach(aspectId => installAspectSchema(aspectId))
    }

    def createDataset(
        recordIdSuffix: String = ""
    )(implicit param: FixtureParam) = {

      val orgRecord = Record(
        s"test-org-id-${recordIdSuffix}",
        "test org",
        Map(
          "organization-details" -> JsObject(
            Map(
              "name" -> JsString(s"test org ${recordIdSuffix}"),
              "title" -> JsString(s"test org ${recordIdSuffix}")
            )
          )
        ),
        Some("tag")
      )

      val distRecord = Record(
        s"test-dist-id-${recordIdSuffix}",
        s"test distribution ${recordIdSuffix}",
        Map(
          "dcat-distribution-strings" -> JsObject(
            Map(
              "title" -> JsString(s"test distribution ${recordIdSuffix}"),
              "description" -> JsString(
                s"test distribution ${recordIdSuffix} desc"
              )
            )
          )
        ),
        Some("tag")
      )

      val datasetRecord = Record(
        s"test-ds-id-${recordIdSuffix}",
        "test dataset",
        Map(
          "dcat-dataset-strings" -> JsObject(
            Map(
              "title" -> JsString(s"test dataset ${recordIdSuffix}"),
              "description" -> JsString(s"test dataset ${recordIdSuffix} desc"),
              "publisher" -> JsString(s"test org ${recordIdSuffix}")
            )
          ),
          "dataset-publisher" -> JsObject(
            Map("publisher" -> JsString(orgRecord.id))
          ),
          "dataset-distributions" -> JsObject(
            Map("distributions" -> JsArray(Vector(JsString(distRecord.id))))
          )
        ),
        Some("tag")
      )

      param.asAdmin(Post(s"/v0/records", orgRecord)) ~> addTenantIdHeader(
        TENANT_1
      ) ~> param.api(Full).routes ~> check {
        status shouldBe StatusCodes.OK
        responseAs[Record] shouldEqual orgRecord.copy(tenantId = Some(TENANT_1))
      }

      param.asAdmin(Post(s"/v0/records", distRecord)) ~> addTenantIdHeader(
        TENANT_1
      ) ~> param.api(Full).routes ~> check {
        status shouldBe StatusCodes.OK
        responseAs[Record] shouldEqual distRecord.copy(
          tenantId = Some(TENANT_1)
        )
      }

      param.asAdmin(Post(s"/v0/records", datasetRecord)) ~> addTenantIdHeader(
        TENANT_1
      ) ~> param.api(Full).routes ~> check {
        status shouldBe StatusCodes.OK
        responseAs[Record] shouldEqual datasetRecord.copy(
          tenantId = Some(TENANT_1)
        )
      }

      (datasetRecord, orgRecord, distRecord)
    }

    def getEvents(
        recordId: String,
        aspectIds: Seq[String] = Seq(),
        dereference: Boolean = false
    )(implicit param: FixtureParam): List[RegistryEvent] = {

      val queryParams = aspectIds.map(aspectId => s"aspect=${aspectId}") :+ s"dereference=${dereference.toString}"

      Get(
        s"/v0/records/${recordId}/history${if (queryParams.isEmpty) ""
        else "?" + queryParams.mkString("&")}"
      ) ~> addTenantIdHeader(TENANT_1) ~> param
        .api(ReadOnly)
        .routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[EventsPage].events
      }
    }

    def selectEvents(
        events: Seq[RegistryEvent],
        recordIds: Seq[String] = Seq(),
        aspectIds: Seq[String] = Seq()
    ) = events.filter { event =>
      (if (recordIds.isEmpty) true
       else
         recordIds.indexOf(
           event.data.fields
             .getOrElse("recordId", JsString(""))
             .convertTo[String]
         ) != -1) &&
      (if (aspectIds.isEmpty) true
       else
         aspectIds.indexOf(
           event.data.fields
             .getOrElse("aspectId", JsString(""))
             .convertTo[String]
         ) != -1)
    }

    describe("Get History By Record") {
      it(
        "should only return events for selected record when dereference is false"
      ) { implicit param =>
        createAspects()
        val records1 = createDataset("1")
        val records2 = createDataset("2")

        val events = getEvents(records1._1.id, Seq(), false)

        // all events are for dataset 1
        // no events from dataset 2 or its linked records are shown up
        selectEvents(events, recordIds = List(records1._1.id)).size shouldEqual events.size

        // no events for "dcat-distribution-strings" or "organization-details"
        // as dereference is false
        selectEvents(events, aspectIds = List("dcat-distribution-strings")).size shouldEqual 0
        selectEvents(events, aspectIds = List("organization-details")).size shouldEqual 0

        // the following dataset aspects events number should be larger than 0
        selectEvents(
          events,
          recordIds = List(records1._1.id),
          aspectIds = List("dcat-dataset-strings")
        ).size should be > 0

        selectEvents(
          events,
          recordIds = List(records1._1.id),
          aspectIds = List("dataset-distributions")
        ).size should be > 0

        selectEvents(
          events,
          recordIds = List(records1._1.id),
          aspectIds = List("dataset-publisher")
        ).size should be > 0
      }

      it(
        "should filter events by aspect properly for selected record when dereference is false"
      ) { implicit param =>
        createAspects()
        val records1 = createDataset("1")
        val records2 = createDataset("2")

        // filter by "dcat-dataset-strings" & "dataset-publisher" (aspect contains array items link)
        var events =
          getEvents(
            records1._1.id,
            Seq("dcat-dataset-strings", "dataset-distributions"),
            false
          )

        // all events are for dataset 1
        // no events from dataset 2 or its linked records are shown up
        selectEvents(events, recordIds = List(records1._1.id)).size shouldEqual events.size

        // no events for "dcat-distribution-strings" or "organization-details"
        // as dereference is false (even when "dataset-distributions" is selected)
        selectEvents(events, aspectIds = List("dcat-distribution-strings")).size shouldEqual 0
        selectEvents(events, aspectIds = List("organization-details")).size shouldEqual 0
        // no events for "dataset-publisher" as it's not the selected aspect
        selectEvents(events, aspectIds = List("dataset-publisher")).size shouldEqual 0

        // the following dataset aspects events number should be larger than 0
        selectEvents(
          events,
          recordIds = List(records1._1.id),
          aspectIds = List("dcat-dataset-strings")
        ).size should be > 0

        selectEvents(
          events,
          recordIds = List(records1._1.id),
          aspectIds = List("dataset-distributions")
        ).size should be > 0

        // filter by "dcat-dataset-strings" & "dataset-publisher" (aspect contains single item link)
        events = getEvents(
          records1._1.id,
          Seq("dcat-dataset-strings", "dataset-publisher"),
          false
        )

        // all events are for dataset 1
        // no events from dataset 2 or its linked records are shown up
        selectEvents(events, recordIds = List(records1._1.id)).size shouldEqual events.size

        // no events for "dcat-distribution-strings" or "organization-details"
        // as dereference is false (even when "dataset-distributions" is selected)
        selectEvents(events, aspectIds = List("dcat-distribution-strings")).size shouldEqual 0
        selectEvents(events, aspectIds = List("organization-details")).size shouldEqual 0
        // no events for "dataset-distributions" as it's not the selected aspect
        selectEvents(events, aspectIds = List("dataset-distributions")).size shouldEqual 0

        // the following dataset aspects events number should be larger than 0
        selectEvents(
          events,
          recordIds = List(records1._1.id),
          aspectIds = List("dcat-dataset-strings")
        ).size should be > 0

        selectEvents(
          events,
          recordIds = List(records1._1.id),
          aspectIds = List("dataset-publisher")
        ).size should be > 0

        // filter by "dcat-dataset-strings" & "organization-details" (linked record's aspect)
        events = getEvents(
          records1._1.id,
          Seq("dcat-dataset-strings", "organization-details"),
          false
        )

        // all events are for dataset 1
        // no events from dataset 2 or its linked records are shown up
        selectEvents(events, recordIds = List(records1._1.id)).size shouldEqual events.size

        // no events for "dcat-distribution-strings" or "organization-details"
        // as dereference is false
        selectEvents(events, aspectIds = List("dcat-distribution-strings")).size shouldEqual 0
        selectEvents(events, aspectIds = List("organization-details")).size shouldEqual 0
        // no events for "dataset-distributions" or "dataset-publisher" as they are not the selected aspects
        selectEvents(events, aspectIds = List("dataset-distributions")).size shouldEqual 0
        selectEvents(events, aspectIds = List("dataset-publisher")).size shouldEqual 0

        // the following dataset aspects events number should be larger than 0
        selectEvents(
          events,
          recordIds = List(records1._1.id),
          aspectIds = List("dcat-dataset-strings")
        ).size should be > 0
      }

      it(
        "should return events for selected record and all its linked records when dereference is true"
      ) { implicit param =>
        createAspects()
        val records1 = createDataset("1")
        val records2 = createDataset("2")

        val events = getEvents(records1._1.id, Seq(), true)

        // all events are for record 1 (dataset), record 1's org record & record 1's dist record
        // no events from record 2 (dataset) or its linked records are shown up
        selectEvents(
          events,
          recordIds = List(records1._1.id, records1._2.id, records1._3.id)
        ).size shouldEqual events.size

        // should found events for "dcat-distribution-strings" (array links) or "organization-details" (single item link)
        // as dereference is true
        selectEvents(
          events,
          recordIds = List(records1._3.id),
          aspectIds = List("dcat-distribution-strings")
        ).size should be > 0
        selectEvents(
          events,
          recordIds = List(records1._2.id),
          aspectIds = List("organization-details")
        ).size should be > 0

        // the following dataset aspects events number should be larger than 0
        selectEvents(
          events,
          recordIds = List(records1._1.id),
          aspectIds = List("dcat-dataset-strings")
        ).size should be > 0

        selectEvents(
          events,
          recordIds = List(records1._1.id),
          aspectIds = List("dataset-distributions")
        ).size should be > 0

        selectEvents(
          events,
          recordIds = List(records1._1.id),
          aspectIds = List("dataset-publisher")
        ).size should be > 0
      }

      it(
        "should filter events by aspect properly for selected record and all its linked records when dereference is true"
      ) { implicit param =>
        createAspects()
        val records1 = createDataset("1")
        val records2 = createDataset("2")

        var events =
          getEvents(records1._1.id, Seq("dcat-dataset-strings"), true)

        // all events are for record 1 (dataset). record 1's org record & record 1's dist record are not included
        // as `link` aspects are not included
        // no events from record 2 (dataset) or its linked records are shown up
        selectEvents(events, recordIds = List(records1._1.id)).size shouldEqual events.size

        // only "dcat-dataset-strings" or record event should be returned
        selectEvents(
          events,
          recordIds = List(records1._1.id),
          aspectIds = List(
            // select all event with aspect "dcat-dataset-strings" or "" (record event)
            "dcat-dataset-strings",
            ""
          )
        ).size shouldEqual events.size

        // should also filter aspect contains link properly
        // the linked record's record event should also be included but not any its aspect
        events = getEvents(records1._1.id, Seq("dataset-distributions"), true)

        selectEvents(
          events,
          recordIds = List(
            records1._1.id,
            records1._3.id
          )
        ).size shouldEqual events.size

        selectEvents(
          events,
          recordIds = List(
            records1._1.id
          )
        ).size should be > 0

        selectEvents(
          events,
          recordIds = List(
            records1._3.id
          )
        ).size should be > 0

        selectEvents(
          events,
          recordIds = List(records1._1.id, records1._3.id),
          aspectIds = List(
            // select all event with aspect "dataset-distributions" or "" (record event)
            "dataset-distributions",
            ""
          )
        ).size shouldEqual events.size

        selectEvents(
          events,
          recordIds = List(
            records1._1.id
          ),
          aspectIds = List(
            "dataset-distributions"
          )
        ).size should be > 0

        // filter by linked record aspects (e.g. distributions 's `dcat-distribution-strings`)
        // will only work if corresponding dataset aspect that contains the link is also included (e.g. `dataset-distributions`)
        events = getEvents(
          records1._1.id,
          Seq("dcat-distribution-strings", "dataset-distributions"),
          true
        )

        selectEvents(
          events,
          recordIds = List(
            records1._1.id,
            records1._3.id
          )
        ).size shouldEqual events.size

        selectEvents(
          events,
          recordIds = List(records1._1.id, records1._3.id),
          aspectIds = List(
            // select all event with aspect "dcat-distribution-strings", "dataset-distributions" or "" (record event)
            "dcat-distribution-strings",
            "dataset-distributions",
            ""
          )
        ).size shouldEqual events.size

        selectEvents(
          events,
          recordIds = List(
            records1._3.id
          ),
          aspectIds = List(
            "dcat-distribution-strings"
          )
        ).size should be > 0

        selectEvents(
          events,
          recordIds = List(
            records1._1.id
          ),
          aspectIds = List(
            "dataset-distributions"
          )
        ).size should be > 0

        // filter by linked record aspects (e.g. distributions 's `dcat-distribution-strings`)
        // without corresponding dataset aspect that contains the link (e.g. `dataset-distributions`)
        // will return only selected record's record events (no record aspect events will be returned)
        events =
          getEvents(records1._1.id, Seq("dcat-distribution-strings"), true)

        selectEvents(
          events,
          recordIds = List(
            records1._1.id
          ),
          aspectIds = List("")
        ).size shouldEqual events.size
      }

      it(
        "should include events from newly added distributions when dereference is true"
      ) { implicit param =>
        createAspects()
        val records1 = createDataset("1")
        val records2 = createDataset("2")

        val events = getEvents(records1._1.id, Seq(), true)

        param.asAdmin(
          Put(
            s"/v0/records/${records1._1.id}/aspects/dataset-distributions",
            JsObject(
              Map(
                "distributions" -> JsArray(
                  // dataset 1's current distribution
                  JsString(records1._3.id),
                  // add dataset 2's current distribution to dataset 1
                  JsString(records2._3.id)
                )
              )
            )
          )
        ) ~> addTenantIdHeader(TENANT_1) ~> param.api(Full).routes ~> check {
          status shouldBe StatusCodes.OK
        }

        // all events are for record 1 (dataset), record 1's org record, record 1's dist record and record 2' dist record
        selectEvents(
          events,
          recordIds = List(
            records1._1.id,
            records1._2.id,
            records1._3.id,
            // -- the new distribution will be included now
            records2._3.id
          )
        ).size shouldEqual events.size
      }

      it(
        "should also include events from removed distributions when dereference is true"
      ) { implicit param =>
        createAspects()
        val records1 = createDataset("1")
        val records2 = createDataset("2")

        val events = getEvents(records1._1.id, Seq(), true)

        // remove all distribution for dataset 1
        param.asAdmin(
          Put(
            s"/v0/records/${records1._1.id}/aspects/dataset-distributions",
            JsObject(Map("distributions" -> JsArray()))
          )
        ) ~> addTenantIdHeader(TENANT_1) ~> param.api(Full).routes ~> check {
          status shouldBe StatusCodes.OK
        }

        // all events are for record 1 (dataset), record 1's org record
        // and still include record 1 distribution (as it had been assigned to the selected dataset)
        selectEvents(
          events,
          recordIds = List(
            records1._1.id,
            records1._2.id,
            records1._3.id
          )
        ).size shouldEqual events.size

        // add distribution 2 to dataset 1
        param.asAdmin(
          Put(
            s"/v0/records/${records1._1.id}/aspects/dataset-distributions",
            JsObject(
              Map(
                "distributions" -> JsArray(
                  JsString(records2._3.id)
                )
              )
            )
          )
        ) ~> addTenantIdHeader(TENANT_1) ~> param
          .api(Full)
          .routes ~> check {
          status shouldBe StatusCodes.OK
        }

        // all events are for record 1 (dataset),  record 1's org record, record 2's dist record
        // and still include record 1 distribution (as it had been assigned to the selected dataset)
        selectEvents(
          events,
          recordIds = List(
            records1._1.id,
            records1._2.id,
            // --- removed distribution is still included (as it had been assigned to the selected dataset)
            records1._3.id,
            // -- the new distribution will be included now
            records2._3.id
          )
        ).size shouldEqual events.size
      }

      it(
        "should also include events from newly assigned publisher when dereference is true"
      ) { implicit param =>
        createAspects()
        val records1 = createDataset("1")
        val records2 = createDataset("2")

        val events = getEvents(records1._1.id, Seq(), true)

        param.asAdmin(
          Put(
            s"/v0/records/${records1._1.id}/aspects/dataset-publisher",
            JsObject(
              Map(
                "publisher" -> JsString(
                  // assign dataset 2's org record as dataset 1's publisher
                  records2._2.id
                )
              )
            )
          )
        ) ~> addTenantIdHeader(TENANT_1) ~> param.api(Full).routes ~> check {
          status shouldBe StatusCodes.OK
        }

        // all events are for record 1 (dataset), record 1's org record, record 1's dist record and record 2' org record
        selectEvents(
          events,
          recordIds = List(
            records1._1.id,
            // --- not assigned org record still included (as it had been assigned to the selected dataset)
            records1._2.id,
            records1._3.id,
            // -- the new assigned org record will be included now
            records2._2.id
          )
        ).size shouldEqual events.size
      }

    }
  }

}
