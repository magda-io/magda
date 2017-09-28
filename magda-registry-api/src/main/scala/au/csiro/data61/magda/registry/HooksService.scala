package au.csiro.data61.magda.registry

import javax.ws.rs.Path

import akka.actor.{ ActorRef, ActorSystem }
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.stream.Materializer
import akka.http.scaladsl.server.Directives._
import scalikejdbc.DB
import akka.http.scaladsl.model.StatusCodes
import io.swagger.annotations._
import au.csiro.data61.magda.model.Registry.WebHook
import au.csiro.data61.magda.directives.AuthDirectives.requireIsAdmin

import scala.util.{ Failure, Success }
import com.typesafe.config.Config
import au.csiro.data61.magda.client.AuthApiClient

@Path("/hooks")
@io.swagger.annotations.Api(value = "web hooks", produces = "application/json")
class HooksService(config: Config, webHookActor: ActorRef, authClient: AuthApiClient, system: ActorSystem, materializer: Materializer) extends Protocols with SprayJsonSupport {
  @ApiOperation(value = "Get a list of all web hooks", nickname = "getAll", httpMethod = "GET", response = classOf[WebHook], responseContainer = "List")
  def getAll = get {
    pathEnd {
      complete {
        DB readOnly { session =>
          HookPersistence.getAll(session)
        }
      }
    }
  }

  @ApiOperation(value = "Create a new web hook", nickname = "create", httpMethod = "POST", response = classOf[WebHook])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "hook", required = true, dataType = "au.csiro.data61.magda.model.Registry$WebHook", paramType = "body", value = "The definition of the new web hook.")))
  def create = post {
    pathEnd {
      entity(as[WebHook]) { hook =>
        DB localTx { session =>
          HookPersistence.create(session, hook) match {
            case Success(result)    => complete(result)
            case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
          }
        }
      }
    }
  }

  @Path("/{id}")
  @ApiOperation(value = "Get a web hook by ID", nickname = "getById", httpMethod = "GET", response = classOf[WebHook])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the web hook to be fetched.")))
  def getById = get {
    path(Segment) { (id: String) =>
      {
        DB readOnly { session =>
          HookPersistence.getById(session, id) match {
            case Some(hook) => complete(hook)
            case None       => complete(StatusCodes.NotFound, BadRequest("No web hook exists with that ID."))
          }
        }
      }
    }
  }

  @Path("/{id}")
  @ApiOperation(value = "Modify a web hook by ID", nickname = "putById", httpMethod = "PUT", response = classOf[WebHook],
    notes = "Modifies the web hook with a given ID.  If a web hook with the ID does not yet exist, it is created.")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the aspect to be saved."),
    new ApiImplicitParam(name = "hook", required = true, dataType = "au.csiro.data61.magda.model.Registry$WebHook", paramType = "body", value = "The web hook to save.")))
  def putById = put {
    path(Segment) { (id: String) =>
      {
        entity(as[WebHook]) { hook =>
          DB localTx { session =>
            HookPersistence.putById(session, id, hook) match {
              case Success(result)    => complete(result)
              case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
            }
          }
        }
      }
    }
  }

  @Path("/{hookId}")
  @ApiOperation(value = "Delete a web hook", nickname = "deleteById", httpMethod = "DELETE", response = classOf[DeleteResult])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "hookId", required = true, dataType = "string", paramType = "path", value = "ID of the web hook to delete.")))
  @ApiResponses(Array(
    new ApiResponse(code = 400, message = "The web hook could not be deleted.", response = classOf[BadRequest])))
  def deleteById = delete {
    path(Segment) { (hookId: String) =>
      {
        val result = DB localTx { session =>
          HookPersistence.delete(session, hookId) match {
            case Success(result)    => complete(DeleteResult(result))
            case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
          }
        }
        webHookActor ! WebHookActor.Process
        result
      }
    }
  }

  @Path("/{id}/ack")
  @ApiOperation(value = "Acknowledge a previously-deferred web hook", nickname = "ack", httpMethod = "POST", response = classOf[WebHookAcknowledgementResponse],
    notes = "Acknowledges a previously-deferred web hook with a given ID.  Acknowledging a previously-POSTed web hook will cause the next, if any, to be sent.")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the web hook to be acknowledged."),
    new ApiImplicitParam(name = "acknowledgement", required = true, dataType = "au.csiro.data61.magda.registry.WebHookAcknowledgement", paramType = "body", value = "The details of the acknowledgement.")))
  def ack = post {
    path(Segment / "ack") { (id: String) =>
      entity(as[WebHookAcknowledgement]) { acknowledgement =>
        val result = DB localTx { session =>
          HookPersistence.acknowledgeRaisedHook(session, id, acknowledgement) match {
            case Success(result)    => complete(result)
            case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
          }
        }
        webHookActor ! WebHookActor.Process
        result
      }
    }
  }

  def route =
    requireIsAdmin(authClient) { _ =>
      getAll ~
        create ~
        getById ~
        putById ~
        deleteById ~
        ack
    }
}
