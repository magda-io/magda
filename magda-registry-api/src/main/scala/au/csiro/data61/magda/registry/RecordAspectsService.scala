package au.csiro.data61.magda.registry

import javax.ws.rs.Path

import akka.actor.{ ActorRef, ActorSystem }
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.stream.Materializer
import akka.http.scaladsl.server.Directives._
import scalikejdbc.DB
import akka.http.scaladsl.model.StatusCodes
import io.swagger.annotations._
import gnieh.diffson.sprayJson._
import spray.json.JsObject
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.directives.AuthDirectives.requireIsAdmin

import scala.util.Failure
import scala.util.Success
import au.csiro.data61.magda.client.AuthApiClient
import com.typesafe.config.Config

@Path("/records/{recordId}/aspects")
@io.swagger.annotations.Api(value = "record aspects", produces = "application/json")
class RecordAspectsService(webHookActor: ActorRef, authClient: AuthApiClient, system: ActorSystem, materializer: Materializer, config: Config) extends Protocols with SprayJsonSupport {
  val recordPersistence = DefaultRecordPersistence

  @ApiOperation(value = "Get a list of all aspects of a record", nickname = "getAll", httpMethod = "GET", response = classOf[Aspect], responseContainer = "Map")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "recordId", required = true, dataType = "string", paramType = "path", value = "ID of the record for which to fetch aspects.")))
  def getAll = get {
    path(Segment / "aspects") { (recordId: String) =>
      DB readOnly { session =>
        recordPersistence.getByIdWithAspects(session, recordId) match {
          case Some(result) => complete(result.aspects)
          case None         => complete(StatusCodes.NotFound, BadRequest("No record exists with that ID."))
        }
      }
    }
  }

  @Path("/{aspectId}")
  @ApiOperation(value = "Get a record aspect by ID", nickname = "getById", httpMethod = "GET", response = classOf[Aspect])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "recordId", required = true, dataType = "string", paramType = "path", value = "ID of the record for which to fetch an aspect."),
    new ApiImplicitParam(name = "aspectId", required = true, dataType = "string", paramType = "path", value = "ID of the aspect to fetch.")))
  @ApiResponses(Array(
    new ApiResponse(code = 404, message = "No record or aspect exists with the given IDs.", response = classOf[BadRequest])))
  def getById = get {
    path(Segment / "aspects" / Segment) { (recordId: String, aspectId: String) =>
      {
        DB readOnly { session =>
          recordPersistence.getRecordAspectById(session, recordId, aspectId) match {
            case Some(recordAspect) => complete(recordAspect)
            case None               => complete(StatusCodes.NotFound, BadRequest("No record aspect exists with that ID."))
          }
        }
      }
    }
  }

  @Path("/{aspectId}")
  @ApiOperation(value = "Modify a record aspect by ID", nickname = "putById", httpMethod = "PUT", response = classOf[Aspect],
    notes = "Modifies a record aspect.  If the aspect does not yet exist on this record, it is created.")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "recordId", required = true, dataType = "string", paramType = "path", value = "ID of the record for which to update an aspect."),
    new ApiImplicitParam(name = "aspectId", required = true, dataType = "string", paramType = "path", value = "ID of the aspect to update."),
    new ApiImplicitParam(name = "aspect", required = true, dataType = "au.csiro.data61.magda.model.Registry$Aspect", paramType = "body", value = "The record aspect to save."),
    new ApiImplicitParam(name = "X-Magda-Session", required = true, dataType = "String", paramType = "header", value = "Magda internal session id")))
  def putById = put {
    path(Segment / "aspects" / Segment) { (recordId: String, aspectId: String) =>
      requireIsAdmin(authClient)(system, config) { _ =>
        {
          entity(as[JsObject]) { aspect =>
            val result = DB localTx { session =>
              recordPersistence.putRecordAspectById(session, recordId, aspectId, aspect) match {
                case Success(result)    => complete(result)
                case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
              }
            }
            webHookActor ! WebHookActor.Process(false, Some(List(aspectId)))
            result
          }
        }
      }
    }
  }

  @Path("/{aspectId}")
  @ApiOperation(value = "Delete a record aspect by ID", nickname = "deleteById", httpMethod = "DELETE", response = classOf[DeleteResult],
    notes = "Deletes a record aspect.")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "recordId", required = true, dataType = "string", paramType = "path", value = "ID of the record for which to delete an aspect."),
    new ApiImplicitParam(name = "aspectId", required = true, dataType = "string", paramType = "path", value = "ID of the aspect to delete."),
    new ApiImplicitParam(name = "X-Magda-Session", required = true, dataType = "String", paramType = "header", value = "Magda internal session id")))
  def deleteById = delete {
    path(Segment / "aspects" / Segment) { (recordId: String, aspectId: String) =>
      requireIsAdmin(authClient)(system, config) { _ =>
        DB localTx { session =>
          recordPersistence.deleteRecordAspect(session, recordId, aspectId) match {
            case Success(result)    => complete(DeleteResult(result))
            case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
          }
        }
      }
    }
  }

  @Path("/{aspectId}")
  @ApiOperation(value = "Modify a record aspect by applying a JSON Patch", nickname = "patchById", httpMethod = "PATCH", response = classOf[Aspect],
    notes = "The patch should follow IETF RFC 6902 (https://tools.ietf.org/html/rfc6902).")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "recordId", required = true, dataType = "string", paramType = "path", value = "ID of the record for which to fetch an aspect."),
    new ApiImplicitParam(name = "aspectId", required = true, dataType = "string", paramType = "path", value = "ID of the aspect to fetch."),
    new ApiImplicitParam(name = "aspectPatch", required = true, dataType = "gnieh.diffson.JsonPatchSupport$JsonPatch", paramType = "body", value = "The RFC 6902 patch to apply to the aspect."),
    new ApiImplicitParam(name = "X-Magda-Session", required = true, dataType = "String", paramType = "header", value = "Magda internal session id")))
  def patchById = patch {
    path(Segment / "aspects" / Segment) { (recordId: String, aspectId: String) =>
      requireIsAdmin(authClient)(system, config) { _ =>
        {
          entity(as[JsonPatch]) { aspectPatch =>
            DB localTx { session =>
              recordPersistence.patchRecordAspectById(session, recordId, aspectId, aspectPatch) match {
                case Success(result)    => complete(result)
                case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
              }
            }
          }
        }
      }
    }
  }

  val route =
    getAll ~
      getById ~
      putById ~
      deleteById ~
      patchById
}
