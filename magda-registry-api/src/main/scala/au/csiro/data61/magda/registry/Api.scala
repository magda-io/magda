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
import akka.http.scaladsl.model.{ HttpMethod, HttpMethods, StatusCodes, headers }
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server._
import akka.stream.Materializer
import akka.util.Timeout
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import com.auth0.jwt.interfaces.DecodedJWT
import scalikejdbc.config._
import scalikejdbc._

import scala.util.control.NonFatal
import au.csiro.data61.magda.client.AuthApiClient

/**
 * @apiDefine GenericError
 * @apiError (Error 500) {String} Response "Failure"
 */

class Api(val webHookActorOption: Option[ActorRef], val authClient: AuthApiClient, implicit val config: Config, implicit val system: ActorSystem, implicit val ec: ExecutionContext, implicit val materializer: Materializer) extends Protocols {
  val logger = Logging(system, getClass)

  implicit def rejectionHandler = RejectionHandler.newBuilder()
    .handleAll[MethodRejection] { rejections =>
      val methods = rejections map (_.supported)
      lazy val names = methods map (_.name) mkString ", "

      options {
        complete(s"Supported methods : $names.")
      } ~
        complete(MethodNotAllowed,
          s"HTTP method not allowed, supported methods: $names!")
    }
    .handleAll[MalformedRequestContentRejection] { rejections =>
      val messages = ("The request content did not have the expected format:" +: rejections.map(_.message)).mkString("\n")
      complete(StatusCodes.BadRequest, au.csiro.data61.magda.registry.BadRequest(messages))
    }
    .result()

  val myExceptionHandler = ExceptionHandler {
    case e: Exception => {
      logger.error(e, "Exception encountered")

      complete(StatusCodes.InternalServerError, au.csiro.data61.magda.registry.BadRequest("The server encountered an unexpected error."))
    }
  }

  implicit val timeout = Timeout(FiniteDuration(1, TimeUnit.SECONDS))

  val roleDependentRoutes = webHookActorOption match {
    case Some(webHookActor) =>
      pathPrefix("aspects") { new AspectsService(config, authClient, webHookActor, system, materializer).route } ~
        pathPrefix("records") { new RecordsService(config, webHookActor, authClient, system, materializer).route } ~
        pathPrefix("hooks") { new HooksService(config, webHookActor, authClient, system, materializer).route }
    case None =>
      pathPrefix("aspects") { new AspectsServiceRO(config, authClient, system, materializer).route } ~
        pathPrefix("records") { new RecordsServiceRO(config, system, materializer).route }
  }

  val routes = handleExceptions(myExceptionHandler) {
      pathPrefix("v0") {
        path("ping") { complete("OK") } ~ roleDependentRoutes
      }
    }
}
