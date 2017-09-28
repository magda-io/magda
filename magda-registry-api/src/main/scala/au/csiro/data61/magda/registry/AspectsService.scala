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
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.directives.AuthDirectives.requireIsAdmin

import scala.util.{ Failure, Success }
import com.typesafe.config.Config
import au.csiro.data61.magda.client.AuthApiClient

@Path("/aspects")
@io.swagger.annotations.Api(value = "aspect definitions", produces = "application/json")
class AspectsService(config: Config, authClient: AuthApiClient, system: ActorSystem, materializer: Materializer) extends Protocols with SprayJsonSupport {
  @ApiOperation(value = "Get a list of all aspects", nickname = "getAll", httpMethod = "GET", response = classOf[AspectDefinition], responseContainer = "List")
  def getAll = get {
    pathEnd {
      complete {
        DB readOnly { session =>
          AspectPersistence.getAll(session)
        }
      }
    }
  }

  @ApiOperation(value = "Create a new aspect", nickname = "create", httpMethod = "POST", response = classOf[AspectDefinition])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "aspect", required = true, dataType = "au.csiro.data61.magda.model.Registry$AspectDefinition", paramType = "body", value = "The definition of the new aspect.")))
  def create = post {
    pathEnd {
      requireIsAdmin(authClient) { _ =>
        entity(as[AspectDefinition]) { aspect =>
          DB localTx { session =>
            AspectPersistence.create(session, aspect) match {
              case Success(result)    => complete(result)
              case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
            }
          }
        }
      }
    }
  }

  @Path("/{id}")
  @ApiOperation(value = "Get an aspect by ID", nickname = "getById", httpMethod = "GET", response = classOf[AspectDefinition])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the aspect to be fetched.")))
  def getById = get {
    path(Segment) { (id: String) =>
      {
        DB readOnly { session =>
          AspectPersistence.getById(session, id) match {
            case Some(aspect) => complete(aspect)
            case None         => complete(StatusCodes.NotFound, BadRequest("No aspect exists with that ID."))
          }
        }
      }
    }
  }

  @Path("/{id}")
  @ApiOperation(value = "Modify an aspect by ID", nickname = "putById", httpMethod = "PUT", response = classOf[AspectDefinition],
    notes = "Modifies the aspect with a given ID.  If an aspect with the ID does not yet exist, it is created.")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the aspect to be saved."),
    new ApiImplicitParam(name = "aspect", required = true, dataType = "au.csiro.data61.magda.model.Registry$AspectDefinition", paramType = "body", value = "The aspect to save.")))
  def putById = put {
    path(Segment) { (id: String) =>
      {
        requireIsAdmin(authClient) { _ =>
          entity(as[AspectDefinition]) { aspect =>
            DB localTx { session =>
              AspectPersistence.putById(session, id, aspect) match {
                case Success(result)    => complete(result)
                case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
              }
            }
          }
        }
      }
    }
  }

  @Path("/{id}")
  @ApiOperation(value = "Modify an aspect by applying a JSON Patch", nickname = "patchById", httpMethod = "PATCH", response = classOf[AspectDefinition],
    notes = "The patch should follow IETF RFC 6902 (https://tools.ietf.org/html/rfc6902).")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the aspect to be saved."),
    new ApiImplicitParam(name = "aspectPatch", required = true, dataType = "gnieh.diffson.JsonPatchSupport$JsonPatch", paramType = "body", value = "The RFC 6902 patch to apply to the aspect.")))
  def patchById = patch {
    path(Segment) { (id: String) =>
      {
        requireIsAdmin(authClient) { _ =>
          entity(as[JsonPatch]) { aspectPatch =>
            DB localTx { session =>
              AspectPersistence.patchById(session, id, aspectPatch) match {
                case Success(result)    => complete(result)
                case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
              }
            }
          }
        }
      }
    }
  }

  def route =
    getAll ~
      create ~
      getById ~
      putById ~
      patchById
}
