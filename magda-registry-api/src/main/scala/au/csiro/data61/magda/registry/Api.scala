package au.csiro.data61.magda.registry

import java.util.concurrent.TimeUnit

import scala.concurrent.ExecutionContext
import scala.concurrent.duration.FiniteDuration
import com.typesafe.config.Config
import akka.actor.ActorRef
import akka.actor.ActorSystem
import akka.event.Logging
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes._
import akka.http.scaladsl.model.{HttpMethod, HttpMethods, StatusCodes, headers}
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server._
import akka.stream.Materializer
import akka.util.Timeout
import ch.megard.akka.http.cors.scaladsl.CorsDirectives
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import com.auth0.jwt.interfaces.DecodedJWT
import scalikejdbc.config._
import scalikejdbc._

import scala.util.control.NonFatal

class Api(val webHookActor: ActorRef, implicit val config: Config, implicit val system: ActorSystem, implicit val ec: ExecutionContext, implicit val materializer: Materializer) extends CorsDirectives with Protocols {
  val logger = Logging(system, getClass)

  implicit def rejectionHandler = RejectionHandler.newBuilder()
    .handleAll[MethodRejection] { rejections =>
      val methods = rejections map (_.supported)
      lazy val names = methods map (_.name) mkString ", "

      cors() {
        options {
          complete(s"Supported methods : $names.")
        } ~
          complete(MethodNotAllowed,
            s"HTTP method not allowed, supported methods: $names!")
      }
    }
    .handleAll[MalformedRequestContentRejection] { rejections =>
      val messages = ("The request content did not have the expected format:" +: rejections.map(_.message)).mkString("\n")
      complete(StatusCodes.BadRequest, au.csiro.data61.magda.registry.BadRequest(messages))
    }
    .result()

  val myExceptionHandler = ExceptionHandler {
    case e: Exception => {
      logger.error(e, "Exception encountered")

      cors() {
        complete(StatusCodes.InternalServerError, au.csiro.data61.magda.registry.BadRequest("The server encountered an unexpected error."))
      }
    }
  }

  GlobalSettings.loggingSQLAndTime = new LoggingSQLAndTimeSettings(
    enabled = true,
    singleLineMode = true,
    logLevel = 'DEBUG
  )

  case class DBsWithEnvSpecificConfig(configToUse: Config) extends DBs
      with TypesafeConfigReader
      with TypesafeConfig
      with EnvPrefix {

    override val config = configToUse
  }

  DBsWithEnvSpecificConfig(config).setupAll()

  webHookActor ! WebHookActor.Process

  val skipAuthorization = Option(System.getenv("npm_package_config_skipAuthorization")).map(_.toBoolean).getOrElse(if (config.hasPath("authorization.skip")) config.getBoolean("authorization.skip") else false)

  val algorithm = if (skipAuthorization) null else Algorithm.HMAC256(System.getenv("JWT_SECRET"))
  val jwt = if (skipAuthorization) null else JWT.require(algorithm).build

  def checkCredentials(allowAnonymous: Seq[HttpMethod], allowAuthenticated: Seq[HttpMethod]) = (request: RequestContext) => {
    if (skipAuthorization) {
      true
    } else if (allowAnonymous.contains(request.request.method)) {
      true
    } else {
      val sessionToken = request.request.headers.filter {
        case headers.RawHeader("X-Magda-Session", value) => true
        case _ => false
      }.map { header =>
        try {
          Some(jwt.verify(header.value()))
        } catch {
          case NonFatal(_) => None
        }
      }.filter {
        case Some(token) => true
        case None => false
      }.map(_.get).headOption

      if (allowAuthenticated.contains(request.request.method) && userIsAuthenticated(sessionToken)) {
        true
      } else if (userIsAdmin(sessionToken)) {
        true
      } else {
        false
      }
    }
  }

  def userIsAuthenticated(user: Option[DecodedJWT]): Boolean = user match {
    case Some(_) => true
    case None => false
  }

  def userIsAdmin(user: Option[DecodedJWT]): Boolean = user match {
    case Some(token) => token.getClaim("isAdmin").asBoolean()
    case None => false
  }

  def checkAuthorization(allowAnonymous: Seq[HttpMethod], allowAuthenticated: Seq[HttpMethod]) = authorize(checkCredentials(allowAnonymous, allowAuthenticated))

  implicit val timeout = Timeout(FiniteDuration(1, TimeUnit.SECONDS))
  val routes = cors() {
    handleExceptions(myExceptionHandler) {
      pathPrefix("v0") {
        path("ping") { complete("OK") } ~
        pathPrefix("aspects") { checkAuthorization(Seq(HttpMethods.GET), Seq()) { new AspectsService(system, materializer).route } } ~
        pathPrefix("records") { checkAuthorization(Seq(HttpMethods.GET), Seq(HttpMethods.POST)) { new RecordsService(webHookActor, system, materializer).route } } ~
        pathPrefix("hooks") { checkAuthorization(Seq(HttpMethods.GET), Seq()) { new HooksService(webHookActor, system, materializer).route } } ~
        new SwaggerDocService("localhost", 9001, config.getString("http.externalUrl.v0"), system).allRoutes ~
        pathPrefix("swagger") {
          getFromResourceDirectory("swagger") ~ pathSingleSlash(get(redirect("index.html", StatusCodes.PermanentRedirect)))
        }
      }
    }
  }
}
