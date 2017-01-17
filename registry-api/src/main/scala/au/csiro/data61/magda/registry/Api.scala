package au.csiro.data61.magda.registry

import java.net.URL
import java.util.concurrent.TimeUnit

import scala.concurrent.ExecutionContext
import scala.concurrent.ExecutionContextExecutor
import scala.concurrent.Future
import scala.concurrent.duration.FiniteDuration
import com.typesafe.config.Config
import akka.actor.ActorRef
import akka.actor.ActorSystem
import akka.actor.Props
import akka.event.Logging
import akka.event.LoggingAdapter
import akka.http.scaladsl.Http
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.marshalling.ToResponseMarshallable
import akka.http.scaladsl.model.HttpResponse
import akka.http.scaladsl.model.StatusCodes._
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server._
import akka.pattern.ask
import akka.stream.Materializer
import akka.util.Timeout
import ch.megard.akka.http.cors.CorsDirectives
import ch.megard.akka.http.cors.CorsSettings
import scalikejdbc.config._
import spray.json._
import scalikejdbc._

class Api(implicit val config: Config, implicit val system: ActorSystem, implicit val ec: ExecutionContext, implicit val materializer: Materializer) extends CorsDirectives with Protocols {
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

  DBs.setupAll()

  implicit val timeout = Timeout(FiniteDuration(1, TimeUnit.SECONDS))
  val routes = cors() {
    handleExceptions(myExceptionHandler) {
      pathPrefix("api" / "0.1") {
        path("ping") { complete("OK") } ~
        pathPrefix("sections") { new SectionsService(system, materializer).route } ~
        pathPrefix("records") { new RecordsService(system, materializer).route } ~
        new SwaggerDocService("localhost", 9001, system).routes
      } ~
      pathPrefix("swagger") {
        getFromResourceDirectory("swagger") ~ pathSingleSlash(get(redirect("index.html", StatusCodes.PermanentRedirect)))
      }
    }
  }

  Http().bindAndHandle(routes, config.getString("http.interface"), config.getInt("http.port"))
}