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

import scala.util.Failure
import scala.util.Success

@Path("/records")
@io.swagger.annotations.Api(value = "records", produces = "application/json")
class RecordsService(system: ActorSystem, materializer: Materializer) extends Protocols with SprayJsonSupport {
  @ApiOperation(value = "Get a list of all records", nickname = "getAll", httpMethod = "GET", response = classOf[RecordSummary], responseContainer = "List")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "section", required = false, dataType = "string", paramType = "query", allowMultiple = true, value = "The sections for which to retrieve data, specified as multiple occurrences of this query parameter.  Only records that have at least one of these sections will be included in the response."),
    new ApiImplicitParam(name = "sections", required = false, dataType = "string", paramType = "query", value = "The sections for which to retrieve data, specified as a comma-separate list.  Only records that have at least one of these sections will be included in the response.")
  ))
  def getAll = get { pathEnd { parameters('section.*) { getAllWithSections } } }

  @ApiOperation(value = "Create a new record", nickname = "create", httpMethod = "POST", response = classOf[Record])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "record", required = true, dataType = "au.csiro.data61.magda.registry.Record", paramType = "body", value = "The definition of the new record.")
  ))
  @ApiResponses(Array(
    new ApiResponse(code = 400, message = "A record already exists with the supplied ID, or the record includes a section that does not exist.", response = classOf[BadRequest])
  ))
  def create = post { pathEnd { entity(as[Record]) { record =>
    DB localTx { session =>
      RecordPersistence.createRecord(session, record) match {
        case Success(result) => complete(result)
        case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
      }
    }
  } } }

  @Path("/{id}")
  @ApiOperation(value = "Get a record by ID", nickname = "getById", httpMethod = "GET", response = classOf[Record],
    notes = "Gets a complete record, including data for all sections.")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the record to be fetched.")
  ))
  @ApiResponses(Array(
    new ApiResponse(code = 404, message = "No record exists with that ID.", response = classOf[BadRequest])
  ))
  def getById = get { path(Segment) { (id: String) => {
    DB readOnly { session =>
      RecordPersistence.getById(session, id) match {
        case Some(section) => complete(section)
        case None => complete(StatusCodes.NotFound, BadRequest("No record exists with that ID."))
      }
    }
  } } }

  @Path("/{id}")
  @ApiOperation(value = "Modify a record by ID", nickname = "putById", httpMethod = "PUT", response = classOf[Record],
    notes = "Modifies a record.  Sections included in the request are created or updated, but missing sections are not removed.")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the record to be fetched."),
    new ApiImplicitParam(name = "record", required = true, dataType = "au.csiro.data61.magda.registry.Record", paramType = "body", value = "The record to save.")
  ))
  def putById = put { path(Segment) { (id: String) => {
    entity(as[Record]) { record =>
      DB localTx { session =>
        RecordPersistence.putRecordById(session, id, record) match {
          case Success(section) => complete(record)
          case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
        }
      }
    }
  } } }

  @Path("/{id}")
  @ApiOperation(value = "Modify a record by applying a JSON Patch", nickname = "patchById", httpMethod = "PATCH", response = classOf[Section],
    notes = "The patch should follow IETF RFC 6902 (https://tools.ietf.org/html/rfc6902).")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the section to be saved."),
    new ApiImplicitParam(name = "recordPatch", required = true, dataType = "gnieh.diffson.JsonPatchSupport$JsonPatch", paramType = "body", value = "The RFC 6902 patch to apply to the section.")
  ))
  def patchById = patch { path(Segment) { (id: String) => {
    entity(as[JsonPatch]) { recordPatch =>
      DB localTx { session =>
        RecordPersistence.patchRecordById(session, id, recordPatch) match {
          case Success(result) => complete(result)
          case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
        }
      }
    }
  } } }

  val route =
    get { pathEnd { parameter('sections) { sections => getAllWithSections(sections.split(",").map(_.trim)) } } } ~
    getAll ~
    getById ~
    putById ~
    patchById ~
    create ~
    new RecordSectionsService(system, materializer).route

  private def getAllWithSections(sections: Iterable[String]) = {
    complete {
      DB readOnly { session =>
        if (sections.isEmpty)
          RecordPersistence.getAll(session)
        else
          RecordPersistence.getAllWithSections(session, sections)
      }
    }
  }
}
