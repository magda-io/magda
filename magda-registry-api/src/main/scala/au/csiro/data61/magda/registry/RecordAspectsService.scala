package au.csiro.data61.magda.registry

import akka.actor.{ActorRef, ActorSystem}
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.model.headers.RawHeader
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.Route
import akka.stream.Materializer
import au.csiro.data61.magda.directives.AuthDirectives.{requireUserId}
import au.csiro.data61.magda.directives.TenantDirectives.{
  requiresSpecifiedTenantId
}
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.registry.Directives.{
  requireRecordAspectUpdatePermission,
  requireDeleteRecordAspectPermission
}
import com.typesafe.config.Config
import gnieh.diffson.sprayJson._
import io.swagger.annotations._

import javax.ws.rs.Path
import scalikejdbc.DB
import spray.json.JsObject

import scala.util.{Failure, Success}

import au.csiro.data61.magda.directives.CommonDirectives.onCompleteBlockingTask

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
            entity(as[JsObject]) { aspect =>
              parameters(
                'merge.as[Boolean].?
              ) { merge =>
                requireRecordAspectUpdatePermission(
                  authClient,
                  recordId,
                  aspectId,
                  Left(aspect),
                  merge.getOrElse(false)
                ) {
                  onCompleteBlockingTask {
                    val theResult = DB localTx { implicit session =>
                      session.queryTimeout(this.defaultQueryTimeout)
                      recordPersistence.putRecordAspectById(
                        tenantId,
                        recordId,
                        aspectId,
                        aspect,
                        userId,
                        false,
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
                        case Failure(exception) =>
                          complete(
                            StatusCodes.BadRequest,
                            ApiError(exception.getMessage)
                          )
                      }
                    }
                    webHookActor ! WebHookActor
                      .Process(
                        ignoreWaitingForResponse = false,
                        Some(List(aspectId))
                      )
                    theResult
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
          // delete a record aspect should be considered as update operation for the record
          // we will not implement aspect level auth for now
          requireDeleteRecordAspectPermission(authClient, recordId, aspectId) {
            requiresSpecifiedTenantId { tenantId =>
              onCompleteBlockingTask {
                val theResult = DB localTx { implicit session =>
                  session.queryTimeout(this.defaultQueryTimeout)
                  recordPersistence.deleteRecordAspect(
                    tenantId,
                    recordId,
                    aspectId,
                    userId
                  ) match {
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
            entity(as[JsonPatch]) { aspectPatch =>
              requireRecordAspectUpdatePermission(
                authClient,
                recordId,
                aspectId,
                Right(aspectPatch)
              ) {
                onCompleteBlockingTask {
                  val theResult = DB localTx { implicit session =>
                    session.queryTimeout(this.defaultQueryTimeout)
                    recordPersistence.patchRecordAspectById(
                      tenantId,
                      recordId,
                      aspectId,
                      aspectPatch,
                      userId
                    ) match {
                      case Success(result) =>
                        complete(
                          StatusCodes.OK,
                          List(
                            RawHeader("x-magda-event-id", result._2.toString)
                          ),
                          result._1
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
  }

  override def route: Route =
    super.route ~
      putById ~
      deleteById ~
      patchById
}
