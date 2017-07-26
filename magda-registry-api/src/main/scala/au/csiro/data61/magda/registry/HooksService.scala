package au.csiro.data61.magda.registry

import javax.ws.rs.Path

import akka.actor.ActorSystem
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.stream.Materializer
import akka.http.scaladsl.server.Directives._
import scalikejdbc._
import akka.http.scaladsl.model.StatusCodes
import io.swagger.annotations._
import spray.json._
import gnieh.diffson.sprayJson._
import au.csiro.data61.magda.model.Registry.WebHook

import scala.util.{Failure, Success}

@Path("/hooks")
@io.swagger.annotations.Api(value = "web hooks", produces = "application/json")
class HooksService(system: ActorSystem, materializer: Materializer) extends Protocols with SprayJsonSupport {
  @ApiOperation(value = "Get a list of all web hooks", nickname = "getAll", httpMethod = "GET", response = classOf[WebHook], responseContainer = "List")
  def getAll = get { pathEnd {
    complete {
      DB readOnly { session =>
        HookPersistence.getAll(session)
      }
    }
  } }

  @ApiOperation(value = "Create a new web hook", nickname = "create", httpMethod = "POST", response = classOf[WebHook])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "hook", required = true, dataType = "au.csiro.data61.magda.model.Registry$WebHook", paramType = "body", value = "The definition of the new web hook.")
  ))
  def create = post { pathEnd { entity(as[WebHook]) { hook =>
    DB localTx { session =>
      HookPersistence.create(session, hook) match {
        case Success(result) => complete(result)
        case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
      }
    }
  } } }

  @Path("/{id}")
  @ApiOperation(value = "Get a web hook by ID", nickname = "getById", httpMethod = "GET", response = classOf[WebHook])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the web hook to be fetched.")
  ))
  def getById = get { path(Segment) { (id: String) => {
    DB readOnly { session =>
      HookPersistence.getById(session, id) match {
        case Some(hook) => complete(hook)
        case None => complete(StatusCodes.NotFound, BadRequest("No web hook exists with that ID."))
      }
    }
  } } }

  @Path("/{id}")
  @ApiOperation(value = "Modify a web hook by ID", nickname = "putById", httpMethod = "PUT", response = classOf[WebHook],
    notes = "Modifies the web hook with a given ID.  If a web hook with the ID does not yet exist, it is created.")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the aspect to be saved."),
    new ApiImplicitParam(name = "hook", required = true, dataType = "au.csiro.data61.magda.model.Registry$WebHook", paramType = "body", value = "The web hook to save.")
  ))
  def putById = put { path(Segment) { (id: String) => {
    entity(as[WebHook]) { hook =>
      DB localTx { session =>
        HookPersistence.putById(session, id, hook) match {
          case Success(result) => complete(result)
          case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
        }
      }
    }
  } } }

//  @Path("/{id}")
//  @ApiOperation(value = "Modify an aspect by applying a JSON Patch", nickname = "patchById", httpMethod = "PATCH", response = classOf[AspectDefinition],
//    notes = "The patch should follow IETF RFC 6902 (https://tools.ietf.org/html/rfc6902).")
//  @ApiImplicitParams(Array(
//    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the aspect to be saved."),
//    new ApiImplicitParam(name = "aspectPatch", required = true, dataType = "gnieh.diffson.JsonPatchSupport$JsonPatch", paramType = "body", value = "The RFC 6902 patch to apply to the aspect.")
//  ))
//  def patchById = patch { path(Segment) { (id: String) => {
//    entity(as[JsonPatch]) { aspectPatch =>
//      DB localTx { session =>
//        AspectPersistence.patchById(session, id, aspectPatch) match {
//          case Success(result) => complete(result)
//          case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
//        }
//      }
//    }
//  } } }

  def route =
    getAll ~
    create ~
    getById ~
    putById
//      patchById
}
