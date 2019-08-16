package au.csiro.data61.magda.opa

import akka.actor.{ActorRef, ActorSystem}
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.model.headers.RawHeader
import akka.http.scaladsl.testkit.{RouteTestTimeout, ScalatestRouteTest}
import akka.pattern.gracefulStop
import au.csiro.data61.magda.client.AuthApiClient
import au.csiro.data61.magda.model.Auth.AuthProtocols
import au.csiro.data61.magda.model.Registry.MAGDA_TENANT_ID_HEADER
import au.csiro.data61.magda.registry._
import com.typesafe.config.Config
import org.scalamock.scalatest.MockFactory
import org.scalatest.Matchers
import org.scalatest.fixture.FunSpec
import scalikejdbc._
import scalikejdbc.config.{DBs, EnvPrefix, TypesafeConfig, TypesafeConfigReader}

import scala.concurrent.Await
import scala.concurrent.duration._

abstract class ApiWithOpaSpec extends FunSpec with ScalatestRouteTest with Matchers with Protocols with SprayJsonSupport with MockFactory with AuthProtocols {
  implicit def default(implicit system: ActorSystem): RouteTestTimeout = RouteTestTimeout(300 seconds)
  override def beforeAll(): Unit = {
    Util.clearWebHookActorsCache()
  }

  case class FixtureParam(api: Role => Api, webHookActor: ActorRef, authClient: AuthApiClient)

//  val databaseUrl = Option(System.getenv("POSTGRES_URL")).getOrElse("jdbc:postgresql://localhost:5432/postgres")

  def addTenantIdHeader(tenantId: BigInt): RawHeader = {
    RawHeader(MAGDA_TENANT_ID_HEADER, tenantId.toString)
  }

  val userId0 = "t1000"
  val userId1 = "t1001"
  val userId2 = "t1002"
  val userId3 = "t1003"
  val anonymous = "blah"

  def addJwtToken(userId: String): RawHeader = {
    val jwtToken =
    if (userId.equals(userId0))
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTEwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJpYXQiOjE1NjU4NDI1NDJ9.q9wLdebdHdGwC_vS6i1CyNb4C3t-5TFElh2loC3fy4Q"
    else if (userId.equals(userId1))
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTEwMDAtMDAwMS0wMDAwMDAwMDAwMDAiLCJpYXQiOjE1NjU3ODMzNTV9.4VLEaxW1ETzt6F5dIFc_PMRBRloYRoFPONv38Cm2ZdQ"
    else if (userId.equals(userId2))
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTEwMDAtMDAwMi0wMDAwMDAwMDAwMDAiLCJpYXQiOjE1NjU4MzY0NDd9.nS8n_5bCS02ZnZyzpiOf5btaj0BmvoZ7uquogU7h4-I"
    else if (userId.equals(userId3 ))
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTEwMDAtMDAwMy0wMDAwMDAwMDAwMDAiLCJpYXQiOjE1NjU4NDEwNDV9.Qy1TM5BIyjWarXJtSRpxvTzP0CWSxfWvnnxAxbDMQ-s"
    else
      ""

    RawHeader("X-Magda-Session", jwtToken)
  }

  val TENANT_0: BigInt = 0

  override def withFixture(test: OneArgTest) = {

    GlobalSettings.loggingSQLAndTime = new LoggingSQLAndTimeSettings(
      enabled = false,
      singleLineMode = true,
      logLevel = 'debug)

    case class DBsWithEnvSpecificConfig(configToUse: Config) extends DBs
        with TypesafeConfigReader
        with TypesafeConfig
        with EnvPrefix {

      override val config = configToUse
    }

    DBsWithEnvSpecificConfig(testConfig).setupAll()

    val actor = system.actorOf(WebHookActor.props("http://localhost:6101/v0/")(testConfig))
    val authClient = new AuthApiClient()(testConfig, system, executor, materializer)
    val api = (role: Role) => new Api(if (role == Full) Some(actor) else None, authClient, testConfig, system, executor, materializer)


    try {
      super.withFixture(test.toNoArgTest(FixtureParam(api, actor, authClient)))
    } finally {
      //      Await.result(system.terminate(), 30 seconds)
      Await.result(gracefulStop(actor, 30 seconds), 30 seconds)
    }
  }

}
