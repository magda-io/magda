package au.csiro.data61.magda.registry

import akka.http.scaladsl.model.StatusCodes
import au.csiro.data61.magda.model.Registry._
import spray.json._

/**
  * This is functional test case suit. the auth is turned off in config in ApiSpec (i.e. all requested will be authorised)
  * to minimise the code. Auth related logic will be moved to a separate test case suit (with auth turned on).
  */
class RecordAspectServiceSpec extends ApiSpec {

  def settingUpTestData(param: FixtureParam, records: List[Record]) = {

    val testDataAspects = records
      .flatMap(_.aspects.map(_._1))
      .toSet
      .map(aspectId => AspectDefinition(aspectId, s"${aspectId} aspect", None))

    testDataAspects.foreach { aspect =>
      Post("/v0/aspects", aspect) ~> addUserId() ~> addTenantIdHeader(
        TENANT_1
      ) ~> param.api(Full).routes ~> check {
        status shouldEqual StatusCodes.OK
      }
    }

    records.foreach { record =>
      Post("/v0/records", record) ~> addUserId() ~> addTenantIdHeader(
        TENANT_1
      ) ~> param.api(Full).routes ~> check {
        status shouldEqual StatusCodes.OK
      }
    }
    param.authFetcher.resetMock()
  }

  def verifyAspectData(
      param: FixtureParam,
      recordId: String,
      aspectId: String,
      jsonString: String
  ) = {
    Get(s"/v0/records/${recordId}/aspects/${aspectId}") ~> addUserId() ~> addTenantIdHeader(
      TENANT_1
    ) ~> param.api(Full).routes ~> check {
      withClue(responseAs[String]) {
        status shouldEqual StatusCodes.OK
      }
      val aspectData = responseAs[JsObject]
      aspectData.toString() shouldBe
        jsonString.parseJson.toString()
    }
  }

  describe("Record Aspect Service Logic") {

    describe(
      "Delete items from an Array in Aspect Data {delete} /v0/registry/records/aspectArrayItems/{aspectId}"
    ) {
      it("should delete items from aspect data array correctly") { param =>
        settingUpTestData(
          param,
          List(
            Record(
              id = "record-1",
              name = "test record 1",
              aspects = Map(
                "test-aspect" ->
                  """
                    | {
                    |    "b" : "yes",
                    |    "d" : {
                    |      "d1":["A","B","C",4, 5, 6]
                    |    },
                    |    "e": 2
                    | }
                    |""".stripMargin.parseJson.asJsObject
              ),
              None,
              None
            ),
            Record(
              id = "record-2",
              name = "test record 2",
              aspects = Map(
                "test-aspect" ->
                  """
                    | {
                    |    "a" : ["3","4"],
                    |    "d" : {
                    |      "d1":["A","B","C",14, 15, 16]
                    |    }
                    | }
                    |""".stripMargin.parseJson.asJsObject
              ),
              None,
              None
            ),
            Record(
              id = "record-3",
              name = "test record 3",
              aspects = Map(
                "test-aspect" ->
                  """
                    | {
                    |    "a" : ["A","B", "C"]
                    | }
                    |""".stripMargin.parseJson.asJsObject
              ),
              None,
              None
            ),
            Record(
              id = "record-4",
              name = "test record 4",
              aspects = Map(),
              None,
              None
            )
          )
        )

        Delete(
          s"/v0/records/aspectArrayItems/test-aspect",
          JsObject(
            "recordIds" -> JsArray(
              Vector(
                JsString("record-1"),
                JsString("record-2"),
                JsString("record-3"),
                JsString("record-4")
              )
            ),
            "jsonPath" -> JsString("$.d.d1"),
            "items" -> JsArray(Vector(JsString("B"), JsNumber(5)))
          )
        ) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          withClue(s"Status Code: ${status} response: ${responseAs[String]}") {
            status shouldEqual StatusCodes.OK
          }
          val eventList = responseAs[List[Long]]
          eventList.length shouldBe 4
          eventList(2) shouldBe 0 // record 3 should not changed
          eventList(3) shouldBe 0 // record 3 should not changed
        }

        verifyAspectData(
          param,
          "record-1",
          "test-aspect",
          """
            |{
            |    "b" : "yes",
            |    "d" : {
            |      "d1":["A","C",4,6]
            |    },
            |    "e": 2
            | }
            |""".stripMargin
        )

        verifyAspectData(
          param,
          "record-2",
          "test-aspect",
          """
            |{
            |    "a" : ["3","4"],
            |    "d" : {
            |      "d1":["A","C",14, 15, 16]
            |    }
            | }
            |""".stripMargin
        )

        verifyAspectData(
          param,
          "record-3",
          "test-aspect",
          """
            |{
            |    "a" : ["A","B","C"]
            |}
            |""".stripMargin
        )

        Get(s"/v0/records/record-4/aspects/test-aspect") ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          withClue(responseAs[String]) {
            status shouldEqual StatusCodes.NotFound
          }
        }

      }
    }

    describe(
      "Modify endpoint {put} /v0/registry/records/aspects/{aspectId}"
    ) {
      it("should merge aspect correctly when merge = true") { param =>
        settingUpTestData(
          param,
          List(
            Record(
              id = "record-1",
              name = "test record 1",
              aspects = Map(
                "test-aspect" ->
                  """
                    | {
                    |    "a" : ["1","2"],
                    |    "b" : "yes",
                    |    "d" : {
                    |      "d1":1
                    |    },
                    |    "e": 2
                    | }
                    |""".stripMargin.parseJson.asJsObject
              ),
              None,
              None
            ),
            Record(
              id = "record-2",
              name = "test record 2",
              aspects = Map(
                "test-aspect" ->
                  """
                    | {
                    |    "a" : ["3","4"]
                    | }
                    |""".stripMargin.parseJson.asJsObject
              ),
              None,
              None
            ),
            Record(
              id = "record-3",
              name = "test record 3",
              aspects = Map(),
              None,
              None
            )
          )
        )

        Put(
          s"/v0/records/aspects/test-aspect?merge=true",
          JsObject(
            "recordIds" -> JsArray(
              Vector(
                JsString("record-1"),
                JsString("record-2"),
                JsString("record-3")
              )
            ),
            "data" -> JsObject(
              "a" -> JsArray(Vector(JsString("2"), JsString("5"))),
              "b" -> JsString("no"),
              "c" -> JsString("c-value"),
              "d" -> JsObject("d2" -> JsNumber(2))
            )
          )
        ) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          withClue(responseAs[String]) {
            status shouldEqual StatusCodes.OK
          }
          val eventList = responseAs[List[Long]]
          eventList.length shouldBe 3
        }

        verifyAspectData(
          param,
          "record-1",
          "test-aspect",
          """
            |{
            |  "a" : ["1","2","5"],
            |  "b" : "no",
            |  "c" : "c-value",
            |  "d" : {
            |      "d1":1,
            |      "d2":2
            |   },
            |   "e": 2
            |}
            |""".stripMargin
        )

        verifyAspectData(
          param,
          "record-2",
          "test-aspect",
          """
            |{
            |  "a" : ["3","4","2","5"],
            |  "b" : "no",
            |  "c" : "c-value",
            |  "d" : {
            |      "d2":2
            |   }
            |}
            |""".stripMargin
        )

        verifyAspectData(
          param,
          "record-3",
          "test-aspect",
          """
            |{
            |  "a" : ["2","5"],
            |  "b" : "no",
            |  "c" : "c-value",
            |  "d" : {
            |      "d2":2
            |   }
            |}
            |""".stripMargin
        )
      }

      it("should replace aspect data when merge = false") { param =>
        settingUpTestData(
          param,
          List(
            Record(
              id = "record-1",
              name = "test record 2",
              aspects = Map(
                "test-aspect" ->
                  """
                    | {
                    |    "a" : [1,2],
                    |    "b" : "yes",
                    |    "d" : {
                    |      "d1":1
                    |    },
                    |    "e": 2
                    | }
                    |""".stripMargin.parseJson.asJsObject
              ),
              None,
              None
            ),
            Record(
              id = "record-2",
              name = "test record 2",
              aspects = Map(
                "test-aspect" ->
                  """
                    | {
                    |    "a" : [3,4]
                    | }
                    |""".stripMargin.parseJson.asJsObject
              ),
              None,
              None
            ),
            Record(
              id = "record-3",
              name = "test record 3",
              aspects = Map(),
              None,
              None
            )
          )
        )

        Put(
          s"/v0/records/aspects/test-aspect",
          JsObject(
            "recordIds" -> JsArray(
              Vector(
                JsString("record-1"),
                JsString("record-2"),
                JsString("record-3")
              )
            ),
            "data" -> JsObject(
              "a" -> JsArray(Vector(JsNumber(2), JsNumber(5))),
              "b" -> JsString("no"),
              "c" -> JsString("c-value"),
              "d" -> JsObject("d2" -> JsNumber(2))
            )
          )
        ) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          withClue(responseAs[String]) {
            status shouldEqual StatusCodes.OK
          }
          val eventList = responseAs[List[Long]]
          eventList.length shouldBe 3
        }

        verifyAspectData(
          param,
          "record-1",
          "test-aspect",
          """
            |{
            |  "a" : [2,5],
            |  "b" : "no",
            |  "c" : "c-value",
            |  "d" : {
            |      "d2":2
            |   }
            |}
            |""".stripMargin
        )

        verifyAspectData(
          param,
          "record-2",
          "test-aspect",
          """
            |{
            |  "a" : [2,5],
            |  "b" : "no",
            |  "c" : "c-value",
            |  "d" : {
            |      "d2":2
            |   }
            |}
            |""".stripMargin
        )

        verifyAspectData(
          param,
          "record-3",
          "test-aspect",
          """
            |{
            |  "a" : [2,5],
            |  "b" : "no",
            |  "c" : "c-value",
            |  "d" : {
            |      "d2":2
            |   }
            |}
            |""".stripMargin
        )
      }

    }

    describe(
      "Modify endpoint {put} /v0/registry/records/{recordId}/aspects/{aspectId}"
    ) {

      it("should merge aspect correctly when merge = true") { param =>
        settingUpTestData(
          param,
          List(
            Record(
              id = "xxxxx",
              name = "test record",
              aspects = Map(
                "test-aspect" ->
                  """
                    | {
                    |    "a" : [1,2],
                    |    "b" : "yes",
                    |    "d" : {
                    |      "d1":1
                    |    },
                    |    "e": 2
                    | }
                    |""".stripMargin.parseJson.asJsObject
              ),
              None,
              None
            )
          )
        )

        Put(
          s"/v0/records/xxxxx/aspects/test-aspect?merge=true",
          JsObject(
            "a" -> JsArray(Vector(JsNumber(2), JsNumber(5))),
            "b" -> JsString("no"),
            "c" -> JsString("c-value"),
            "d" -> JsObject("d2" -> JsNumber(2))
          )
        ) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          withClue(responseAs[String]) {
            status shouldEqual StatusCodes.OK
          }
          val aspectData = responseAs[JsObject]
          aspectData.toString() shouldBe
            """
              |{
              |  "a" : [1,2,5],
              |  "b" : "no",
              |  "c" : "c-value",
              |  "d" : {
              |      "d1":1,
              |      "d2":2
              |   },
              |   "e": 2
              |}
              |""".stripMargin.parseJson.toString()
        }

        Get("/v0/records/xxxxx/aspects/test-aspect") ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          withClue(responseAs[String]) {
            status shouldEqual StatusCodes.OK
          }
          val aspectData = responseAs[JsObject]
          aspectData.toString() shouldBe
            """
              |{
              |  "a" : [1,2,5],
              |  "b" : "no",
              |  "c" : "c-value",
              |  "d" : {
              |      "d1":1,
              |      "d2":2
              |   },
              |   "e": 2
              |}
              |""".stripMargin.parseJson.toString()
        }

      }

      it("should replace aspect instead when merge is not set") { param =>
        settingUpTestData(
          param,
          List(
            Record(
              id = "xxxxx",
              name = "test record",
              aspects = Map(
                "test-aspect" ->
                  """
                    | {
                    |    "a" : [1,2],
                    |    "b" : "yes",
                    |    "d" : {
                    |      "d1":1
                    |    },
                    |    "e": 2
                    | }
                    |""".stripMargin.parseJson.asJsObject
              ),
              None,
              None
            )
          )
        )

        Put(
          s"/v0/records/xxxxx/aspects/test-aspect",
          JsObject(
            "a" -> JsArray(Vector(JsNumber(2), JsNumber(5))),
            "b" -> JsString("no"),
            "c" -> JsString("c-value"),
            "d" -> JsObject("d2" -> JsNumber(2))
          )
        ) ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          withClue(responseAs[String]) {
            status shouldEqual StatusCodes.OK
          }
          val aspectData = responseAs[JsObject]
          aspectData.toString() shouldBe
            """
              |{
              |  "a" : [2,5],
              |  "b" : "no",
              |  "c" : "c-value",
              |  "d" : {
              |      "d2":2
              |   }
              |}
              |""".stripMargin.parseJson.toString()
        }

        Get("/v0/records/xxxxx/aspects/test-aspect") ~> addUserId() ~> addTenantIdHeader(
          TENANT_1
        ) ~> param.api(Full).routes ~> check {
          withClue(responseAs[String]) {
            status shouldEqual StatusCodes.OK
          }
          val aspectData = responseAs[JsObject]
          aspectData.toString() shouldBe
            """
              |{
              |  "a" : [2,5],
              |  "b" : "no",
              |  "c" : "c-value",
              |  "d" : {
              |      "d2":2
              |   }
              |}
              |""".stripMargin.parseJson.toString()
        }
      }

    }
  }
}
