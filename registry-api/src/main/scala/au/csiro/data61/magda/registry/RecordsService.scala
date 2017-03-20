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
    new ApiImplicitParam(name = "aspect", required = false, dataType = "string", paramType = "query", allowMultiple = true, value = "The aspects for which to retrieve data, specified as multiple occurrences of this query parameter.  Only records that have at least one of these aspects will be included in the response."),
    new ApiImplicitParam(name = "aspects", required = false, dataType = "string", paramType = "query", value = "The aspects for which to retrieve data, specified as a comma-separate list.  Only records that have at least one of these aspects will be included in the response."),
    new ApiImplicitParam(name = "optionalAspect", required = false, dataType = "string", paramType = "query", allowMultiple = true, value = "The optional aspects for which to retrieve data, specified as multiple occurrences of this query parameter.  These aspects will be included in a record if available, but a record will be included even if it is missing these aspects."),
    new ApiImplicitParam(name = "optionalAspects", required = false, dataType = "string", paramType = "query", value = "The optional aspects for which to retrieve data, specified as a comma-separate list.  These aspects will be included in a record if available, but a record will be included even if it is missing these aspects."),
    new ApiImplicitParam(name = "pageToken", required = false, dataType = "string", paramType = "query", value = "A token that identifies the start of a page of results.  This token should not be interpreted as having any meaning, but it can be obtained from a previous page of results."),
    new ApiImplicitParam(name = "start", required = false, dataType = "number", paramType = "query", value = "The index of the first record to retrieve.  When possible, specify pageToken instead as it will result in better performance.  If this parameter and pageToken are both specified, this parameter is interpreted as the index after the pageToken of the first record to retrieve."),
    new ApiImplicitParam(name = "limit", required = false, dataType = "number", paramType = "query", value = "The maximum number of records to receive.  The response will include a token that can be passed as the pageToken parameter to a future request to continue receiving results where this query leaves off."),
    new ApiImplicitParam(name = "dereference", required = false, dataType = "boolean", paramType = "query", value = "true to automatically dereference links to other records; false to leave them as links.  Dereferencing a link means including the record itself where the link would be.  Dereferencing only happens one level deep, regardless of the value of this parameter.")
  ))
  def getAll = get { pathEnd { parameters('aspect.*, 'optionalAspect.*, 'aspects.?, 'optionalAspects.?, 'pageToken.?, 'start.as[Int].?, 'limit.as[Int].?, 'dereference.as[Boolean].?) { getAllWithAspects } } }

  @ApiOperation(value = "Create a new record", nickname = "create", httpMethod = "POST", response = classOf[Record])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "record", required = true, dataType = "au.csiro.data61.magda.registry.Record", paramType = "body", value = "The definition of the new record.")
  ))
  @ApiResponses(Array(
    new ApiResponse(code = 400, message = "A record already exists with the supplied ID, or the record includes an aspect that does not exist.", response = classOf[BadRequest])
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
    notes = "Gets a complete record, including data for all aspects.")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the record to be fetched.")
  ))
  @ApiResponses(Array(
    new ApiResponse(code = 404, message = "No record exists with that ID.", response = classOf[BadRequest])
  ))
  def getById = get { path(Segment) { (id: String) => {
    DB readOnly { session =>
      RecordPersistence.getById(session, id) match {
        case Some(aspect) => complete(aspect)
        case None => complete(StatusCodes.NotFound, BadRequest("No record exists with that ID."))
      }
    }
  } } }

  @Path("/{id}")
  @ApiOperation(value = "Modify a record by ID", nickname = "putById", httpMethod = "PUT", response = classOf[Record],
    notes = "Modifies a record.  Aspects included in the request are created or updated, but missing aspects are not removed.")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the record to be fetched."),
    new ApiImplicitParam(name = "record", required = true, dataType = "au.csiro.data61.magda.registry.Record", paramType = "body", value = "The record to save.")
  ))
  def putById = put { path(Segment) { (id: String) => {
    entity(as[Record]) { record =>
      DB localTx { session =>
        RecordPersistence.putRecordById(session, id, record) match {
          case Success(aspect) => complete(record)
          case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
        }
      }
    }
  } } }

  @Path("/{id}")
  @ApiOperation(value = "Modify a record by applying a JSON Patch", nickname = "patchById", httpMethod = "PATCH", response = classOf[AspectDefinition],
    notes = "The patch should follow IETF RFC 6902 (https://tools.ietf.org/html/rfc6902).")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the aspect to be saved."),
    new ApiImplicitParam(name = "recordPatch", required = true, dataType = "gnieh.diffson.JsonPatchSupport$JsonPatch", paramType = "body", value = "The RFC 6902 patch to apply to the aspect.")
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
    getAll ~
    getById ~
    putById ~
    patchById ~
    create ~
    new RecordAspectsService(system, materializer).route

  private def getAllWithAspects(aspect: Iterable[String],
                                optionalAspect: Iterable[String],
                                aspects: Option[String],
                                optionalAspects: Option[String],
                                pageToken: Option[String],
                                start: Option[Int],
                                limit: Option[Int],
                                dereference: Option[Boolean]) = {
    val allAspects = List.concat(aspect, aspects.getOrElse("").split(",").map(_.trim).filter(!_.isEmpty))
    val allOptionalAspects = List.concat(optionalAspect, optionalAspects.getOrElse("").split(",").map(_.trim).filter(!_.isEmpty))

    complete {
      DB readOnly { session =>
        if (allAspects.isEmpty && allOptionalAspects.isEmpty)
          RecordPersistence.getAll(session, pageToken, start, limit)
        else
          RecordPersistence.getAllWithAspects(session, allAspects, allOptionalAspects, pageToken, start, limit, dereference)
      }
    }
  }
}
