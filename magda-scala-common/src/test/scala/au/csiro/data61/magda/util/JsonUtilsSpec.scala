package au.csiro.data61.magda.util

import au.csiro.data61.magda.ServerError
import spray.json._
import org.scalatest.{FunSpec, Matchers}
import akka.http.scaladsl.model.StatusCodes
import scala.util.{Failure, Try}

class JsonUtilsSpec extends FunSpec with Matchers {

  describe("test Json path array items deletion") {
    it("should delete number items from array correctly") {
      val objJson1 =
        """
          |    {
          |      "lotto":{
          |        "lotto-id":5,
          |        "winning-numbers":[2,45,34,23,7,5,3],
          |        "winners":[{
          |          "winner-id":23,
          |          "numbers":[2,45,34,23,3,5]
          |        },{
          |          "winner-id":54,
          |          "numbers":[52,3,12,11,18,22]
          |        }]
          |      }
          |    }
          |""".stripMargin

      JsonUtils
        .deleteJsonArrayItemsByJsonPath(
          objJson1.parseJson,
          "$.lotto.winners[1].numbers",
          List(JsNumber(3), JsNumber(18))
        )
        .toString() shouldBe
        """
          |  {
          |      "lotto":{
          |        "lotto-id":5,
          |        "winning-numbers":[2,45,34,23,7,5,3],
          |        "winners":[{
          |          "winner-id":23,
          |          "numbers":[2,45,34,23,3,5]
          |        },{
          |          "winner-id":54,
          |          "numbers":[52,12,11,22]
          |        }]
          |      }
          |    }
          |""".stripMargin.parseJson.toString()
    }

    it("should delete string items from array correctly") {
      val objJson1 =
        """
          |    {
          |      "lotto":{
          |        "lotto-id":5,
          |        "winning-numbers":[2,45,34,23,7,5,3],
          |        "winners":[{
          |          "winner-id":23,
          |          "numbers":[2,45,34,23,3,5]
          |        },{
          |          "winner-id":54,
          |          "numbers":["52","3","12","11","18","22"]
          |        }]
          |      }
          |    }
          |""".stripMargin

      JsonUtils
        .deleteJsonArrayItemsByJsonPath(
          objJson1.parseJson,
          "$.lotto.winners[1].numbers",
          List(JsString("18"), JsString("11"))
        )
        .toString() shouldBe
        """
          |  {
          |      "lotto":{
          |        "lotto-id":5,
          |        "winning-numbers":[2,45,34,23,7,5,3],
          |        "winners":[{
          |          "winner-id":23,
          |          "numbers":[2,45,34,23,3,5]
          |        },{
          |          "winner-id":54,
          |          "numbers":["52","3","12","22"]
          |        }]
          |      }
          |    }
          |""".stripMargin.parseJson.toString()
    }

    it("should delete mixed items from array correctly") {
      val objJson1 =
        """
          |    {
          |      "lotto":{
          |        "lotto-id":5,
          |        "winning-numbers":[2,45,34,23,7,5,3],
          |        "winners":[{
          |          "winner-id":23,
          |          "numbers":[2,45,34,23,3,5]
          |        },{
          |          "winner-id":54,
          |          "numbers":[52,"3",12,"11","18",22]
          |        }]
          |      }
          |    }
          |""".stripMargin

      JsonUtils
        .deleteJsonArrayItemsByJsonPath(
          objJson1.parseJson,
          "$.lotto.winners[1].numbers",
          List(JsString("3"), JsNumber("22"))
        )
        .toString() shouldBe
        """
          |  {
          |      "lotto":{
          |        "lotto-id":5,
          |        "winning-numbers":[2,45,34,23,7,5,3],
          |        "winners":[{
          |          "winner-id":23,
          |          "numbers":[2,45,34,23,3,5]
          |        },{
          |          "winner-id":54,
          |          "numbers":[52,12,"11","18"]
          |        }]
          |      }
          |    }
          |""".stripMargin.parseJson.toString()
    }

    it("should return original data with no error when jsonPath doesn't exist") {
      val objJson1 =
        """
          |    {
          |      "a":1,
          |      "b":2
          |    }
          |""".stripMargin

      JsonUtils
        .deleteJsonArrayItemsByJsonPath(
          objJson1.parseJson,
          "$.a.b.c",
          List(JsString("3"), JsNumber("22"))
        )
        .toString() shouldBe
        """
          |  {
          |      "a":1,
          |      "b":2
          |    }
          |""".stripMargin.parseJson.toString()
    }

    it(
      "should return original data with no error when the value at the jsonPath is null value"
    ) {
      val objJson1 =
        """
          |    {
          |      "a":1,
          |      "b":2,
          |      "c":null
          |    }
          |""".stripMargin

      JsonUtils
        .deleteJsonArrayItemsByJsonPath(
          objJson1.parseJson,
          "$.c",
          List(JsString("3"), JsNumber("22"))
        )
        .toString() shouldBe
        """
          |  {
          |      "a":1,
          |      "b":2,
          |      "c":null
          |    }
          |""".stripMargin.parseJson.toString()
    }

  }

  describe("test Json merge") {
    it("should merge object & array type correctly") {
      val objJson1 =
        """
          |    {
          |      "lotto":{
          |        "lotto-id":5,
          |        "winning-numbers":[2,45,34,23,7,5,3],
          |        "winners":[{
          |          "winner-id":23,
          |          "numbers":[2,45,34,23,3,5]
          |        }]
          |      }
          |    }
          |""".stripMargin

      val objJson2 =
        """
          |    {
          |      "lotto":{
          |        "winners":[{
          |          "winner-id":54,
          |          "numbers":[52,3,12,11,18,22]
          |        }]
          |      }
          |    }
          |""".stripMargin

      val expectedObjJson = """
                              |    {
                              |      "lotto":{
                              |        "lotto-id":5,
                              |        "winning-numbers":[2,45,34,23,7,5,3],
                              |        "winners":[{
                              |          "winner-id":23,
                              |          "numbers":[2,45,34,23,3,5]
                              |        },{
                              |          "winner-id":54,
                              |          "numbers":[52,3,12,11,18,22]
                              |        }]
                              |      }
                              |    }
                              |""".stripMargin

      val result =
        JsonUtils.merge(objJson1.parseJson, objJson2.parseJson).toString()

      result shouldBe expectedObjJson.parseJson.toString()
    }

    it("should merge empty object correctly type correctly") {
      val objJson1 =
        """
          |    {
          |      "a": 1
          |    }
          |""".stripMargin

      val result =
        JsonUtils.merge(objJson1.parseJson, JsObject()).toString()

      result shouldBe objJson1.parseJson.toString()
    }

    it("should throw an error") {
      val objJson1 =
        """
          |    [123]
          |""".stripMargin

      val result =
        Try(JsonUtils.merge(objJson1.parseJson, JsObject()).toString()) match {
          case Failure(ServerError(_, code)) => Some(code)
          case _                             => None
        }

      result shouldBe Some(StatusCodes.BadRequest)
    }
  }
}
