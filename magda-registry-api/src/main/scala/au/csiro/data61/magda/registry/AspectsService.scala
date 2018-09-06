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
import akka.actor.ActorRef

class AspectsService(config: Config, authClient: AuthApiClient, webHookActor: ActorRef, system: ActorSystem, materializer: Materializer)
    extends AspectsServiceRO(config, authClient, system, materializer) {
  /**
   * @apiGroup Registry Aspects
   * @api {post} /v0/registry-auth/aspects Create a new aspect
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
  @ApiOperation(value = "Create a new aspect", nickname = "create", httpMethod = "POST", response = classOf[AspectDefinition])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "aspect", required = true, dataType = "au.csiro.data61.magda.model.Registry$AspectDefinition", paramType = "body", value = "The definition of the new aspect."),
    new ApiImplicitParam(name = "X-Magda-Session", required = true, dataType = "String", paramType = "header", value = "Magda internal session id")))
  def create = post {
    pathEnd {
      requireIsAdmin(authClient)(system, config) { _ =>
        entity(as[AspectDefinition]) { aspect =>
          val result = DB localTx { session =>
            AspectPersistence.create(session, aspect) match {
              case Success(result) =>
                complete(result)
              case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
            }
          }
          webHookActor ! WebHookActor.Process()
          result
        }
      }
    }
  }

  /**
   * @apiGroup Registry Aspects
   * @api {put} /v0/registry-auth/aspects/{id} Modify an aspect by ID
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
  @ApiOperation(value = "Modify an aspect by ID", nickname = "putById", httpMethod = "PUT", response = classOf[AspectDefinition],
    notes = "Modifies the aspect with a given ID.  If an aspect with the ID does not yet exist, it is created.")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the aspect to be saved."),
    new ApiImplicitParam(name = "aspect", required = true, dataType = "au.csiro.data61.magda.model.Registry$AspectDefinition", paramType = "body", value = "The aspect to save."),
    new ApiImplicitParam(name = "X-Magda-Session", required = true, dataType = "String", paramType = "header", value = "Magda internal session id")))
  def putById = put {
    path(Segment) { (id: String) =>
      {
        requireIsAdmin(authClient)(system, config) { _ =>
          entity(as[AspectDefinition]) { aspect =>
            val result = DB localTx { session =>
              AspectPersistence.putById(session, id, aspect) match {
                case Success(result) =>
                  complete(result)
                case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
              }
            }
            webHookActor ! WebHookActor.Process()
            result
          }
        }
      }
    }
  }

  /**
   * @apiGroup Registry Aspects
   * @api {patch} /v0/registry-auth/aspects/{id} Modify an aspect by applying a JSON Patch
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
  @ApiOperation(value = "Modify an aspect by applying a JSON Patch", nickname = "patchById", httpMethod = "PATCH", response = classOf[AspectDefinition],
    notes = "The patch should follow IETF RFC 6902 (https://tools.ietf.org/html/rfc6902).")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the aspect to be saved."),
    new ApiImplicitParam(name = "aspectPatch", required = true, dataType = "gnieh.diffson.JsonPatchSupport$JsonPatch", paramType = "body", value = "The RFC 6902 patch to apply to the aspect."),
    new ApiImplicitParam(name = "X-Magda-Session", required = true, dataType = "String", paramType = "header", value = "Magda internal session id")))
  def patchById = patch {
    path(Segment) { (id: String) =>
      {
        requireIsAdmin(authClient)(system, config) { _ =>
          entity(as[JsonPatch]) { aspectPatch =>
            val result = DB localTx { session =>
              AspectPersistence.patchById(session, id, aspectPatch) match {
                case Success(result) =>
                  complete(result)
                case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
              }
            }
            webHookActor ! WebHookActor.Process()
            result
          }
        }
      }
    }
  }

  override def route = super.route ~
    putById ~
    patchById ~
    create
}