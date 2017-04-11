package au.csiro.data61.magda.registry

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.testkit.ScalatestRouteTest
import org.scalatest.Matchers
import org.scalatest.FunSpec
import scalikejdbc._
import scalikejdbc.scalatest.AutoRollback

class AspectsServiceSpec extends FunSpec with ScalatestRouteTest with Matchers with Protocols with SprayJsonSupport {
  private val webHookActor = system.actorOf(WebHookActor.props, name = "WebHookActor")
  private val api = new Api(webHookActor, testConfig, system, executor, materializer)

  override def testConfigSource = "db.default.url = \"jdbc:postgresql://localhost/postgres?currentSchema=test\""

  override def withFixture(test: NoArgTest) = {
    DB localTx { implicit session =>
      sql"DROP SCHEMA IF EXISTS test CASCADE".update.apply()
      sql"CREATE SCHEMA test".update.apply()

      val stream = scala.io.Source.fromInputStream(getClass.getResourceAsStream("/evolveschema.sql"))
      val sqlString = stream.mkString
      val initializeSql = SQL(sqlString)
      stream.close()
      initializeSql.update().apply()
    }

    super.withFixture(test)
  }

  describe("Aspects") {
    it("starts with none defined") {
      Get("/api/0.1/aspects") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[List[AspectDefinition]].length shouldEqual 0
      }
    }

    it("can be added") {
      val aspectDefinition = AspectDefinition("testId", "testName", None)
      Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[AspectDefinition] shouldEqual AspectDefinition("testId", "testName", None)

        Get("/api/0.1/aspects") ~> api.routes ~> check {
          status shouldEqual StatusCodes.OK

          val aspectDefinitions = responseAs[List[AspectDefinition]]
          aspectDefinitions.length shouldEqual 1
          aspectDefinitions(0) shouldEqual AspectDefinition("testId", "testName", None)
        }
      }
    }
  }
}
