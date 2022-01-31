package au.csiro.data61.magda.registry

import org.flywaydb.core.Flyway
import org.scalamock.scalatest.MockFactory
import org.scalatest.Matchers
import org.scalatest.fixture.FunSpec
import org.slf4j.LoggerFactory
import com.typesafe.config.Config
import io.jsonwebtoken.Jwts
import akka.actor.ActorRef
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.marshalling.Marshal
import akka.http.scaladsl.model.headers.RawHeader
import akka.http.scaladsl.server.AuthenticationFailedRejection
import akka.http.scaladsl.server.AuthorizationFailedRejection
import akka.http.scaladsl.server.MethodRejection
import akka.http.scaladsl.testkit.ScalatestRouteTest
import akka.http.scaladsl.model._
import au.csiro.data61.magda.Authentication
import au.csiro.data61.magda.client.AuthApiClient
import au.csiro.data61.magda.client.{HttpFetcher, MockAuthHttpFetcher}
import au.csiro.data61.magda.model.Auth.{
  AuthDecision,
  AuthProtocols,
  UnconditionalFalseDecision,
  UnconditionalTrueDecision,
  User
}
import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import scalikejdbc._
import scalikejdbc.config.DBs
import scalikejdbc.config.EnvPrefix
import scalikejdbc.config.TypesafeConfig
import scalikejdbc.config.TypesafeConfigReader

import scala.concurrent.Await
import scala.concurrent.duration._
import akka.pattern.gracefulStop
import au.csiro.data61.magda.model.Registry._
import io.jsonwebtoken.SignatureAlgorithm

import java.{util => ju}
import akka.http.scaladsl.marshalling.ToEntityMarshaller

import scala.collection.JavaConverters._
import io.lemonlabs.uri.{QueryString, Url, UrlPath}
import spray.json.JsValue

case class AuthDecisionSetupConfig(
    authDecision: AuthDecision,
    operationUri: Option[String] = None,
    expectCallCount: Option[Int] = None
)

abstract class ApiSpec
    extends FunSpec
    with ScalatestRouteTest
    with Matchers
    with Protocols
    with SprayJsonSupport
    with MockFactory
    with AuthProtocols {

  override def beforeAll(): Unit = {
    Util.clearWebHookActorsCache()
  }

  val USER_ID = "57c75a42-d037-47b9-81f5-247111c43434"

  val databaseUrl = Option(System.getenv("POSTGRES_URL"))
    .getOrElse("jdbc:postgresql://localhost:5432/postgres")

  val databaseUsername = Option(System.getenv("POSTGRES_USER"))
    .getOrElse("postgres")

  val databasePassword = Option(System.getenv("POSTGRES_PASSWORD"))
    .getOrElse("password")

  def addTenantIdHeader(tenantId: BigInt): RawHeader = {
    RawHeader(MAGDA_TENANT_ID_HEADER, tenantId.toString)
  }

  def addAdminPortalIdHeader: RawHeader = {
    addTenantIdHeader(MAGDA_ADMIN_PORTAL_ID)
  }

  def addSystemTenantHeader: RawHeader = {
    addTenantIdHeader(MAGDA_SYSTEM_ID)
  }

  def addUserId(userId: Option[String] = None): RawHeader = {
    val jws = Authentication.signToken(
      Jwts
        .builder()
        .claim("userId", userId.getOrElse(USER_ID)),
      system.log
    )
    RawHeader("X-Magda-Session", jws)
  }

  // Any positive numbers
  val TENANT_1: BigInt = 1
  val TENANT_2: BigInt = 2
  val DOMAIN_NAME_1: String = "test1"
  val DOMAIN_NAME_2: String = "test2"

  // Stop Flyway from producing so much spam that Travis terminates the process.
  LoggerFactory
    .getLogger("org.flywaydb")
    .asInstanceOf[Logger]
    .setLevel(Level.WARN)

  val flyway = new Flyway()
  flyway.setDataSource(databaseUrl, databaseUsername, databasePassword)
  flyway.setSchemas("test")
  flyway.setLocations("classpath:/sql")
  flyway.setPlaceholders(
    Map("clientUserName" -> "client", "clientPassword" -> "password").asJava
  )

  override def testConfigSource =
    s"""
       |db.default.url = "${databaseUrl}?currentSchema=test"
       |authorization.skip = false
       |authorization.skipOpaQuery = true
       |akka.loglevel = ERROR
       |authApi.baseUrl = "http://localhost:6104"
       |webhooks.actorTickRate=0
       |webhooks.eventPageSize=10
       |akka.test.timefactor=20.0
       |trimBySourceTagTimeoutThreshold=500
    """.stripMargin

  override def withFixture(test: OneArgTest) = {
    val authHttpFetcher = new MockAuthHttpFetcher
    val httpFetcher = mock[HttpFetcher]

    //    webHookActorProbe.expectMsg(1 millis, WebHookActor.Process(true))

    val authClient =
      new RegistryAuthApiClient(
        authHttpFetcher
      )(
        testConfig,
        system,
        executor,
        materializer
      )

    case class DBsWithEnvSpecificConfig(configToUse: Config)
        extends DBs
        with TypesafeConfigReader
        with TypesafeConfig
        with EnvPrefix {

      override val config = configToUse
    }

    DBsWithEnvSpecificConfig(testConfig).setupAll()

    DB localTx { implicit session =>
      sql"DROP SCHEMA IF EXISTS test CASCADE".update.apply()
      sql"CREATE SCHEMA test".update.apply()
    }

    flyway.migrate()

    val actor = system.actorOf(
      WebHookActor.props("http://localhost:6101/v0/")(testConfig)
    )
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
      super.withFixture(
        test.toNoArgTest(
          FixtureParam(
            api,
            actor,
            authHttpFetcher,
            httpFetcher,
            authClient
          )
        )
      )
    } finally {
      //      Await.result(system.terminate(), 30 seconds)
      Await.result(gracefulStop(actor, 30 seconds), 30 seconds)
    }
  }

  def routesShouldBeNonExistentWithRole(
      role: Role,
      routes: List[(String, String => HttpRequest, String)]
  ) {
    describe(s"routes should not be accessible with role ${role.toString}") {
      routes.foreach {
        case (methodName, methodFn, route) =>
          it(s"${methodName} ${route}") { param =>
            methodFn(route) ~> param.api(role).routes ~> check {
              rejection match {
                case MethodRejection(_) => // success
                case _                  => fail()
              }
            }
          }
      }
    }
  }

  case class FixtureParam(
      api: Role => Api,
      webHookActor: ActorRef,
      authFetcher: MockAuthHttpFetcher,
      httpFetcher: HttpFetcher,
      authClient: RegistryAuthApiClient
  )

  def endpointStandardAuthTestCase(
      request: HttpRequest,
      requiredOperationUris: List[String],
      response200Check: FixtureParam => Unit,
      response403Check: FixtureParam => Unit,
      beforeRequest: FixtureParam => Unit = (param: FixtureParam) => Unit,
      requireUserId: Boolean = false
  ) = {

    val req = request ~> addTenantIdHeader(
      TENANT_1
    )
    val reqWithUserId = req ~> addUserId()

    it("should respond 200 when user has permission") { param =>
      beforeRequest(param)
      // preset UnconditionalTrueDecision auth decision for required operation uris
      requiredOperationUris.foreach(
        operationUri =>
          param.authFetcher.setAuthDecision(
            operationUri,
            UnconditionalTrueDecision
          )
      )

      (if (requireUserId) reqWithUserId else req) ~> addTenantIdHeader(
        TENANT_1
      ) ~> param
        .api(Full)
        .routes ~> check {
        status shouldEqual StatusCodes.OK
        response200Check(param)
      }
    }

    it("should respond 403 (Forbidden) when user has no permission") { param =>
      beforeRequest(param)
      // preset UnconditionalFalseDecision auth decision for required operation uris
      requiredOperationUris.foreach(
        operationUri =>
          param.authFetcher.setAuthDecision(
            operationUri,
            UnconditionalFalseDecision
          )
      )
      (if (requireUserId) reqWithUserId else req) ~> param
        .api(Full)
        .routes ~> check {
        status shouldEqual StatusCodes.Forbidden
        response403Check(param)
      }
    }

    it(
      "should respond 500 when failed to retrieve auth decision from policy engine"
    ) { param =>
      beforeRequest(param)

      param.authFetcher
        .setResponse(StatusCodes.InternalServerError, "Something wrong.")

      (if (requireUserId) reqWithUserId else req) ~> param
        .api(Full)
        .routes ~> check {
        status shouldEqual StatusCodes.InternalServerError
      }
    }

    it(
      "should respond 500 when failed to process auth decision from policy engine"
    ) { param =>
      beforeRequest(param)

      param.authFetcher.setError(new Exception("something wrong"))

      (if (requireUserId) reqWithUserId else req) ~> param
        .api(Full)
        .routes ~> check {
        status shouldEqual StatusCodes.InternalServerError
      }
    }

    if (requireUserId) {
      it(
        "should respond 403 (Forbidden) for anonymous users / can't locate user id"
      ) { param =>
        // this test case assume the request passed in doesn't contain JWT token / userId
        beforeRequest(param)

        // preset UnconditionalTrueDecision auth decision for required operation uris
        requiredOperationUris.foreach(
          operationUri =>
            param.authFetcher.setAuthDecision(
              operationUri,
              UnconditionalTrueDecision
            )
        )

        req ~> param
          .api(Full)
          .routes ~> check {
          status shouldEqual StatusCodes.Forbidden
        }
      }
    }

  }

}
