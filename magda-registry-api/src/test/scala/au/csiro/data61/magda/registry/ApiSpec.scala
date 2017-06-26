package au.csiro.data61.magda.registry

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.testkit.ScalatestRouteTest
import akka.testkit.TestProbe
import org.scalatest.Matchers
import org.scalatest.fixture.FunSpec
import scala.concurrent.duration._
import scalikejdbc._

abstract class ApiSpec extends FunSpec with ScalatestRouteTest with Matchers with Protocols with SprayJsonSupport {
  case class FixtureParam(api: Api, webHookActorProbe: TestProbe)

  val databaseUrl = Option(System.getenv("npm_package_config_databaseUrl")).getOrElse("jdbc:postgresql://localhost:5432/postgres")

  override def testConfigSource =
    s"""
      |db.default.url = "${databaseUrl}?currentSchema=test"
      |authorization.skip = true
    """.stripMargin

  override def withFixture(test: OneArgTest) = {
    val webHookActorProbe = TestProbe()
    val api = new Api(webHookActorProbe.ref, testConfig, system, executor, materializer)

    webHookActorProbe.expectMsg(1 millis, WebHookActor.Process)

    DB localTx { implicit session =>
      sql"DROP SCHEMA IF EXISTS test CASCADE".update.apply()
      sql"CREATE SCHEMA test".update.apply()

      val stream = scala.io.Source.fromInputStream(getClass.getResourceAsStream("/evolveschema.sql"))
      val initializeSql = SQL(stream.mkString)
      stream.close()
      initializeSql.update().apply()
    }

    super.withFixture(test.toNoArgTest(FixtureParam(api, webHookActorProbe)))
  }
}
