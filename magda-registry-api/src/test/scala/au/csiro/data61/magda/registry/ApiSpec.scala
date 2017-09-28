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
import au.csiro.data61.magda.model.Auth.{ User, AuthProtocols }
import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import scalikejdbc._
import org.scalamock.scalatest.MockFactory
import org.scalamock.proxy.ProxyMockFactory
import org.scalamock.proxy.Mock
import scala.concurrent.Future
import akka.http.scaladsl.model.HttpResponse
import akka.http.scaladsl.model.HttpEntity
import akka.http.scaladsl.model.ResponseEntity
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.marshalling.Marshal
import scala.concurrent.ExecutionContext
import akka.http.scaladsl.model.HttpRequest
import akka.http.scaladsl.marshalling.ToEntityMarshaller
import com.auth0.jwt.JWT
import akka.http.scaladsl.model.headers.CustomHeader
import com.auth0.jwt.algorithms.Algorithm
import au.csiro.data61.magda.directives.AuthDirectives
import akka.http.scaladsl.model.headers.RawHeader

abstract class ApiSpec extends FunSpec with ScalatestRouteTest with Matchers with Protocols with SprayJsonSupport with MockFactory with ProxyMockFactory with AuthProtocols {
  case class FixtureParam(api: Api, webHookActorProbe: TestProbe, asAdmin: HttpRequest => HttpRequest)

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

    def asAdmin = (req: HttpRequest) => {
      expectAdmin(httpFetcher)
      req.withHeaders(new RawHeader("X-Magda-Session", JWT.create().withClaim("userId", "1").sign(AuthDirectives.algorithm)))
    }

    super.withFixture(test.toNoArgTest(FixtureParam(api, webHookActorProbe, asAdmin)))
  }

  def expectAdmin(httpFetcher: HttpFetcher with Mock) {
    val resFuture = Marshal(User(true)).to[ResponseEntity].map(user => HttpResponse(status = 200, entity = user))

    httpFetcher.expects('get)("/v0/public/users/1").returns(resFuture)
  }
}
