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
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server._
import akka.stream.Materializer
import akka.util.Timeout
import ch.megard.akka.http.cors.CorsDirectives
import scalikejdbc.config._
import scalikejdbc._

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

  implicit val timeout = Timeout(FiniteDuration(1, TimeUnit.SECONDS))
  val routes = cors() {
    handleExceptions(myExceptionHandler) {
      pathPrefix("api" / "0.1") {
        path("ping") { complete("OK") } ~
        pathPrefix("aspects") { new AspectsService(system, materializer).route } ~
        pathPrefix("records") { new RecordsService(webHookActor, system, materializer).route } ~
        pathPrefix("hooks") { new HooksService(system, materializer).route } ~
        new SwaggerDocService("localhost", 9001, system).allRoutes
      } ~
      pathPrefix("swagger") {
        getFromResourceDirectory("swagger") ~ pathSingleSlash(get(redirect("index.html", StatusCodes.PermanentRedirect)))
      }
    }
  }
}
