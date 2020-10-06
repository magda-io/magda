package au.csiro.data61.magda.registry

import java.util.concurrent.TimeoutException

import akka.actor.{ActorRef, ActorSystem}
import akka.event.Logging
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.Route
import akka.stream.Materializer
import au.csiro.data61.magda.client.AuthApiClient
import au.csiro.data61.magda.directives.AuthDirectives.requireIsAdmin
import au.csiro.data61.magda.directives.TenantDirectives.{
  requiresTenantId,
  requiresSpecifiedTenantId
}
import au.csiro.data61.magda.model.Registry._
import com.typesafe.config.Config
import gnieh.diffson.sprayJson._
import io.swagger.annotations._
import javax.ws.rs.Path
import scalikejdbc.DB
import org.everit.json.schema.ValidationException

import scala.concurrent.{Await, ExecutionContext, Future}
import scala.concurrent.duration._
import scala.util.{Failure, Success}

// @Path("/status")
class ProbesService(
    config: Config,
    authClient: RegistryAuthApiClient,
    system: ActorSystem,
    materializer: Materializer,
    recordPersistence: RecordPersistence,
    eventPersistence: EventPersistence
) extends Protocols {
  val logger = Logging(system, getClass)
  implicit val ec: ExecutionContext = system.dispatcher

  def live: Route = get {
    path("live") {
      complete("OK")
    }
  }

  def ready: Route = get {
    path("ready") {
      DB readOnly { session =>
        recordPersistence.getReadiness(Some(logger))(session)
      } match {
        case Some(true) => complete("OK")
        case Some(false) | None => complete(StatusCodes.InternalServerError, "Database not ready")
      }
    }
  }

  val route =
    live ~
      ready
}
