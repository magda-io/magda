package au.csiro.data61.magda.registry

import javax.ws.rs.Path

import au.csiro.data61.magda.model.Registry._
import akka.actor.{ ActorRef, ActorSystem }
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.stream.Materializer
import akka.http.scaladsl.server.Directives._
import scalikejdbc.DB
import akka.http.scaladsl.model.StatusCodes
import io.swagger.annotations._
import gnieh.diffson.sprayJson._
import au.csiro.data61.magda.directives.AuthDirectives.requireIsAdmin

import scala.util.Failure
import scala.util.Success
import com.typesafe.config.Config
import au.csiro.data61.magda.client.AuthApiClient

@Path("/records")
@io.swagger.annotations.Api(value = "records", produces = "application/json")
class RecordsService(config: Config, webHookActor: ActorRef, authClient: AuthApiClient, system: ActorSystem, materializer: Materializer) extends Protocols with SprayJsonSupport {
  @ApiOperation(value = "Get a list of all records", nickname = "getAll", httpMethod = "GET", response = classOf[RecordSummary], responseContainer = "List")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "aspect", required = false, dataType = "string", paramType = "query", allowMultiple = true, value = "The aspects for which to retrieve data, specified as multiple occurrences of this query parameter.  Only records that have all of these aspects will be included in the response."),
    new ApiImplicitParam(name = "optionalAspect", required = false, dataType = "string", paramType = "query", allowMultiple = true, value = "The optional aspects for which to retrieve data, specified as multiple occurrences of this query parameter.  These aspects will be included in a record if available, but a record will be included even if it is missing these aspects."),
    new ApiImplicitParam(name = "pageToken", required = false, dataType = "string", paramType = "query", value = "A token that identifies the start of a page of results.  This token should not be interpreted as having any meaning, but it can be obtained from a previous page of results."),
    new ApiImplicitParam(name = "start", required = false, dataType = "number", paramType = "query", value = "The index of the first record to retrieve.  When possible, specify pageToken instead as it will result in better performance.  If this parameter and pageToken are both specified, this parameter is interpreted as the index after the pageToken of the first record to retrieve."),
    new ApiImplicitParam(name = "limit", required = false, dataType = "number", paramType = "query", value = "The maximum number of records to receive.  The response will include a token that can be passed as the pageToken parameter to a future request to continue receiving results where this query leaves off."),
    new ApiImplicitParam(name = "dereference", required = false, dataType = "boolean", paramType = "query", value = "true to automatically dereference links to other records; false to leave them as links.  Dereferencing a link means including the record itself where the link would be.  Dereferencing only happens one level deep, regardless of the value of this parameter.")))
  def getAll = get { pathEnd { parameters('aspect.*, 'optionalAspect.*, 'pageToken.?, 'start.as[Int].?, 'limit.as[Int].?, 'dereference.as[Boolean].?) { getAllWithAspects } } }

  @ApiOperation(value = "Create a new record", nickname = "create", httpMethod = "POST", response = classOf[Record])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "record", required = true, dataType = "au.csiro.data61.magda.model.Registry$Record", paramType = "body", value = "The definition of the new record.")))
  @ApiResponses(Array(
    new ApiResponse(code = 400, message = "A record already exists with the supplied ID, or the record includes an aspect that does not exist.", response = classOf[BadRequest])))
  def create = post {
    pathEnd {
      requireIsAdmin(authClient) { _ =>
        entity(as[Record]) { record =>
          val result = DB localTx { session =>
            RecordPersistence.createRecord(session, record) match {
              case Success(result)    => complete(result)
              case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
            }
          }
          webHookActor ! WebHookActor.Process
          result
        }
      }
    }
  }

  @Path("/{recordId}")
  @ApiOperation(value = "Delete a record", nickname = "deleteById", httpMethod = "DELETE", response = classOf[DeleteResult])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "recordId", required = true, dataType = "string", paramType = "path", value = "ID of the record to delete.")))
  @ApiResponses(Array(
    new ApiResponse(code = 400, message = "The record could not be deleted, possibly because it is used by another record.", response = classOf[BadRequest])))
  def deleteById = delete {
    path(Segment) { (recordId: String) =>
      requireIsAdmin(authClient) { _ =>
        {
          val result = DB localTx { session =>
            RecordPersistence.deleteRecord(session, recordId) match {
              case Success(result)    => complete(DeleteResult(result))
              case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
            }
          }
          webHookActor ! WebHookActor.Process
          result
        }
      }
    }
  }

  @Path("/{id}")
  @ApiOperation(value = "Get a record by ID", nickname = "getById", httpMethod = "GET", response = classOf[Record],
    notes = "Gets a complete record, including data for all aspects.")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the record to be fetched."),
    new ApiImplicitParam(name = "aspect", required = false, dataType = "string", paramType = "query", allowMultiple = true, value = "The aspects for which to retrieve data, specified as multiple occurrences of this query parameter.  Only records that have all of these aspects will be included in the response."),
    new ApiImplicitParam(name = "optionalAspect", required = false, dataType = "string", paramType = "query", allowMultiple = true, value = "The optional aspects for which to retrieve data, specified as multiple occurrences of this query parameter.  These aspects will be included in a record if available, but a record will be included even if it is missing these aspects."),
    new ApiImplicitParam(name = "dereference", required = false, dataType = "boolean", paramType = "query", value = "true to automatically dereference links to other records; false to leave them as links.  Dereferencing a link means including the record itself where the link would be.  Dereferencing only happens one level deep, regardless of the value of this parameter.")))
  @ApiResponses(Array(
    new ApiResponse(code = 404, message = "No record exists with that ID.", response = classOf[BadRequest])))
  def getById = get { path(Segment) { id => { parameters('aspect.*, 'optionalAspect.*, 'dereference.as[Boolean].?) { getByIdWithAspects(id) } } } }

  @Path("/{id}")
  @ApiOperation(value = "Modify a record by ID", nickname = "putById", httpMethod = "PUT", response = classOf[Record],
    notes = "Modifies a record.  Aspects included in the request are created or updated, but missing aspects are not removed.")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the record to be fetched."),
    new ApiImplicitParam(name = "record", required = true, dataType = "au.csiro.data61.magda.model.Registry$Record", paramType = "body", value = "The record to save.")))
  def putById = put {
    path(Segment) { (id: String) =>
      {
        requireIsAdmin(authClient) { _ =>
          entity(as[Record]) { record =>
            val result = DB localTx { session =>
              RecordPersistence.putRecordById(session, id, record) match {
                case Success(aspect)    => complete(record)
                case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
              }
            }
            webHookActor ! WebHookActor.Process
            result
          }
        }
      }
    }
  }

  @Path("/{id}")
  @ApiOperation(value = "Modify a record by applying a JSON Patch", nickname = "patchById", httpMethod = "PATCH", response = classOf[AspectDefinition],
    notes = "The patch should follow IETF RFC 6902 (https://tools.ietf.org/html/rfc6902).")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the aspect to be saved."),
    new ApiImplicitParam(name = "recordPatch", required = true, dataType = "gnieh.diffson.JsonPatchSupport$JsonPatch", paramType = "body", value = "The RFC 6902 patch to apply to the aspect.")))
  def patchById = patch {
    path(Segment) { (id: String) =>
      {
        requireIsAdmin(authClient) { _ =>
          entity(as[JsonPatch]) { recordPatch =>
            val result = DB localTx { session =>
              RecordPersistence.patchRecordById(session, id, recordPatch) match {
                case Success(result)    => complete(result)
                case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
              }
            }
            webHookActor ! WebHookActor.Process
            result
          }
        }
      }
    }
  }

  val route =
    getAll ~
      getById ~
      putById ~
      patchById ~
      create ~
      deleteById ~
      new RecordAspectsService(webHookActor, system, materializer).route ~
      new RecordHistoryService(system, materializer).route

  private def getAllWithAspects(aspects: Iterable[String],
                                optionalAspects: Iterable[String],
                                pageToken: Option[String],
                                start: Option[Int],
                                limit: Option[Int],
                                dereference: Option[Boolean]) = {
    complete {
      DB readOnly { session =>
        if (aspects.isEmpty && optionalAspects.isEmpty)
          RecordPersistence.getAll(session, pageToken, start, limit)
        else
          RecordPersistence.getAllWithAspects(session, aspects, optionalAspects, pageToken, start, limit, dereference)
      }
    }
  }

  private def getByIdWithAspects(id: String)(
    aspects: Iterable[String],
    optionalAspects: Iterable[String],
    dereference: Option[Boolean]) = {
    DB readOnly { session =>
      if (aspects.isEmpty && optionalAspects.isEmpty)
        RecordPersistence.getById(session, id) match {
          case Some(record) => complete(record)
          case None         => complete(StatusCodes.NotFound, BadRequest("No record exists with that ID."))
        }
      else
        RecordPersistence.getByIdWithAspects(session, id, aspects, optionalAspects, dereference) match {
          case Some(record) => complete(record)
          case None         => complete(StatusCodes.NotFound, BadRequest("No record exists with that ID or it does not have the required aspects."))
        }
    }
  }
}
