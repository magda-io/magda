package au.csiro.data61.magda.registry

import java.util.concurrent.TimeoutException
import akka.actor.{ActorRef, ActorSystem}
import akka.event.Logging
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.model.headers.RawHeader
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.Route
import akka.stream.Materializer
import au.csiro.data61.magda.ServerError
import au.csiro.data61.magda.client.AuthDecisionReqConfig
import au.csiro.data61.magda.registry.Directives.{
  requireRecordPermission,
  requireRecordUpdateOrCreateWhenNonExistPermission
}
import au.csiro.data61.magda.directives.AuthDirectives.{
  requirePermission,
  requireUnconditionalAuthDecision,
  requireUserId,
  withAuthDecision
}
import au.csiro.data61.magda.directives.TenantDirectives.requiresSpecifiedTenantId
import au.csiro.data61.magda.model.Auth.recordToContextData
import au.csiro.data61.magda.model.Registry._
import com.typesafe.config.Config
import gnieh.diffson.sprayJson._
import io.swagger.annotations._

import javax.ws.rs.Path
import scalikejdbc.DB
import org.everit.json.schema.ValidationException
import spray.json.JsObject

import scala.concurrent.{Await, ExecutionContext, Future}
import scala.concurrent.duration._
import scala.util.{Failure, Success}

import au.csiro.data61.magda.directives.CommonDirectives.withBlockingTask

@Path("/records")
@io.swagger.annotations.Api(value = "records", produces = "application/json")
class RecordsService(
    config: Config,
    webHookActor: ActorRef,
    authClient: RegistryAuthApiClient,
    system: ActorSystem,
    materializer: Materializer,
    recordPersistence: RecordPersistence,
    eventPersistence: EventPersistence
) extends RecordsServiceRO(
      authClient,
      config,
      system,
      materializer,
      recordPersistence,
      eventPersistence
    ) {
  val logger = Logging(system, getClass)
  implicit val ec: ExecutionContext = system.dispatcher

  private val defaultQueryTimeout = config
    .getDuration(
      "db-query.default-timeout",
      scala.concurrent.duration.SECONDS
    )
    .toInt

  private val longQueryTimeout = config
    .getDuration(
      "db-query.long-query-timeout",
      scala.concurrent.duration.SECONDS
    )
    .toInt

  /**
    * @apiGroup Registry Record Service
    * @api {delete} /v0/registry/records/{recordId} Delete a record
    *
    * @apiDescription Delete a record
    *
    * @apiParam (path) {string} recordId ID of the record to delete.
    * @apiHeader {string} X-Magda-Session Magda internal session id
    *
    * @apiHeader {string} x-magda-event-id This is a **response header** that is **ONLY** available when the operation is completed successfully.
    *           If the operation did make changes and triggered an event, the header value will be the eventId.
    *           Otherwise (i.e. no change are made), this header value will be "0".
    *
    * @apiSuccess (Success 200) {json} Response the record deletion result
    * @apiSuccessExample {json} Response:
    *   {
    *     "deleted": true
    *   }
    * @apiUse GenericError
    */
  @Path("/{recordId}")
  @ApiOperation(
    value = "Delete a record",
    nickname = "deleteById",
    httpMethod = "DELETE",
    response = classOf[DeleteResult]
  )
  @ApiImplicitParams(
    Array(
      new ApiImplicitParam(
        name = "X-Magda-Tenant-Id",
        required = true,
        dataType = "number",
        paramType = "header",
        value = "0"
      ),
      new ApiImplicitParam(
        name = "recordId",
        required = true,
        dataType = "string",
        paramType = "path",
        value = "ID of the record to delete."
      ),
      new ApiImplicitParam(
        name = "X-Magda-Session",
        required = true,
        dataType = "String",
        paramType = "header",
        value = "Magda internal session id"
      )
    )
  )
  @ApiResponses(
    Array(
      new ApiResponse(
        code = 400,
        message =
          "The record could not be deleted, possibly because it is used by another record.",
        response = classOf[ApiError]
      )
    )
  )
  def deleteById: Route = delete {
    path(Segment) { recordId: String =>
      requireUserId { userId =>
        requireRecordPermission(
          authClient,
          "object/record/delete",
          recordId,
          // when the record doesn't not exist (or not accessible within current tenant)
          // we will check "unconditional" `delete` permission. i.e.
          // users with "unconditional" `delete` permission will get 200 status code with "record is deleted" response (this is for matching existing behaviour).
          // users without this permission will not be able to know that the record has been removed.
          onRecordNotFound = Some(
            () =>
              requireUnconditionalAuthDecision(
                authClient,
                AuthDecisionReqConfig("object/record/delete")
              ) & pass
          )
        ) {
          requiresSpecifiedTenantId { tenantId =>
            withBlockingTask {
              val theResult = DB localTx { implicit session =>
                session.queryTimeout(this.defaultQueryTimeout)
                recordPersistence
                  .deleteRecord(tenantId, recordId, userId) match {
                  case Success(result) =>
                    complete(
                      StatusCodes.OK,
                      List(RawHeader("x-magda-event-id", result._2.toString)),
                      DeleteResult(result._1)
                    )
                  case Failure(exception) =>
                    complete(
                      StatusCodes.BadRequest,
                      ApiError(exception.getMessage)
                    )
                }
              }
              webHookActor ! WebHookActor.Process()
              theResult
            }
          }
        }
      }
    }
  }

  /**
    * @apiGroup Registry Record Service
    * @api {delete} /v0/registry/records Trim by source tag
    *
    * @apiDescription Trims records with the provided source that DON’T have the supplied source tag
    *
    * @apiParam (query) {string} sourceTagToPreserve Source tag of the records to PRESERVE.
    * @apiParam (query) {string} sourceId Source id of the records to delete.
    * @apiHeader {string} X-Magda-Session Magda internal session id
    *
    * @apiSuccess (Success 200) {json} Response-200 the trim result
    * @apiSuccessExample {json} Response-200:
    *   {
    *     "count": 0
    *   }
    * @apiSuccess (Success 202) {string} Response Deletion is taking a long time (normal for sources with many records) but it has worked
    * @apiError (Error 400) {string} Response The records could not be deleted, possibly because they are used by other records.
    * @apiUse GenericError
    */
  @Path("/")
  @ApiOperation(
    value = "Trim by source tag",
    notes =
      "Trims records with the provided source that DON'T have the supplied source tag",
    nickname = "trimBySourceTag",
    httpMethod = "DELETE",
    response = classOf[MultipleDeleteResult]
  )
  @ApiImplicitParams(
    Array(
      new ApiImplicitParam(
        name = "X-Magda-Tenant-Id",
        required = true,
        dataType = "number",
        paramType = "header",
        value = "0"
      ),
      new ApiImplicitParam(
        name = "sourceTagToPreserve",
        required = true,
        dataType = "string",
        paramType = "query",
        value = "Source tag of the records to PRESERVE."
      ),
      new ApiImplicitParam(
        name = "sourceId",
        required = true,
        dataType = "string",
        paramType = "query",
        value = "Source id of the records to delete."
      ),
      new ApiImplicitParam(
        name = "X-Magda-Session",
        required = true,
        dataType = "String",
        paramType = "header",
        value = "Magda internal session id"
      )
    )
  )
  @ApiResponses(
    Array(
      new ApiResponse(
        code = 202,
        message =
          "Deletion is taking a long time (normal for sources with many records) but it has worked"
      ),
      new ApiResponse(
        code = 400,
        message =
          "The records could not be deleted, possibly because they are used by other records.",
        response = classOf[ApiError]
      )
    )
  )
  def trimBySourceTag: Route = delete {
    pathEnd {
      // as trimBySourceTag is an `atomic` operation,
      // i.e. we don't want it to be partially done because the user only has delete permission to some records
      // we will ask "unconditional" permission here.
      // i.e. user has delete permission regardless any records' attributes
      requireUnconditionalAuthDecision(
        authClient,
        AuthDecisionReqConfig("object/record/delete")
      ) {
        requireUserId { userId =>
          requiresSpecifiedTenantId { tenantId =>
            parameters('sourceTagToPreserve, 'sourceId) {
              (sourceTagToPreserve, sourceId) =>
                extractActorSystem { routeActor =>
                  implicit val blockingExeCtx = routeActor.dispatchers.lookup(
                    "long-running-db-operation-dispatcher"
                  )
                  val deleteFuture = Future {
                    // --- DB session needs to be created within the `Future`
                    // --- as the `Future` will keep running after timeout and require active DB session
                    DB localTx { implicit session =>
                      session.queryTimeout(this.longQueryTimeout)
                      recordPersistence.trimRecordsBySource(
                        tenantId,
                        sourceTagToPreserve,
                        sourceId,
                        userId,
                        Some(logger)
                      )
                    }
                  } map { result =>
                    webHookActor ! WebHookActor.Process()
                    result
                  }

                  val deleteResult = try {
                    Await.result(
                      deleteFuture,
                      config
                        .getLong("trimBySourceTagTimeoutThreshold") milliseconds
                    )
                  } catch {
                    case e: Throwable => Failure(e)
                  }

                  deleteResult match {
                    case Success(result) =>
                      complete(MultipleDeleteResult(result))
                    case Failure(_: TimeoutException) =>
                      complete(StatusCodes.Accepted)
                    case Failure(exception) =>
                      logger.error(
                        exception,
                        "An error occurred while trimming with sourceTagToPreserve $1 sourceId $2",
                        sourceTagToPreserve,
                        sourceId
                      )
                      complete(
                        StatusCodes.BadRequest,
                        ApiError(
                          "An error occurred while processing your request."
                        )
                      )
                  }
                }
            }
          }
        }
      }
    }
  }

  /**
    * @apiGroup Registry Record Service
    * @api {put} /v0/registry/records/{id} Modify a record by ID
    *
    * @apiDescription Modifies a record. Aspects included in the request are created or updated, but missing aspects are not removed.
    *
    * @apiParam (path) {string} id ID of the record to be fetched.
    * @apiParam (query) {boolean} [merge] Whether merge with existing aspect data or replace it. Default: `false`
    * @apiParam (body) {json} record The record to save.
    * @apiParamExample {json} Request-Example
    * {
    *    "id": "string",
    *    "name": "string",
    *    "aspects": {},
    *    "sourceTag": "string"
    * }
    *
    * @apiHeader {string} X-Magda-Session Magda internal session id
    * @apiHeader {number} X-Magda-Tenant-Id Magda internal tenant id
    *
    * @apiHeader {string} x-magda-event-id This is a **response header** that is **ONLY** available when the operation is completed successfully.
    *           If the operation did make changes and triggered an event, the header value will be the eventId.
    *           Otherwise (i.e. no change are made), this header value will be "0".
    *
    * @apiSuccess (Success 200) {json} Response the record detail
    * @apiSuccessExample {json} Response:
    *      {
    *          "id": "string",
    *          "name": "string",
    *          "aspects": {},
    *          "sourceTag": "string"
    *      }
    * @apiUse GenericError
    */
  @Path("/{id}")
  @ApiOperation(
    value = "Modify a record by ID",
    nickname = "putById",
    httpMethod = "PUT",
    response = classOf[Record],
    notes =
      "Modifies a record.  Aspects included in the request are created or updated, but missing aspects are not removed."
  )
  @ApiImplicitParams(
    Array(
      new ApiImplicitParam(
        name = "X-Magda-Tenant-Id",
        required = true,
        dataType = "number",
        paramType = "header",
        value = "0"
      ),
      new ApiImplicitParam(
        name = "id",
        required = true,
        dataType = "string",
        paramType = "path",
        value = "ID of the record to be fetched."
      ),
      new ApiImplicitParam(
        name = "record",
        required = true,
        dataType = "au.csiro.data61.magda.model.Registry$Record",
        paramType = "body",
        value = "The record to save."
      ),
      new ApiImplicitParam(
        name = "merge",
        required = false,
        dataType = "boolean",
        paramType = "query",
        value =
          "Whether merge the supplied aspect data to existing aspect data or replace it"
      ),
      new ApiImplicitParam(
        name = "X-Magda-Session",
        required = true,
        dataType = "String",
        paramType = "header",
        value = "Magda internal session id"
      )
    )
  )
  def putById: Route = put {
    path(Segment) { id: String =>
      requireUserId { userId =>
        requiresSpecifiedTenantId { tenantId =>
          entity(as[Record]) { recordIn =>
            parameters(
              'merge.as[Boolean].?
            ) { merge =>
              requireRecordUpdateOrCreateWhenNonExistPermission(
                authClient,
                recordIn.id,
                Left(recordIn),
                merge.getOrElse(false)
              ) {
                withBlockingTask {
                  val result = DB localTx { implicit session =>
                    session.queryTimeout(this.defaultQueryTimeout)
                    recordPersistence.putRecordById(
                      tenantId,
                      id,
                      recordIn,
                      userId,
                      forceSkipAspectValidation = false,
                      merge.getOrElse(false)
                    ) match {
                      case Success(result) =>
                        complete(
                          StatusCodes.OK,
                          List(
                            RawHeader("x-magda-event-id", result._2.toString)
                          ),
                          result._1
                        )
                      // If the exception is from validation then reveal the message to the caller,
                      // otherwise log it and return something generic.
                      case Failure(exception: ValidationException) =>
                        complete(
                          StatusCodes.BadRequest,
                          ApiError(
                            "Encountered an error - " + exception.getMessage
                          )
                        )
                      case Failure(exception) =>
                        logger.error(
                          exception,
                          "Encountered an exception when putting a record"
                        )
                        complete(
                          StatusCodes.InternalServerError,
                          ApiError("Encountered an error")
                        )
                    }
                  }
                  webHookActor ! WebHookActor.Process(
                    ignoreWaitingForResponse = false,
                    Some(recordIn.aspects.keys.toList)
                  )
                  result
                }
              }
            }
          }
        }
      }
    }
  }

  /**
    * @apiGroup Registry Record Service
    * @api {patch} /v0/registry/records/{id} Modify a record by applying a JSON Patch
    *
    * @apiDescription The patch should follow IETF RFC 6902 (https://tools.ietf.org/html/rfc6902).
    *
    * @apiParam (path) {string} id ID of the record to be patched.
    * @apiParam (body) {json} recordPatch The RFC 6902 patch to apply to the aspect.
    * @apiParamExample {json} Request-Example
    * [
    *    // update record's name field
    *    {
    *      "op": "replace",
    *      "path": "/name",
    *      "value": "a new record name"
    *    },
    *    // update the record's `publishing` aspect `state` field
    *    {
    *      "op": "replace",
    *      "path": "/aspects/publishing/state",
    *      "value": "published"
    *    },
    *    // remove the record's `dataset-draft` aspect
    *    {
    *      "op": "remove",
    *      "path": "/aspects/dataset-draft"
    *    },
    *    // add a "title" field to the record's `dcat-dataset-strings` aspect
    *    {
    *      "op": "add",
    *      "path": "/aspects/dcat-dataset-strings/title",
    *      "value": "test dataset"
    *    }
    * ]
    *
    * @apiHeader {string} X-Magda-Session Magda internal session id
    * @apiHeader {number} X-Magda-Tenant-Id Magda internal tenant id
    *
    * @apiHeader {string} x-magda-event-id This is a **response header** that is **ONLY** available when the operation is completed successfully.
    *           If the operation did make changes and triggered an event, the header value will be the eventId.
    *           Otherwise (i.e. no change are made), this header value will be "0".
    *
    * @apiSuccess (Success 200) {json} Response the record detail
    * @apiSuccessExample {json} Response:
    *      {
    *        "id": "string",
    *        "name": "string",
    *        "jsonSchema": {}
    *      }
    * @apiUse GenericError
    */
  @Path("/{id}")
  @ApiOperation(
    value = "Modify a record by applying a JSON Patch",
    nickname = "patchById",
    httpMethod = "PATCH",
    response = classOf[Record],
    notes =
      "The patch should follow IETF RFC 6902 (https://tools.ietf.org/html/rfc6902)."
  )
  @ApiImplicitParams(
    Array(
      new ApiImplicitParam(
        name = "X-Magda-Tenant-Id",
        required = true,
        dataType = "number",
        paramType = "header",
        value = "0"
      ),
      new ApiImplicitParam(
        name = "id",
        required = true,
        dataType = "string",
        paramType = "path",
        value = "ID of the record to be pacthed."
      ),
      new ApiImplicitParam(
        name = "recordPatch",
        required = true,
        dataType = "gnieh.diffson.JsonPatchSupport$JsonPatch",
        paramType = "body",
        value = "The RFC 6902 patch to apply to the aspect."
      ),
      new ApiImplicitParam(
        name = "X-Magda-Session",
        required = true,
        dataType = "String",
        paramType = "header",
        value = "Magda internal session id"
      )
    )
  )
  def patchById: Route = patch {
    path(Segment) { id: String =>
      requireUserId { userId =>
        requiresSpecifiedTenantId { tenantId =>
          entity(as[JsonPatch]) { recordPatch =>
            requireRecordUpdateOrCreateWhenNonExistPermission(
              authClient,
              id,
              Right(recordPatch)
            ) {
              withBlockingTask {
                val theResult = DB localTx { implicit session =>
                  session.queryTimeout(this.defaultQueryTimeout)
                  recordPersistence.patchRecordById(
                    tenantId,
                    id,
                    recordPatch,
                    userId
                  ) match {
                    case Success(result) =>
                      complete(
                        StatusCodes.OK,
                        List(RawHeader("x-magda-event-id", result._2.toString)),
                        result._1
                      )
                    case Failure(exception) =>
                      logger.error(
                        exception,
                        "Exception encountered while PATCHing record {} with {}",
                        id,
                        recordPatch.toJson.prettyPrint
                      )
                      complete(
                        StatusCodes.BadRequest,
                        ApiError(exception.getMessage)
                      )
                  }
                }
                webHookActor ! WebHookActor
                  .Process()
                theResult
              }
            }
          }
        }

      }
    }
  }

  /**
    * @apiGroup Registry Record Service
    * @api {patch} /v0/registry/records Modify a list of records by applying the same JSON Patch
    *
    * @apiDescription The patch should follow IETF RFC 6902 (https://tools.ietf.org/html/rfc6902).
    *
    * @apiParam (body) {string[]} recordIds a list of record IDs of records to be patched
    * @apiParam (body) {object[]} jsonPatch The RFC 6902 patch to apply to the aspect.
    * @apiParamExample {json} Request-Example
    * {
    *   "recordIds": ["dsd-sds-xsds-22", "sds-sdds-2334-dds-34", "sdds-3439-34334343"],
    *   "jsonPatch": [
    *      // update record's name field
    *      {
    *        "op": "replace",
    *        "path": "/name",
    *        "value": "a new record name"
    *      },
    *      // update the record's `publishing` aspect `state` field
    *      {
    *        "op": "replace",
    *        "path": "/aspects/publishing/state",
    *        "value": "published"
    *      },
    *      // remove the record's `dataset-draft` aspect
    *      {
    *        "op": "remove",
    *        "path": "/aspects/dataset-draft"
    *      },
    *      // add a "title" field to the record's `dcat-dataset-strings` aspect
    *      {
    *        "op": "add",
    *        "path": "/aspects/dcat-dataset-strings/title",
    *        "value": "test dataset"
    *      }
    *   ]
    * }
    *
    * @apiHeader {string} X-Magda-Session Magda internal session id
    * @apiHeader {number} X-Magda-Tenant-Id Magda internal tenant id
    *
    *
    * @apiSuccess (Success 200) {json} Response a list of event id for each of the record after applied the json pathes
    * @apiSuccessExample {json} Response:
    *      [122, 123, 124]
    * @apiUse GenericError
    */
  @Path("/")
  @ApiOperation(
    value = "Modify a list of records by applying the same JSON Patch",
    nickname = "patchRecords",
    httpMethod = "PATCH",
    response = classOf[List[String]],
    notes =
      "The patch should follow IETF RFC 6902 (https://tools.ietf.org/html/rfc6902)."
  )
  @ApiImplicitParams(
    Array(
      new ApiImplicitParam(
        name = "X-Magda-Tenant-Id",
        required = true,
        dataType = "number",
        paramType = "header",
        value = "0"
      ),
      new ApiImplicitParam(
        name = "requestData",
        required = true,
        dataType = "au.csiro.data61.magda.model.Registry$PatchRecordsRequest",
        paramType = "body",
        value = "An json object has key 'recordIds' & 'jsonPath'"
      ),
      new ApiImplicitParam(
        name = "X-Magda-Session",
        required = true,
        dataType = "String",
        paramType = "header",
        value = "Magda internal session id"
      )
    )
  )
  def patchRecords: Route = patch {
    requireUserId { userId =>
      requiresSpecifiedTenantId { tenantId =>
        entity(as[PatchRecordsRequest]) { requestData =>
          withAuthDecision(
            authClient,
            AuthDecisionReqConfig("object/record/update")
          ) { authDecision =>
            withBlockingTask {
              val result = DB localTx { implicit session =>
                session.queryTimeout(this.defaultQueryTimeout)
                recordPersistence.patchRecords(
                  tenantId,
                  authDecision,
                  requestData.recordIds,
                  requestData.jsonPath,
                  userId
                ) match {
                  case Success(result) =>
                    complete(
                      StatusCodes.OK,
                      result
                    )
                  case Failure(ServerError(msg, statusCode)) =>
                    complete(
                      statusCode,
                      ApiError(msg)
                    )
                  case Failure(e) =>
                    complete(
                      StatusCodes.InternalServerError,
                      ApiError(e.getMessage)
                    )
                }
              }
              webHookActor ! WebHookActor
                .Process()
              result
            }
          }
        }
      }
    }
  }

  /**
    * @apiGroup Registry Record Aspects
    * @api {put} /v0/registry/records/aspects/:aspectId Modify a list of records's aspect with same new data
    *
    * @apiDescription  Modify a list of records's aspect with same new data
    *
    * @apiParam (path) {string} aspectId the id of the aspect to be updated
    * @apiParam (query) {boolean} [merge] Indicate whether merge the new data into existing aspect data or replace it. Default: `false`
    * @apiParam (body) {string[]} recordIds a list of record IDs of records to be patched
    * @apiParam (body) {object} data the new aspect data. When `merge` = true, the new data will be merged into existing aspect data (if exists).
    *
    * @apiParamExample {json} Request-Example
    * {
    *   "recordIds": ["dsd-sds-xsds-22", "sds-sdds-2334-dds-34", "sdds-3439-34334343"],
    *   "data": {
    *      "a" : 1,
    *      "b" : [1,2]
    *   }
    * }
    *
    * @apiHeader {string} X-Magda-Session Magda internal session id
    * @apiHeader {number} X-Magda-Tenant-Id Magda internal tenant id
    *
    *
    * @apiSuccess (Success 200) {json} Response a list of event id for each of the record after applied the new aspect data
    * @apiSuccessExample {json} Response:
    *      [122, 123, 124]
    * @apiUse GenericError
    */
  @Path("/aspects/{aspectId}")
  @ApiOperation(
    value = "Modify a list of records's aspect with same new data",
    nickname = "putRecordsAspect",
    httpMethod = "PUT",
    response = classOf[List[String]],
    notes = "Modify a list of records's aspect with same new data"
  )
  @ApiImplicitParams(
    Array(
      new ApiImplicitParam(
        name = "X-Magda-Tenant-Id",
        required = true,
        dataType = "number",
        paramType = "header",
        value = "0"
      ),
      new ApiImplicitParam(
        name = "aspectId",
        required = true,
        dataType = "string",
        paramType = "path",
        value = "ID of the aspect to update."
      ),
      new ApiImplicitParam(
        name = "requestData",
        required = true,
        dataType =
          "au.csiro.data61.magda.model.Registry$PutRecordsAspectRequest",
        paramType = "body",
        value = "An json object has key 'recordIds' & 'data'"
      ),
      new ApiImplicitParam(
        name = "merge",
        required = false,
        dataType = "boolean",
        paramType = "query",
        value =
          "Whether merge the supplied aspect data to existing aspect data or replace it"
      ),
      new ApiImplicitParam(
        name = "X-Magda-Session",
        required = true,
        dataType = "String",
        paramType = "header",
        value = "Magda internal session id"
      )
    )
  )
  def putRecordsAspect: Route = put {
    path("aspects" / Segment) { (aspectId: String) =>
      requireUserId { userId =>
        requiresSpecifiedTenantId { tenantId =>
          entity(as[PutRecordsAspectRequest]) { requestData =>
            parameters(
              'merge.as[Boolean].?
            ) { merge =>
              withAuthDecision(
                authClient,
                AuthDecisionReqConfig("object/record/update")
              ) { authDecision =>
                withBlockingTask {
                  val result = DB localTx { implicit session =>
                    session.queryTimeout(this.defaultQueryTimeout)
                    recordPersistence.putRecordsAspectById(
                      tenantId,
                      authDecision,
                      requestData.recordIds,
                      aspectId,
                      requestData.data,
                      userId,
                      false,
                      merge.getOrElse(false)
                    ) match {
                      case Success(result) =>
                        complete(
                          StatusCodes.OK,
                          result
                        )
                      case Failure(ServerError(msg, statusCode)) =>
                        complete(
                          statusCode,
                          ApiError(msg)
                        )
                      case Failure(e) =>
                        complete(
                          StatusCodes.InternalServerError,
                          ApiError(e.getMessage)
                        )
                    }
                  }
                  webHookActor ! WebHookActor
                    .Process()
                  result
                }
              }
            }
          }
        }
      }
    }
  }

  /**
    * @apiGroup Registry Record Aspects
    * @api {delete} /v0/registry/records/aspectArrayItems/:aspectId Remove items from records' aspect data
    *
    * @apiDescription  this API goes through the aspect data that is specified by aspectId of a list of registry records
    * and delete items from the array that is located by the jsonPath.
    * If the aspect doesn't exist for a record or the array can't be located with the jsonPath string or the value located with the jsonPath string is `null`,
    * the operation will be skipped without throwing error. `0` will returned as eventId for this case.
    * If the json data that is located by the jsonPath string exists and is not an Array or null, an error will be thrown and 400 code will be responded.
    *
    * @apiParam (path) {string} aspectId the id of the aspect to be updated
    * @apiParam (body) {string[]} recordIds a list of record IDs of records to be patched
    * @apiParam (body) {string} jsonPath the jsonPath string that is used to locate the json array in the record aspect data
    * @apiParam (body) {any[]} items a list of items to be removed from the located array. The type of the items can be either string or number.
    *
    * @apiParamExample {json} Request-Example
    * {
    *   "recordIds": ["dsd-sds-xsds-22", "sds-sdds-2334-dds-34", "sdds-3439-34334343"],
    *   "jsonPath": "$.preAuthorisedPermissionIds",
    *   "items": ["b133d777-6208-4aa1-8d0b-80bb49b7e5fc", "5d33cc4d-d914-468e-9f02-ae74484af716"]
    * }
    *
    * @apiHeader {string} X-Magda-Session Magda internal session id
    * @apiHeader {number} X-Magda-Tenant-Id Magda internal tenant id
    *
    *
    * @apiSuccess (Success 200) {json} Response a list of event id for each of the affected records after the operations
    * @apiSuccessExample {json} Response:
    *      [122, 123, 124]
    * @apiUse GenericError
    */
  @Path("/aspectArrayItems/{aspectId}")
  @ApiOperation(
    value = "Remove items from records' aspect data",
    nickname = "deleteRecordsAspectArrayItems",
    httpMethod = "DELETE",
    response = classOf[List[String]],
    notes = "Remove items from records' aspect data"
  )
  @ApiImplicitParams(
    Array(
      new ApiImplicitParam(
        name = "X-Magda-Tenant-Id",
        required = true,
        dataType = "number",
        paramType = "header",
        value = "0"
      ),
      new ApiImplicitParam(
        name = "aspectId",
        required = true,
        dataType = "string",
        paramType = "path",
        value = "ID of the aspect to update."
      ),
      new ApiImplicitParam(
        name = "requestData",
        required = true,
        dataType =
          "au.csiro.data61.magda.model.Registry$DeleteRecordsAspectArrayItemsRequest",
        paramType = "body",
        value = "An json object has key 'recordIds', 'jsonPath', 'items'"
      ),
      new ApiImplicitParam(
        name = "X-Magda-Session",
        required = true,
        dataType = "String",
        paramType = "header",
        value = "Magda internal session id"
      )
    )
  )
  def deleteRecordsAspectArrayItems: Route = delete {
    path("aspectArrayItems" / Segment) { (aspectId: String) =>
      requireUserId { userId =>
        requiresSpecifiedTenantId { tenantId =>
          entity(as[DeleteRecordsAspectArrayItemsRequest]) { requestData =>
            withAuthDecision(
              authClient,
              AuthDecisionReqConfig("object/record/update")
            ) { authDecision =>
              withBlockingTask {
                val result = DB localTx { implicit session =>
                  session.queryTimeout(this.defaultQueryTimeout)
                  recordPersistence.deleteRecordsAspectArrayItems(
                    tenantId,
                    authDecision,
                    requestData.recordIds,
                    aspectId,
                    requestData.jsonPath,
                    requestData.items,
                    userId
                  ) match {
                    case Success(result) =>
                      complete(
                        StatusCodes.OK,
                        result
                      )
                    case Failure(ServerError(msg, statusCode)) =>
                      complete(
                        statusCode,
                        ApiError(msg)
                      )
                    case Failure(e) =>
                      complete(
                        StatusCodes.InternalServerError,
                        ApiError(e.getMessage)
                      )
                  }
                }
                webHookActor ! WebHookActor
                  .Process()
                result
              }
            }
          }
        }
      }
    }
  }

  /**
    * @apiGroup Registry Record Service
    * @api {post} /v0/registry/records Create a new record
    *
    * @apiDescription Create a new record
    *
    * @apiParam (body) {json} record The definition of the new record.
    * @apiParamExample {json} Request-Example
    * {
    *    "id": "string",
    *    "name": "string",
    *    "aspects": {},
    *    "sourceTag": "string"
    * }
    *
    * @apiHeader {string} X-Magda-Session Magda internal session id
    * @apiHeader {number} X-Magda-Tenant-Id Magda internal tenant id
    *
    * @apiHeader {string} x-magda-event-id This is a **response header** that is **ONLY** available when the operation is completed successfully.
    *           If the operation did make changes and triggered an event, the header value will be the eventId.
    *           Otherwise (i.e. no change are made), this header value will be "0".
    *
    * @apiSuccess (Success 200) {json} Response the record created
    * @apiSuccessExample {json} Response:
    *      {
    *          "id": "string",
    *          "name": "string",
    *          "aspects": {},
    *          "sourceTag": "string"
    *      }
    * @apiError (Error 400) {string} Response could not create
    * @apiUse GenericError
    */
  @ApiOperation(
    value = "Create a new record",
    nickname = "create",
    httpMethod = "POST",
    response = classOf[Record]
  )
  @ApiImplicitParams(
    Array(
      new ApiImplicitParam(
        name = "X-Magda-Tenant-Id",
        required = true,
        dataType = "number",
        paramType = "header",
        value = "0"
      ),
      new ApiImplicitParam(
        name = "record",
        required = true,
        dataType = "au.csiro.data61.magda.model.Registry$Record",
        paramType = "body",
        value = "The definition of the new record."
      ),
      new ApiImplicitParam(
        name = "X-Magda-Session",
        required = true,
        dataType = "String",
        paramType = "header",
        value = "Magda internal session id"
      )
    )
  )
  @ApiResponses(
    Array(
      new ApiResponse(
        code = 400,
        message =
          "A record already exists with the supplied ID, or the record includes an aspect that does not exist.",
        response = classOf[ApiError]
      )
    )
  )
  def create: Route = post {
    requireUserId { userId =>
      requiresSpecifiedTenantId { tenantId =>
        pathEnd {
          entity(as[Record]) { record =>
            requirePermission(
              authClient,
              "object/record/create",
              input = Some(
                JsObject(
                  "object" -> JsObject("record" -> recordToContextData(record))
                )
              )
            ) {
              withBlockingTask {
                val result = DB localTx { implicit session =>
                  session.queryTimeout(this.defaultQueryTimeout)
                  recordPersistence
                    .createRecord(tenantId, record, userId) match {
                    case Success(theResult) =>
                      complete(
                        StatusCodes.OK,
                        List(
                          RawHeader("x-magda-event-id", theResult._2.toString)
                        ),
                        theResult._1
                      )
                    case Failure(exception) =>
                      complete(
                        StatusCodes.BadRequest,
                        ApiError(exception.getMessage)
                      )
                  }
                }
                webHookActor ! WebHookActor.Process(
                  ignoreWaitingForResponse = false,
                  Some(record.aspects.keys.toList)
                )
                result
              }
            }
          }
        }
      }
    }
  }

  override def route: Route =
    super.route ~
      putById ~
      patchById ~
      patchRecords ~
      trimBySourceTag ~
      deleteById ~
      create ~
      putRecordsAspect ~
      deleteRecordsAspectArrayItems ~
      new RecordAspectsService(
        webHookActor,
        authClient,
        system,
        materializer,
        config,
        recordPersistence
      ).route

}
