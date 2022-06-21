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

  describe("Record Aspect Service Auth Logic") {
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
