package au.csiro.data61.magda.opa

import akka.actor.{ActorRef, ActorSystem}
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.model.headers.RawHeader
import akka.http.scaladsl.testkit.{RouteTestTimeout, ScalatestRouteTest}
import akka.pattern.gracefulStop
import au.csiro.data61.magda.Authentication
import au.csiro.data61.magda.client.AuthApiClient
import au.csiro.data61.magda.model.Auth.AuthProtocols
import au.csiro.data61.magda.model.Registry.MAGDA_TENANT_ID_HEADER
import au.csiro.data61.magda.registry._
import com.auth0.jwt.JWT
import com.typesafe.config.Config
import org.scalamock.scalatest.MockFactory
import org.scalatest.{Matchers, Outcome, fixture}
import scalikejdbc._
import scalikejdbc.config.{DBs, EnvPrefix, TypesafeConfig, TypesafeConfigReader}

import scala.concurrent.Await
import scala.concurrent.duration._

abstract class ApiWithOpaSpec
    extends fixture.FunSpec
    with ScalatestRouteTest
    with Matchers
    with Protocols
    with SprayJsonSupport
    with MockFactory
    with AuthProtocols {
  implicit def default(implicit system: ActorSystem): RouteTestTimeout =
    RouteTestTimeout(300 seconds)
  override def beforeAll(): Unit = {
    Util.clearWebHookActorsCache()
  }

  case class FixtureParam(
      api: Role => Api,
      webHookActor: ActorRef,
      authClient: AuthApiClient
  )

  def addTenantIdHeader(tenantId: BigInt): RawHeader = {
    RawHeader(MAGDA_TENANT_ID_HEADER, tenantId.toString)
  }

  def addJwtToken(userId: String): RawHeader = {
    if (userId.equals("anonymous"))
      RawHeader("", "")
    else {
      val jwtToken =
        JWT.create().withClaim("userId", userId).sign(Authentication.algorithm)
//      println(s"userId: $userId")
//      println(s"jwtToken: $jwtToken")
      RawHeader(
        Authentication.headerName,
        jwtToken
      )
    }
  }

  val TENANT_0: BigInt = 0

  override def withFixture(test: OneArgTest): Outcome = {

    GlobalSettings.loggingSQLAndTime = LoggingSQLAndTimeSettings(
      enabled = false,
      singleLineMode = true,
      logLevel = 'debug
    )

    case class DBsWithEnvSpecificConfig(configToUse: Config)
        extends DBs
        with TypesafeConfigReader
        with TypesafeConfig
        with EnvPrefix {

      override val config: Config = configToUse
    }

    DBsWithEnvSpecificConfig(testConfig).setupAll()

    val actor = system.actorOf(
      WebHookActor.props("http://localhost:6101/v0/")(testConfig)
    )
    val authClient =
      new AuthApiClient()(testConfig, system, executor, materializer)
    val api = (role: Role) =>
      new Api(
        if (role == Full) Some(actor) else None,
        authClient,
        testConfig,
        system,
        executor,
        materializer
      )

    try {
      super.withFixture(test.toNoArgTest(FixtureParam(api, actor, authClient)))
    } finally {
      //      Await.result(system.terminate(), 30 seconds)
      Await.result(gracefulStop(actor, 30 seconds), 30 seconds)
    }
  }

}
