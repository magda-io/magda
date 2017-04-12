package au.csiro.data61.magda.registry

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.testkit.ScalatestRouteTest
import akka.testkit.TestProbe
import org.scalatest.Matchers
import org.scalatest.fixture.FunSpec
import scalikejdbc._

abstract class ApiSpec extends FunSpec with ScalatestRouteTest with Matchers with Protocols with SprayJsonSupport {
  type FixtureParam = Api

  override def testConfigSource = "db.default.url = \"jdbc:postgresql://localhost/postgres?currentSchema=test\""

  override def withFixture(test: OneArgTest) = {
    val webHookActorProbe = TestProbe()
    val api = new Api(webHookActorProbe.ref, testConfig, system, executor, materializer)

    DB localTx { implicit session =>
      sql"DROP SCHEMA IF EXISTS test CASCADE".update.apply()
      sql"CREATE SCHEMA test".update.apply()

      val stream = scala.io.Source.fromInputStream(getClass.getResourceAsStream("/evolveschema.sql"))
      val initializeSql = SQL(stream.mkString)
      stream.close()
      initializeSql.update().apply()
    }

    super.withFixture(test.toNoArgTest(api))
  }
}
