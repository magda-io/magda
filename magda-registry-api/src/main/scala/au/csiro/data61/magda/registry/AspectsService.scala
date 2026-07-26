package au.csiro.data61.magda.registry

import akka.actor.{ActorRef, ActorSystem}
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.Route
import akka.stream.Materializer
import akka.http.scaladsl.model.headers.RawHeader
import au.csiro.data61.magda.client.{AuthApiClient, AuthDecisionReqConfig}
import au.csiro.data61.magda.directives.AuthDirectives.{
  requirePermission,
  requireUnconditionalAuthDecision,
  requireUserId
}
import au.csiro.data61.magda.directives.TenantDirectives.requiresSpecifiedTenantId
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.registry.Directives.{
  requireAspectUpdateOrCreateWhenNonExistPermission,
  requireAspectPermission
}
import com.typesafe.config.Config
import gnieh.diffson.sprayJson._
import io.swagger.annotations._
import org.postgresql.util.PSQLException

import javax.ws.rs.Path
// Hide scalikejdbc's `delete` so it does not clash with akka-http's `delete` route directive
// (used by the deleteById route below). Everything else from scalikejdbc is still imported.
import scalikejdbc.{delete => _, _}
import spray.json.JsObject

import scala.util.{Failure, Success}
import au.csiro.data61.magda.directives.CommonDirectives.{
  onCompleteBlockingTask,
  sanitizedJsonEntity
}

class AspectsService(
    config: Config,
    authClient: AuthApiClient,
    webHookActor: ActorRef,
    system: ActorSystem,
    materializer: Materializer
) extends AspectsServiceRO(config, authClient, system, materializer) {

  private val defaultQueryTimeout = config
    .getDuration(
      "db-query.default-timeout",
      scala.concurrent.duration.SECONDS
    )
    .toInt

  /**
    * @apiGroup Registry Aspects
    * @api {post} /v0/registry/aspects Create a new aspect
    *
    * @apiDescription Acknowledges a previously-deferred web hook with a given ID. Acknowledging a previously-POSTed web hook will cause the next, if any, to be sent.
    *
    * @apiHeader {string} X-Magda-Session Magda internal session id
    * @apiParam (body) {json} aspect The definition of the new aspect.
    * @apiParamExample {json} Request-Example
    * {
    *    "id": "string",
    *    "name": "string",
    *    "jsonSchema": {}
    * }
    * @apiSuccess (Success 200) {json} Response The created aspect
    * @apiSuccessExample {json} Response:
    *
    *    {
    *      "id": "string",
    *      "name": "string",
    *      "jsonSchema": {}
    *    }
    *
    * @apiUse GenericError
    */
  @ApiOperation(
    value = "Create a new aspect",
    nickname = "create",
    httpMethod = "POST",
    response = classOf[AspectDefinition]
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
        name = "aspect",
        required = true,
        dataType = "au.csiro.data61.magda.model.Registry$AspectDefinition",
        paramType = "body",
        value = "The definition of the new aspect."
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
  def create: Route = post {
    pathEnd {
      requireUserId { userId =>
        requiresSpecifiedTenantId { tenantId =>
          sanitizedJsonEntity(as[AspectDefinition]) { aspect =>
            requirePermission(
              authClient,
              "object/aspect/create",
              input =
                Some(JsObject("object" -> JsObject("aspect" -> aspect.toJson)))
            ) {
              onCompleteBlockingTask {
                val theResult = DB localTx { session =>
                  session.queryTimeout(this.defaultQueryTimeout)
                  AspectPersistence
                    .create(aspect, tenantId, userId)(session) match {
                    case Success(result) =>
                      complete(result)
                    case Failure(e: PSQLException)
                        if e.getSQLState == "23505" =>
                      complete(
                        StatusCodes.BadRequest,
                        ApiError(s"Duplicated aspect id supplied: ${aspect.id}")
                      )
                    case Failure(e: RuntimeException) =>
                      complete(
                        StatusCodes.BadRequest,
                        ApiError(e.getMessage)
                      )
                    case Failure(e: PSQLException)
                        if e.getSQLState == "22001" =>
                      complete(
                        StatusCodes.BadRequest,
                        ApiError(
                          s"Supplied aspect name or id field is over the max. allowed size (100 characters)."
                        )
                      )
                    case Failure(exception) =>
                      complete(
                        StatusCodes.InternalServerError,
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

  /**
    * @apiGroup Registry Aspects
    * @api {put} /v0/registry/aspects/{id} Modify an aspect by ID
    *
    * @apiDescription Modifies the aspect with a given ID. If an aspect with the ID does not yet exist, it is created.
    *
    * @apiHeader {string} X-Magda-Session Magda internal session id
    * @apiParam (path) {string} id ID of the aspect to be saved.
    * @apiParam (body) {json} aspect The aspect to save.
    * @apiParamExample {json} Request-Example
    * {
    *    "id": "string",
    *    "name": "string",
    *    "jsonSchema": {}
    * }
    * @apiSuccess (Success 200) {json} Response The details of the aspect saved.
    * @apiSuccessExample {json} Response:
    *
    *    {
    *      "id": "string",
    *      "name": "string",
    *      "jsonSchema": {}
    *    }
    *
    * @apiUse GenericError
    */
  @Path("/{id}")
  @ApiOperation(
    value = "Modify an aspect by ID",
    nickname = "putById",
    httpMethod = "PUT",
    response = classOf[AspectDefinition],
    notes =
      "Modifies the aspect with a given ID.  If an aspect with the ID does not yet exist, it is created."
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
        value = "ID of the aspect to be saved."
      ),
      new ApiImplicitParam(
        name = "aspect",
        required = true,
        dataType = "au.csiro.data61.magda.model.Registry$AspectDefinition",
        paramType = "body",
        value = "The aspect to save."
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
      {
        requireUserId { userId =>
          requiresSpecifiedTenantId { tenantId =>
            sanitizedJsonEntity(as[AspectDefinition]) { aspect =>
              requireAspectUpdateOrCreateWhenNonExistPermission(
                authClient,
                id,
                Left(aspect)
              ) {
                onCompleteBlockingTask {
                  val theResult = DB localTx { session =>
                    session.queryTimeout(this.defaultQueryTimeout)
                    AspectPersistence.putById(id, aspect, tenantId, userId)(
                      session
                    ) match {
                      case Success(result) =>
                        complete(result)
                      case Failure(e: PSQLException)
                          if e.getSQLState == "23505" =>
                        complete(
                          StatusCodes.BadRequest,
                          ApiError(s"Duplicated aspect id supplied: ${id}")
                        )
                      case Failure(e: PSQLException)
                          if e.getSQLState == "22001" =>
                        complete(
                          StatusCodes.BadRequest,
                          ApiError(
                            s"Supplied aspect name or id field is over the max. allowed size (100 characters)."
                          )
                        )
                      case Failure(e: RuntimeException) =>
                        complete(
                          StatusCodes.BadRequest,
                          ApiError(e.getMessage)
                        )
                      case Failure(exception) =>
                        complete(
                          StatusCodes.InternalServerError,
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
  }

  /**
    * @apiGroup Registry Aspects
    * @api {patch} /v0/registry/aspects/{id} Modify an aspect by applying a JSON Patch
    *
    * @apiDescription The patch should follow IETF RFC 6902 (https://tools.ietf.org/html/rfc6902).
    *
    * @apiHeader {string} X-Magda-Session Magda internal session id
    * @apiParam (path) {string} id ID of the aspect to be saved.
    * @apiParam (body) {json} aspectPatch The RFC 6902 patch to apply to the aspect.
    * @apiParamExample {json} Request-Example
    * [
    *    {
    *        "path": "string"
    *    }
    * ]
    * @apiSuccess (Success 200) {json} Response The details of the aspect patched.
    * @apiSuccessExample {json} Response:
    *
    *    {
    *      "id": "string",
    *      "name": "string",
    *      "jsonSchema": {}
    *    }
    *
    * @apiUse GenericError
    */
  @Path("/{id}")
  @ApiOperation(
    value = "Modify an aspect by applying a JSON Patch",
    nickname = "patchById",
    httpMethod = "PATCH",
    response = classOf[AspectDefinition],
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
        value = "ID of the aspect to be saved."
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
      )
    )
  )
  def patchById: Route = patch {
    path(Segment) { id: String =>
      requireUserId { userId =>
        requiresSpecifiedTenantId { tenantId =>
          sanitizedJsonEntity(as[JsonPatch]) { aspectPatch =>
            requireAspectUpdateOrCreateWhenNonExistPermission(
              authClient,
              id,
              Right(aspectPatch)
            ) {
              onCompleteBlockingTask {
                val theResult = DB localTx { session =>
                  session.queryTimeout(this.defaultQueryTimeout)
                  AspectPersistence
                    .patchById(id, aspectPatch, tenantId, userId)(session) match {
                    case Success(result) =>
                      complete(result)
                    case Failure(e: PSQLException)
                        if e.getSQLState == "22001" =>
                      complete(
                        StatusCodes.BadRequest,
                        ApiError(
                          s"Supplied aspect name or id field is over the max. allowed size (100 characters)."
                        )
                      )
                    case Failure(e: RuntimeException) =>
                      complete(
                        StatusCodes.BadRequest,
                        ApiError(e.getMessage)
                      )
                    case Failure(exception) =>
                      complete(
                        StatusCodes.InternalServerError,
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

  /**
    * @apiGroup Registry Aspects
    * @api {delete} /v0/registry/aspects/{id} Delete an aspect definition by ID
    *
    * @apiDescription Deletes an aspect definition.
    *
    *   The aspect definition can only be deleted when no record aspect data references it
    *   (within the current tenant). If any record still stores data under the aspect, the
    *   request is refused with a `409 Conflict` response and nothing is deleted; delete the
    *   referencing record aspect data first.
    *
    *   Deleting an aspect that does not exist responds with `200` and `{ "deleted": false }`
    *   (rather than `404`), mirroring the behaviour of `DELETE /v0/registry/records/{recordId}`.
    *
    * @apiParam (path) {string} id ID of the aspect to be deleted.
    * @apiHeader {number} X-Magda-Tenant-Id 0 unless it is a multi-tenant magda deployment.
    * @apiHeader {string} X-Magda-Session Magda internal session id
    *
    * @apiHeader {string} x-magda-event-id This is a **response header** that is **ONLY** available when the operation is completed successfully.
    *           If the operation did make changes and triggered an event (i.e. the aspect was actually deleted), the header value will be the eventId.
    *           Otherwise (i.e. no aspect was deleted), this header value will be "0".
    *
    * @apiSuccess (Success 200) {json} Response the aspect definition deletion result
    * @apiSuccessExample {json} Response:
    *   {
    *     "deleted": true
    *   }
    * @apiError (Error 409) {string} Response Returned when record aspect data still references the aspect; nothing is deleted.
    * @apiErrorExample {json} 409-Conflict:
    *   {
    *     "message": "Cannot delete the aspect definition: 3 record(s) still reference it. Delete the referencing record aspect data first."
    *   }
    * @apiUse GenericError
    */
  @Path("/{id}")
  @ApiOperation(
    value = "Delete an aspect definition by ID",
    nickname = "deleteById",
    httpMethod = "DELETE",
    response = classOf[DeleteResult],
    notes =
      "Deletes an aspect definition. The aspect definition can only be deleted when no record aspect data references it (within the tenant); otherwise a 409 response is returned and nothing is deleted."
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
        value = "ID of the aspect to be deleted."
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
        code = 409,
        message =
          "The aspect definition could not be deleted because record aspect data still references it.",
        response = classOf[ApiError]
      )
    )
  )
  def deleteById: Route = delete {
    path(Segment) { id: String =>
      requireUserId { userId =>
        requireAspectPermission(
          authClient,
          "object/aspect/delete",
          id,
          // when the aspect doesn't exist (or isn't accessible within the current tenant)
          // we check the "unconditional" delete permission so behaviour matches record delete:
          // a user with unconditional delete permission gets 200 + deleted=false;
          // others won't be able to learn whether the aspect existed.
          onAspectNotFound = Some(
            () =>
              requireUnconditionalAuthDecision(
                authClient,
                AuthDecisionReqConfig("object/aspect/delete")
              ) & pass
          )
        ) {
          requiresSpecifiedTenantId { tenantId =>
            onCompleteBlockingTask {
              val theResult = DB localTx { implicit session =>
                session.queryTimeout(this.defaultQueryTimeout)
                AspectPersistence.deleteById(id, tenantId, userId) match {
                  case Success(result) =>
                    complete(
                      StatusCodes.OK,
                      List(RawHeader("x-magda-event-id", result._2.toString)),
                      DeleteResult(result._1)
                    )
                  case Failure(e: AspectInUseException) =>
                    complete(
                      StatusCodes.Conflict,
                      ApiError(e.getMessage)
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

  override def route: Route =
    super.route ~
      putById ~
      patchById ~
      create ~
      deleteById
}
