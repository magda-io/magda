package au.csiro.data61.magda.opa

import au.csiro.data61.magda.opa.OpaTypes.OpaQueryNoneMatched
import org.scalatest.{FunSpec, Matchers}
import org.slf4j.LoggerFactory

import scala.io.BufferedSource
import scala.io.Source.fromFile
import spray.json._

class OpaParserSpec extends FunSpec with Matchers {
  val logger = LoggerFactory.getLogger(getClass)

  val opaSampleResponseFolder = "magda-typescript-common/src/test/"

  describe("GeoJson Data Validation") {
    it("should detect invalidation data with invalid Longitude") {

      val jsonResSource: BufferedSource = fromFile(
        opaSampleResponseFolder + "sampleOpaResponseUnconditionalTrue.json"
      )
      val jsonRes: String =
        try {
          jsonResSource.mkString
        } finally {
          jsonResSource.close()
        }
      val result = OpaParser.parseOpaResponse(jsonRes.parseJson, "test-policy")
      result.size shouldBe 1
      result.head.size shouldBe 1
      result.head.head shouldBe OpaQueryNoneMatched
    }
  }

}
