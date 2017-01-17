package au.csiro.data61.magda.registry

import javax.ws.rs.Path

import akka.actor.ActorSystem
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.stream.Materializer
import akka.http.scaladsl.server.Directives._
import scalikejdbc._
import akka.http.scaladsl.model.StatusCodes
import io.swagger.annotations._
import gnieh.diffson.sprayJson._
import spray.json.JsObject

import scala.util.Failure
import scala.util.Success

@Path("/records/{recordID}/sections")
@io.swagger.annotations.Api(value = "record sections", produces = "application/json")
class RecordSectionsService(system: ActorSystem, materializer: Materializer) extends Protocols with SprayJsonSupport {
  @ApiOperation(value = "Get a list of all sections of a record", nickname = "getAll", httpMethod = "GET", response = classOf[JsObject], responseContainer = "Map")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "recordID", required = true, dataType = "string", paramType = "path", value = "ID of the record for which to fetch sections.")
  ))
  def getAll = get { path(Segment / "sections") { (recordID: String) =>
    DB readOnly { session =>
      RecordPersistence.getById(session, recordID) match {
        case Some(result) => complete(result.sections)
        case None => complete(StatusCodes.NotFound, BadRequest("No record exists with that ID."))
      }
    }
  } }

  @Path("/{sectionID}")
  @ApiOperation(value = "Get a record section by ID", nickname = "getById", httpMethod = "GET", response = classOf[JsObject])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "recordID", required = true, dataType = "string", paramType = "path", value = "ID of the record for which to fetch a section."),
    new ApiImplicitParam(name = "sectionID", required = true, dataType = "string", paramType = "path", value = "ID of the section to fetch.")
  ))
  @ApiResponses(Array(
    new ApiResponse(code = 404, message = "No record or section exists with the given IDs.", response = classOf[BadRequest])
  ))
  def getById = get { path(Segment / "sections" / Segment) { (recordID: String, sectionID: String) => {
    DB readOnly { session =>
      RecordPersistence.getRecordSectionById(session, recordID, sectionID) match {
        case Some(recordSection) => complete(recordSection)
        case None => complete(StatusCodes.NotFound, BadRequest("No record section exists with that ID."))
      }
    }
  } } }

  @Path("/{sectionID}")
  @ApiOperation(value = "Modify a record section by ID", nickname = "putById", httpMethod = "PUT", response = classOf[JsObject],
    notes = "Modifies a record section.  If the section does not yet exist on this record, it is created.")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "recordID", required = true, dataType = "string", paramType = "path", value = "ID of the record for which to fetch a section."),
    new ApiImplicitParam(name = "sectionID", required = true, dataType = "string", paramType = "path", value = "ID of the section to fetch."),
    new ApiImplicitParam(name = "section", required = true, dataType = "spray.json.JsObject", paramType = "body", value = "The record section to save.")
  ))
  def putById = put { path(Segment / "sections" / Segment) { (recordID: String, sectionID: String) => {
    entity(as[JsObject]) { section =>
      DB localTx { session =>
        RecordPersistence.putRecordSectionById(session, recordID, sectionID, section) match {
          case Success(result) => complete(result)
          case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
        }
      }
    }
  } } }

  @Path("/{sectionID}")
  @ApiOperation(value = "Modify a record section by applying a JSON Patch", nickname = "patchById", httpMethod = "PATCH", response = classOf[JsObject],
    notes = "The patch should follow IETF RFC 6902 (https://tools.ietf.org/html/rfc6902).")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "recordID", required = true, dataType = "string", paramType = "path", value = "ID of the record for which to fetch a section."),
    new ApiImplicitParam(name = "sectionID", required = true, dataType = "string", paramType = "path", value = "ID of the section to fetch."),
    new ApiImplicitParam(name = "sectionPatch", required = true, dataType = "gnieh.diffson.JsonPatchSupport$JsonPatch", paramType = "body", value = "The RFC 6902 patch to apply to the section.")
  ))
  def patchById = patch { path(Segment / "sections" / Segment) { (recordID: String, sectionID: String) => {
    entity(as[JsonPatch]) { sectionPatch =>
      DB localTx { session =>
        RecordPersistence.patchRecordSectionById(session, recordID, sectionID, sectionPatch) match {
          case Success(result) => complete(result)
          case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
        }
      }
    }
  } } }

  val route =
      getAll ~
      getById ~
      putById ~
      patchById
}
