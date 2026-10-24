package au.csiro.data61.magda.registry

import akka.actor.{ActorRef, ActorSystem}
import akka.event.Logging
import akka.http.scaladsl.marshalling.ToEntityMarshaller
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.model.headers.RawHeader
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.Route
import akka.stream.Materializer
import au.csiro.data61.magda.ServerError
import au.csiro.data61.magda.directives.AuthDirectives.{getJwt, requireUserId}
import au.csiro.data61.magda.directives.TenantDirectives.requiresSpecifiedTenantId
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.model.TenantId.SpecifiedTenantId
import au.csiro.data61.magda.registry.RecordMutationAuthorization.{
  MutationFailure,
  authorizeRecordMutation,
  mutationResult,
  requireUnconditionalPermission,
  runInMutationTransaction
}
import com.typesafe.config.Config
import gnieh.diffson.sprayJson._
import io.swagger.annotations._

import javax.ws.rs.Path
import scalikejdbc.DBSession
import spray.json.JsObject

import scala.util.{Failure, Success, Try}
import au.csiro.data61.magda.directives.CommonDirectives.{
  onCompleteBlockingTask,
  sanitizedJsonEntity
}

@Path("/records/{recordId}/aspects")
@io.swagger.annotations.Api(
  value = "record aspects",
  produces = "application/json"
)
class RecordAspectsService(
    webHookActor: ActorRef,
    authClient: RegistryAuthApiClient,
    system: ActorSystem,
    materializer: Materializer,
    config: Config,
    recordPersistence: RecordPersistence
) extends RecordAspectsServiceRO(
      authClient,
      system,
      materializer,
      config,
      recordPersistence
    ) {

  private val logger = Logging(system, getClass)

  private val defaultQueryTimeout = config
    .getDuration(
      "db-query.default-timeout",
      scala.concurrent.duration.SECONDS
    )
    .toInt

  /**
    * @apiGroup Registry Record Aspects
    * @api {put} /v0/registry/records/{recordId}/aspects/{aspectId} Modify a record aspect by ID
    * @apiDescription Modifies a record aspect. If the aspect does not yet exist on this record, it is created.
    *   Please note: when the record (specified by recordId ) doesn't exist, this API will respond 400 error.
    * @apiParam (path) {string} recordId ID of the record for which to update an aspect.
    * @apiParam (path) {string} aspectId ID of the aspect to update
    * @apiParam (query) {boolean} [merge] Whether merge with existing aspect data or replace it. Default: `false`
    * @apiParam (body) {json} aspect The record aspect to save
    * @apiParamExample {json} Request-Example
    *    {
    *      "format": "text/csv",
    *      "mediaType": "text/csv",
    *      "name": "qcat-outdoor~AIR_TEMP~9.csv",
    *      "downloadURL": "https://data.csiro.au/dap/ws/v2/collections/17914/data/103023",
    *      "licence": "CSIRO Data Licence",
    *      "id": 103023,
    *      "accessURL": "https://data.csiro.au/dap/ws/v2/collections/17914/data"
    *    }
    * @apiHeader {string} X-Magda-Session Magda internal session id
    * @apiHeader {number} X-Magda-Tenant-Id Magda internal tenant id
    *
    * @apiHeader {string} x-magda-event-id This is a **response header** that is **ONLY** available when the operation is completed successfully.
    *           If the operation did make changes and triggered an event, the header value will be the eventId.
    *           Otherwise (i.e. no change are made), this header value will be "0".
    *
    * @apiSuccess (Success 200) {json} Response the aspect detail
    * @apiSuccessExample {json} Response:
    *    {
    *      "format": "text/csv",
    *      "mediaType": "text/csv",
    *      "name": "qcat-outdoor~AIR_TEMP~9.csv",
    *      "downloadURL": "https://data.csiro.au/dap/ws/v2/collections/17914/data/103023",
    *      "licence": "CSIRO Data Licence",
    *      "id": 103023,
    *      "accessURL": "https://data.csiro.au/dap/ws/v2/collections/17914/data"
    *    }
    * @apiUse GenericError
    */
  @Path("/{aspectId}")
  @ApiOperation(
    value = "Modify a record aspect by ID",
    nickname = "putById",
    httpMethod = "PUT",
    response = classOf[Aspect],
    notes =
      "Modifies a record aspect.  If the aspect does not yet exist on this record, it is created."
  )
  @ApiImplicitParams(
    Array(
      new ApiImplicitParam(
        name = "recordId",
        required = true,
        dataType = "string",
        paramType = "path",
        value = "ID of the record for which to update an aspect."
      ),
      new ApiImplicitParam(
        name = "aspectId",
        required = true,
        dataType = "string",
        paramType = "path",
        value = "ID of the aspect to update."
      ),
      new ApiImplicitParam(
        name = "aspect",
        required = true,
        dataType = "au.csiro.data61.magda.model.Registry$Aspect",
        paramType = "body",
        value = "The record aspect to save."
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
      ),
      new ApiImplicitParam(
        name = "X-Magda-Tenant-Id",
        required = true,
        dataType = "number",
        paramType = "header",
        value = "0"
      )
    )
  )
  def putById: Route = put {
    path(Segment / "aspects" / Segment) {
      (recordId: String, aspectId: String) =>
        requireUserId { userId =>
          requiresSpecifiedTenantId { tenantId =>
            sanitizedJsonEntity(as[JsObject]) { aspect =>
              parameters(
                'merge.as[Boolean].?
              ) { merge =>
                getJwt { jwt =>
                  completeRecordAspectMutation(
                    jwt,
                    tenantId,
                    recordId,
                    webHookAspectIds = Some(List(aspectId))
                  ) { implicit session =>
                    recordPersistence.putRecordAspectById(
                      tenantId,
                      recordId,
                      aspectId,
                      aspect,
                      userId,
                      false,
                      merge.getOrElse(false)
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
    * @apiGroup Registry Record Aspects
    * @api {delete} /v0/registry/records/{recordId}/aspects/{aspectId} Delete a record aspect by ID
    * @apiDescription Deletes a record aspect.
    * @apiParam (path) {string} recordId ID of the record for which to update an aspect.
    * @apiParam (path) {string} aspectId ID of the aspect to update
    * @apiHeader {string} X-Magda-Session Magda internal session id
    * @apiHeader {number} X-Magda-Tenant-Id Magda internal tenant id
    *
    * @apiHeader {string} x-magda-event-id This is a **response header** that is **ONLY** available when the operation is completed successfully.
    *           If the operation did make changes and triggered an event, the header value will be the eventId.
    *           Otherwise (i.e. no change are made), this header value will be "0".
    *
    * @apiSuccess (Success 200) {json} Response operation result
    * @apiSuccessExample {json} Response:
    * {
    *   "deleted": true
    * }
    * @apiUse GenericError
    */
  @Path("/{aspectId}")
  @ApiOperation(
    value = "Delete a record aspect by ID",
    nickname = "deleteById",
    httpMethod = "DELETE",
    response = classOf[DeleteResult],
    notes = "Deletes a record aspect."
  )
  @ApiImplicitParams(
    Array(
      new ApiImplicitParam(
        name = "recordId",
        required = true,
        dataType = "string",
        paramType = "path",
        value = "ID of the record for which to delete an aspect."
      ),
      new ApiImplicitParam(
        name = "aspectId",
        required = true,
        dataType = "string",
        paramType = "path",
        value = "ID of the aspect to delete."
      ),
      new ApiImplicitParam(
        name = "X-Magda-Session",
        required = true,
        dataType = "String",
        paramType = "header",
        value = "Magda internal session id"
      ),
      new ApiImplicitParam(
        name = "X-Magda-Tenant-Id",
        required = true,
        dataType = "number",
        paramType = "header",
        value = "0"
      )
    )
  )
  def deleteById: Route = delete {
    path(Segment / "aspects" / Segment) {
      (recordId: String, aspectId: String) =>
        requireUserId { userId =>
          requiresSpecifiedTenantId { tenantId =>
            getJwt { jwt =>
              def deleteRecordAspect(implicit session: DBSession) =
                recordPersistence
                  .deleteRecordAspect(tenantId, recordId, aspectId, userId)
                  .map {
                    case (deleted, eventId) => (DeleteResult(deleted), eventId)
                  }
              // delete a record aspect should be considered as update operation for the record
              // we will not implement aspect level auth for now
              completeRecordAspectMutation(
                jwt,
                tenantId,
                recordId,
                // when record cannot found, only user has unconditional record update access can proceed to this API (and potentially know the aspect has been already deleted)
                onRecordNotFound = Some { implicit session: DBSession =>
                  requireUnconditionalPermission(
                    authClient,
                    jwt,
                    "object/record/update"
                  )
                  mutationResult(deleteRecordAspect)
                }
              )(deleteRecordAspect(_))
            }
          }
        }
    }
  }

  /**
    * @apiGroup Registry Record Aspects
    * @api {patch} /v0/registry/records/{recordId}/aspects/{aspectId} Modify a record aspect by applying a JSON Patch
    * @apiDescription The patch should follow IETF RFC 6902 (https://tools.ietf.org/html/rfc6902).
    * @apiParam (path) {string} recordId ID of the record for which to update an aspect.
    * @apiParam (path) {string} aspectId ID of the aspect to update
    * @apiParam (aspectPatch) {json} aspectPatch The RFC 6902 patch to apply to the aspect.
    * @apiParamExample {json} Request-Example
    *    [
    *       {
    *          "path": "string"
    *       }
    *    ]
    * @apiHeader {string} X-Magda-Session Magda internal session id
    * @apiHeader {number} X-Magda-Tenant-Id Magda internal tenant id
    *
    * @apiHeader {string} x-magda-event-id This is a **response header** that is **ONLY** available when the operation is completed successfully.
    *           If the operation did make changes and triggered an event, the header value will be the eventId.
    *           Otherwise (i.e. no change are made), this header value will be "0".
    *
    * @apiSuccess (Success 200) {json} Response operation result
    * @apiSuccessExample {json} Response:
    *    {
    *      "format": "text/csv",
    *      "mediaType": "text/csv",
    *      "name": "qcat-outdoor~AIR_TEMP~9.csv",
    *      "downloadURL": "https://data.csiro.au/dap/ws/v2/collections/17914/data/103023",
    *      "licence": "CSIRO Data Licence",
    *      "id": 103023,
    *      "accessURL": "https://data.csiro.au/dap/ws/v2/collections/17914/data"
    *    }
    * @apiUse GenericError
    */
  @Path("/{aspectId}")
  @ApiOperation(
    value = "Modify a record aspect by applying a JSON Patch",
    nickname = "patchById",
    httpMethod = "PATCH",
    response = classOf[Aspect],
    notes =
      "The patch should follow IETF RFC 6902 (https://tools.ietf.org/html/rfc6902)."
  )
  @ApiImplicitParams(
    Array(
      new ApiImplicitParam(
        name = "recordId",
        required = true,
        dataType = "string",
        paramType = "path",
        value = "ID of the record for which to fetch an aspect."
      ),
      new ApiImplicitParam(
        name = "aspectId",
        required = true,
        dataType = "string",
        paramType = "path",
        value = "ID of the aspect to fetch."
      ),
      new ApiImplicitParam(
        name = "aspectPatch",
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
      ),
      new ApiImplicitParam(
        name = "X-Magda-Tenant-Id",
        required = true,
        dataType = "number",
        paramType = "header",
        value = "0"
      )
    )
  )
  def patchById: Route = patch {
    path(Segment / "aspects" / Segment) {
      (recordId: String, aspectId: String) =>
        requireUserId { userId =>
          requiresSpecifiedTenantId { tenantId =>
            sanitizedJsonEntity(as[JsonPatch]) { aspectPatch =>
              getJwt { jwt =>
                completeRecordAspectMutation(jwt, tenantId, recordId) {
                  implicit session =>
                    recordPersistence.patchRecordAspectById(
                      tenantId,
                      recordId,
                      aspectId,
                      aspectPatch,
                      userId
                    )
                }
              }
            }
          }
        }
    }
  }

  /**
    * Run a mutation on a record's aspect when the user has `object/record/update` permission on the record's current
    * and proposed state (see `RecordMutationAuthorization`), and complete the request with the mutation result.
    * The mutation is rolled back when it fails or the user has no permission.
    * It responds BadRequest with the error when the mutation fails, and InternalServerError for any other failure
    * (e.g. failing to load the record for the auth decision).
    * There is no way to construct the full record context data for the auth decision without the record,
    * so it responds BadRequest when the record doesn't exist, unless `onRecordNotFound` is supplied.
    * The webhook actor is notified after the transaction ends.
    *
    * @param webHookAspectIds the aspects changed, for the webhook actor to process. `None` for all aspects.
    */
  private def completeRecordAspectMutation[T](
      jwt: Option[String],
      tenantId: SpecifiedTenantId,
      recordId: String,
      onRecordNotFound: Option[DBSession => (T, Long)] = None,
      webHookAspectIds: Option[List[String]] = None
  )(
      mutation: DBSession => Try[(T, Long)]
  )(implicit m: ToEntityMarshaller[T]): Route =
    onCompleteBlockingTask {
      val theResult = runInMutationTransaction(this.defaultQueryTimeout) {
        implicit session =>
          authorizeRecordMutation(
            authClient,
            jwt,
            tenantId,
            recordId,
            onRecordNotFound = () =>
              onRecordNotFound match {
                case Some(f) => f(session)
                case None =>
                  throw ServerError(
                    s"Cannot locate request record by id: ${recordId}",
                    StatusCodes.BadRequest
                  )
              }
          )(mutation(session))
      } match {
        case Success((result, eventId)) =>
          complete(
            StatusCodes.OK,
            List(RawHeader("x-magda-event-id", eventId.toString)),
            result
          )
        case Failure(ServerError(msg, statusCode)) =>
          complete(statusCode, ApiError(msg))
        case Failure(MutationFailure(exception)) =>
          complete(
            StatusCodes.BadRequest,
            ApiError(exception.getMessage)
          )
        case Failure(exception) =>
          logger.error(
            exception,
            "Failed to change an aspect of record {}",
            recordId
          )
          complete(
            StatusCodes.InternalServerError,
            ApiError("An error occurred while processing the request.")
          )
      }
      webHookActor ! WebHookActor.Process(
        ignoreWaitingForResponse = false,
        webHookAspectIds
      )
      theResult
    }

  override def route: Route =
    super.route ~
      putById ~
      deleteById ~
      patchById
}
