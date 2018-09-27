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
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server._
import akka.http.scaladsl.server.directives._

trait BaseMagdaApi {
  import BasicDirectives._

  def getLogger: LoggingAdapter

  def rejectionHandler = RejectionHandler.newBuilder()
    .handleAll[MethodRejection] { rejections ⇒
      val methods = rejections map (_.supported)
      lazy val names = methods map (_.name) mkString ", "

      options {
        complete(s"Supported methods : $names.")
      } ~
        complete(
          MethodNotAllowed,
          s"HTTP method not allowed, supported methods: $names!"
        )
    }
    .result()

  def genericExceptionHandler() = ExceptionHandler {
    case e: Exception ⇒ {
      getLogger.error(e, "Exception encountered")

      complete(HttpResponse(InternalServerError, entity = "Failure"))
    }
  }

  def magdaRoute(inner: Route): Route = {
    handleExceptions(genericExceptionHandler) {
      inner
    }
  }
}
