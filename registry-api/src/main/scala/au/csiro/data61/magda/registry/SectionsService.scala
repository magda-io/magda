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

import scala.util.{Failure, Success}

@Path("/sections")
@io.swagger.annotations.Api(value = "section definitions", produces = "application/json")
class SectionsService(system: ActorSystem, materializer: Materializer) extends Protocols with SprayJsonSupport {
  @ApiOperation(value = "Get a list of all sections", nickname = "getAll", httpMethod = "GET", response = classOf[Section], responseContainer = "List")
  def getAll = get { pathEnd {
    complete {
      DB readOnly { session =>
        SectionPersistence.getAll(session)
      }
    }
  } }

  @ApiOperation(value = "Create a new section", nickname = "create", httpMethod = "POST", response = classOf[Section])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "section", required = true, dataType = "au.csiro.data61.magda.registry.Section", paramType = "body", value = "The definition of the new section.")
  ))
  def create = post { pathEnd { entity(as[Section]) { section =>
    DB localTx { session =>
      SectionPersistence.create(session, section) match {
        case Success(result) => complete(result)
        case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
      }
    }
  } } }

  @Path("/{id}")
  @ApiOperation(value = "Get a section by ID", nickname = "getById", httpMethod = "GET", response = classOf[Section])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the section to be fetched.")
  ))
  def getById = get { path(Segment) { (id: String) => {
    DB readOnly { session =>
      SectionPersistence.getById(session, id) match {
        case Some(section) => complete(section)
        case None => complete(StatusCodes.NotFound, BadRequest("No section exists with that ID."))
      }
    }
  } } }

  @Path("/{id}")
  @ApiOperation(value = "Modify a section by ID", nickname = "putById", httpMethod = "PUT", response = classOf[Section],
    notes = "Modifies the section with a given ID.  If a section with the ID does not yet exist, it is created.")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the section to be saved."),
    new ApiImplicitParam(name = "section", required = true, dataType = "au.csiro.data61.magda.registry.Section", paramType = "body", value = "The section to save.")
  ))
  def putById = put { path(Segment) { (id: String) => {
    entity(as[Section]) { section =>
      DB localTx { session =>
        SectionPersistence.putById(session, id, section) match {
          case Success(result) => complete(result)
          case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
        }
      }
    }
  } } }

  @Path("/{id}")
  @ApiOperation(value = "Modify a section by applying a JSON Patch", nickname = "patchById", httpMethod = "PATCH", response = classOf[Section],
    notes = "The patch should follow IETF RFC 6902 (https://tools.ietf.org/html/rfc6902).")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the section to be saved."),
    new ApiImplicitParam(name = "sectionPatch", required = true, dataType = "gnieh.diffson.JsonPatchSupport$JsonPatch", paramType = "body", value = "The RFC 6902 patch to apply to the section.")
  ))
  def patchById = patch { path(Segment) { (id: String) => {
    entity(as[JsonPatch]) { sectionPatch =>
      DB localTx { session =>
        SectionPersistence.patchById(session, id, sectionPatch) match {
          case Success(result) => complete(result)
          case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
        }
      }
    }
  } } }

  def route =
    getAll ~
    create ~
    getById ~
    putById ~
    patchById
}
