package au.csiro.data61.magda.util

import spray.json._
import org.scalatest.{FunSpec, Matchers}

class JsonUtilsSpec extends FunSpec with Matchers {

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
  }
}
