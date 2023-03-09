package au.csiro.data61.magda.model

import akka.actor.ActorSystem
import au.csiro.data61.magda.model.Auth.{AuthDecision, AuthProtocols}
import org.scalatest.{FunSpec, Matchers}
import spray.json._
import scala.io.BufferedSource
import scala.io.Source.fromFile

class AuthSpec extends FunSpec with Matchers with AuthProtocols {

  implicit val system = ActorSystem()
  val logger = akka.event.Logging.getLogger(system, getClass)

  def normalise(str: String) = str.replaceAll("\\n", " ").replaceAll("\\s", "")

  describe("AuthDecision toSQL") {
    it(
      "should add round brackets for AspectQueryGroup's statements that contains `and` or `or` and newline correctly"
    ) {
      val jsonResSource: BufferedSource = fromFile(
        "magda-typescript-common/src/test/sampleAuthDecisions/generalRecordQuery.json"
      )
      val jsonRes: String =
        try {
          jsonResSource.mkString
        } finally {
          jsonResSource.close()
        }

      val sqlResSource: BufferedSource = fromFile(
        "magda-typescript-common/src/test/sampleAuthDecisionSqlQuery/generalRecordQuery.sql"
      )
      val sqlRes: String =
        try {
          sqlResSource.mkString
        } finally {
          sqlResSource.close()
        }
      val authDecision = jsonRes.parseJson.convertTo[AuthDecision]
      normalise(authDecision.toSql().get + "") shouldBe normalise(sqlRes)
    }
  }

}
