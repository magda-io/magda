package au.csiro.data61.magda.api

import java.util.concurrent.TimeUnit

import akka.actor.ActorSystem
import akka.event.{ Logging, LoggingAdapter }
import akka.http.scaladsl.Http
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.{ HttpResponse, StatusCodes }
import akka.http.scaladsl.model.StatusCodes._
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.{ ExceptionHandler, MethodRejection, RejectionHandler }
import ch.megard.akka.http.cors.CorsSettings
import ch.megard.akka.http.cors.CorsDirectives
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server._
import akka.http.scaladsl.server.directives._

trait BaseMagdaApi extends CorsDirectives {
  import BasicDirectives._

  // Disallow credentials so that we return "Access-Control-Allow-Origin: *" instead of
  // "Access-Control-Allow-Origin: foo.com".  The latter is fine until Chrome decides to
  // cache the response and re-use it for other origins, causing a CORS failure.
  val corsSettings = CorsSettings.defaultSettings.copy(allowCredentials = false)

  def getLogger: LoggingAdapter

  def rejectionHandler = RejectionHandler.newBuilder()
    .handleAll[MethodRejection] { rejections ⇒
      val methods = rejections map (_.supported)
      lazy val names = methods map (_.name) mkString ", "

      cors(corsSettings) {
        options {
          complete(s"Supported methods : $names.")
        } ~
          complete(
            MethodNotAllowed,
            s"HTTP method not allowed, supported methods: $names!"
          )
      }
    }
    .result()

  def genericExceptionHandler() = ExceptionHandler {
    case e: Exception ⇒ {
      getLogger.error(e, "Exception encountered")

      cors(corsSettings) {
        complete(HttpResponse(InternalServerError, entity = "Failure"))
      }
    }
  }

  def magdaRoute(inner: Route): Route = {
    cors(corsSettings) {
      handleExceptions(genericExceptionHandler) {
        inner
      }
    }
  }
}