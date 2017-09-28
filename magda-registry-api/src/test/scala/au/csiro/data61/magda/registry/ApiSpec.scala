package au.csiro.data61.magda.registry

import java.net.URL

import scala.concurrent.duration._

import org.flywaydb.core.Flyway
import org.scalatest.Matchers
import org.scalatest.fixture.FunSpec
import org.slf4j.LoggerFactory

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.testkit.ScalatestRouteTest
import akka.testkit.TestProbe
import au.csiro.data61.magda.client.AuthApiClient
import au.csiro.data61.magda.client.HttpFetcher
import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import scalikejdbc._
import org.scalamock.scalatest.MockFactory
import org.scalamock.proxy.ProxyMockFactory
import org.scalamock.proxy.Mock

abstract class ApiSpec extends FunSpec with ScalatestRouteTest with Matchers with Protocols with SprayJsonSupport with MockFactory with ProxyMockFactory {
  case class FixtureParam(api: Api, webHookActorProbe: TestProbe, httpFetcher: HttpFetcher with Mock)

  val databaseUrl = Option(System.getenv("npm_package_config_databaseUrl")).getOrElse("jdbc:postgresql://localhost:5432/postgres")

  // Stop Flyway from producing so much spam that Travis terminates the process.
  LoggerFactory.getLogger("org.flywaydb").asInstanceOf[Logger].setLevel(Level.WARN)

  val flyway = new Flyway()
  flyway.setDataSource(databaseUrl, "postgres", "")
  flyway.setSchemas("test")
  flyway.setLocations("classpath:/sql")

  override def testConfigSource =
    s"""
      |db.default.url = "${databaseUrl}?currentSchema=test"
      |authorization.skip = true
      |akka.loglevel = INFO
      |authApi.baseUrl = "http://localhost:6104"
    """.stripMargin

  override def withFixture(test: OneArgTest) = {
    val webHookActorProbe = TestProbe()
    val httpFetcher = mock[HttpFetcher]
    val authClient = new AuthApiClient(httpFetcher)(testConfig, system, executor, materializer)
    val api = new Api(webHookActorProbe.ref, authClient, testConfig, system, executor, materializer)

    webHookActorProbe.expectMsg(1 millis, WebHookActor.Process)

    DB localTx { implicit session =>
      sql"DROP SCHEMA IF EXISTS test CASCADE".update.apply()
      sql"CREATE SCHEMA test".update.apply()
    }

    flyway.migrate()

    super.withFixture(test.toNoArgTest(FixtureParam(api, webHookActorProbe, httpFetcher)))
  }

  def expectAdmin(httpFetcher: HttpFetcher with Mock) {
    httpFetcher expects 'get 
  }
}
