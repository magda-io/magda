package au.csiro.data61.magda.registry

import javax.ws.rs.Path
import akka.actor.{ ActorRef, ActorSystem }
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.stream.Materializer
import akka.http.scaladsl.server.Directives._
import akka.pattern.ask
import scalikejdbc.DB
import akka.http.scaladsl.model.StatusCodes
import akka.util.Timeout
import io.swagger.annotations._
import au.csiro.data61.magda.model.Registry.{ WebHook, WebHookAcknowledgement, WebHookAcknowledgementResponse }
import au.csiro.data61.magda.directives.AuthDirectives.requireIsAdmin

import scala.util.{ Failure, Success }
import com.typesafe.config.Config
import au.csiro.data61.magda.client.AuthApiClient

import scala.concurrent.duration._
import scala.concurrent.Await

@Path("/hooks")
@io.swagger.annotations.Api(value = "web hooks", produces = "application/json")
class HooksService(config: Config, webHookActor: ActorRef, authClient: AuthApiClient, system: ActorSystem, materializer: Materializer) extends Protocols with SprayJsonSupport {

  /**
   * @apiGroup Registry Webhooks
   * @api {get} /v0/registry-auth/hooks Get a list of all web hooks
   *
   * @apiDescription Get a list of all web hooks
   * @apiHeader {string} X-Magda-Session Magda internal session id
   * @apiSuccess (Success 200) {json} Response a list of webhook records
   * @apiSuccessExample {json} Response:
   * [
   *  {
   *    "id": "string",
   *    "userId": {},
   *    "name": "string",
   *    "active": true,
   *    "lastEvent": {},
   *    "url": "string",
   *    "eventTypes": [
   *      "CreateRecord"
   *    ],
   *    "isWaitingForResponse": {},
   *    "config": {
   *      "aspects": [
   *        "string"
   *      ],
   *      "optionalAspects": [
   *        "string"
   *      ],
   *      "includeEvents": {},
   *      "includeRecords": {},
   *      "includeAspectDefinitions": {},
   *      "dereference": {}
   *    },
   *    "enabled": true,
   *    "lastRetryTime": "2018-08-29T07:04:15.711Z",
   *    "retryCount": 0,
   *    "isRunning": true,
   *    "isProcessing": true
   *  }
   *  ...
   * ]
   * @apiUse GenericError
   */
  @ApiOperation(value = "Get a list of all web hooks", nickname = "getAll", httpMethod = "GET", response = classOf[WebHook], responseContainer = "List")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "X-Magda-Session", required = true, dataType = "String", paramType = "header", value = "Magda internal session id")))
  def getAll = get {
    pathEnd {
      complete {
        val hooks = DB readOnly { session =>
          HookPersistence.getAll(session)
        }

        implicit val timeout = Timeout(30 seconds)

        hooks.map { hook =>
          val status = Await.result(webHookActor ? WebHookActor.GetStatus(hook.id.get), 30 seconds).asInstanceOf[WebHookActor.Status]
          hook.copy(
            isRunning = Some(!status.isProcessing.isEmpty),
            isProcessing = Some(status.isProcessing.getOrElse(false)))
        }
      }
    }
  }

  /**
   * @apiGroup Registry Webhooks
   * @api {post} /v0/registry-auth/hooks Create a new web hook
   *
   * @apiDescription Create a new web hook
   *
   * @apiHeader {string} X-Magda-Session Magda internal session id
   * @apiParam (body) {Object} webhook An object contains all webhook information
   * @apiParamExample {json} Request-Example
   *  {
   *    "id": "string",
   *    "userId": {},
   *    "name": "string",
   *    "active": true,
   *    "lastEvent": {},
   *    "url": "string",
   *    "eventTypes": [
   *      "CreateRecord"
   *    ],
   *    "isWaitingForResponse": {},
   *    "config": {
   *      "aspects": [
   *        "string"
   *      ],
   *      "optionalAspects": [
   *        "string"
   *      ],
   *      "includeEvents": {},
   *      "includeRecords": {},
   *      "includeAspectDefinitions": {},
   *      "dereference": {}
   *    },
   *    "enabled": true
   *  }
   *
   * @apiSuccess (Success 200) {json} Response the created webhook record
   * @apiSuccessExample {json} Response:
   *  {
   *    "id": "string",
   *    "userId": {},
   *    "name": "string",
   *    "active": true,
   *    "lastEvent": {},
   *    "url": "string",
   *    "eventTypes": [
   *      "CreateRecord"
   *    ],
   *    "isWaitingForResponse": {},
   *    "config": {
   *      "aspects": [
   *        "string"
   *      ],
   *      "optionalAspects": [
   *        "string"
   *      ],
   *      "includeEvents": {},
   *      "includeRecords": {},
   *      "includeAspectDefinitions": {},
   *      "dereference": {}
   *    },
   *    "enabled": true,
   *    "lastRetryTime": "2018-08-29T07:04:15.711Z",
   *    "retryCount": 0,
   *    "isRunning": true,
   *    "isProcessing": true
   *  }
   * @apiUse GenericError
   */
  @ApiOperation(value = "Create a new web hook", nickname = "create", httpMethod = "POST", response = classOf[WebHook])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "hook", required = true, dataType = "au.csiro.data61.magda.model.Registry$WebHook", paramType = "body", value = "The definition of the new web hook."),
    new ApiImplicitParam(name = "X-Magda-Session", required = true, dataType = "String", paramType = "header", value = "Magda internal session id")))
  def create = post {
    pathEnd {
      entity(as[WebHook]) { hook =>
        val result = DB localTx { session =>
          HookPersistence.create(session, hook) match {
            case Success(result) =>
              complete(result)
            case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
          }
        }
        webHookActor ! WebHookActor.InvalidateWebhookCache
        result
      }
    }
  }

  /**
   * @apiGroup Registry Webhooks
   * @api {get} /v0/registry-auth/hooks/{id} Get a web hook by ID
   *
   * @apiDescription Get a web hook by ID
   * @apiHeader {string} X-Magda-Session Magda internal session id
   * @apiParam (path) {string} id ID of the web hook to be fetched.
   * @apiSuccess (Success 200) {json} Response the webhook record
   * @apiSuccessExample {json} Response:
   *  {
   *    "id": "string",
   *    "userId": {},
   *    "name": "string",
   *    "active": true,
   *    "lastEvent": {},
   *    "url": "string",
   *    "eventTypes": [
   *      "CreateRecord"
   *    ],
   *    "isWaitingForResponse": {},
   *    "config": {
   *      "aspects": [
   *        "string"
   *      ],
   *      "optionalAspects": [
   *        "string"
   *      ],
   *      "includeEvents": {},
   *      "includeRecords": {},
   *      "includeAspectDefinitions": {},
   *      "dereference": {}
   *    },
   *    "enabled": true,
   *    "lastRetryTime": "2018-08-29T07:04:15.711Z",
   *    "retryCount": 0,
   *    "isRunning": true,
   *    "isProcessing": true
   *  }
   * @apiUse GenericError
   */
  @Path("/{id}")
  @ApiOperation(value = "Get a web hook by ID", nickname = "getById", httpMethod = "GET", response = classOf[WebHook])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the web hook to be fetched."),
    new ApiImplicitParam(name = "X-Magda-Session", required = true, dataType = "String", paramType = "header", value = "Magda internal session id")))
  def getById = get {
    path(Segment) { (id: String) =>
      {
        DB readOnly { session =>
          HookPersistence.getById(session, id)
        } match {
          case Some(hook) =>
            implicit val timeout = Timeout(30 seconds)

            val status = Await.result(webHookActor ? WebHookActor.GetStatus(hook.id.get), 30 seconds).asInstanceOf[WebHookActor.Status]

            complete(hook.copy(
              isRunning = Some(!status.isProcessing.isEmpty),
              isProcessing = Some(status.isProcessing.getOrElse(false))))

          case None => complete(StatusCodes.NotFound, BadRequest("No web hook exists with that ID."))
        }
      }
    }
  }

  /**
   * @apiGroup Registry Webhooks
   * @api {put} /v0/registry-auth/hooks/{id} Modify a web hook by ID
   *
   * @apiDescription Modifies the web hook with a given ID. If a web hook with the ID does not yet exist, it is created.
   *
   * @apiHeader {string} X-Magda-Session Magda internal session id
   * @apiParam (path) {string} id ID of the web hook to be fetched.
   * @apiParam (body) {Object} webhook The web hook to save.
   * @apiParamExample {json} Request-Example
   *  {
   *    "id": "string",
   *    "userId": {},
   *    "name": "string",
   *    "active": true,
   *    "url": "string",
   *    "config": {
   *      "aspects": [
   *        "string"
   *      ],
   *      "optionalAspects": [
   *        "string"
   *      ],
   *      "includeEvents": {},
   *      "includeRecords": {},
   *      "includeAspectDefinitions": {},
   *      "dereference": {}
   *    },
   *    "enabled": true
   *  }
   * @apiSuccess (Success 200) {json} Response the modified webhook record
   * @apiSuccessExample {json} Response:
   *  {
   *    "id": "string",
   *    "userId": {},
   *    "name": "string",
   *    "active": true,
   *    "lastEvent": {},
   *    "url": "string",
   *    "eventTypes": [
   *      "CreateRecord"
   *    ],
   *    "isWaitingForResponse": {},
   *    "config": {
   *      "aspects": [
   *        "string"
   *      ],
   *      "optionalAspects": [
   *        "string"
   *      ],
   *      "includeEvents": {},
   *      "includeRecords": {},
   *      "includeAspectDefinitions": {},
   *      "dereference": {}
   *    },
   *    "enabled": true,
   *    "lastRetryTime": "2018-08-29T07:04:15.711Z",
   *    "retryCount": 0,
   *    "isRunning": true,
   *    "isProcessing": true
   *  }
   * @apiUse GenericError
   */
  @Path("/{id}")
  @ApiOperation(value = "Modify a web hook by ID", nickname = "putById", httpMethod = "PUT", response = classOf[WebHook],
    notes = "Modifies the web hook with a given ID.  If a web hook with the ID does not yet exist, it is created.")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the aspect to be saved."),
    new ApiImplicitParam(name = "hook", required = true, dataType = "au.csiro.data61.magda.model.Registry$WebHook", paramType = "body", value = "The web hook to save."),
    new ApiImplicitParam(name = "X-Magda-Session", required = true, dataType = "String", paramType = "header", value = "Magda internal session id")))
  def putById = put {
    path(Segment) { (id: String) =>
      {
        entity(as[WebHook]) { hook =>
          val result = DB localTx { session =>
            HookPersistence.putById(session, id, hook) match {
              case Success(result) =>
                complete(result)
              case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
            }
          }
          webHookActor ! WebHookActor.InvalidateWebhookCache
          result
        }
      }
    }
  }

  /**
   * @apiGroup Registry Webhooks
   * @api {delete} /v0/registry-auth/hooks/{id} Delete a web hook
   *
   * @apiDescription Delete a web hook
   *
   * @apiHeader {string} X-Magda-Session Magda internal session id
   * @apiParam (path) {string} id ID of the web hook to delete.
   *
   * @apiSuccess (Success 200) {json} Response deletion result
   * @apiSuccessExample {json} Response:
   *  {
   *    "deleted": true
   *  }
   * @apiError (Error 400) {json} Response could not delete
   * @apiUse GenericError
   */
  @Path("/{hookId}")
  @ApiOperation(value = "Delete a web hook", nickname = "deleteById", httpMethod = "DELETE", response = classOf[DeleteResult])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "hookId", required = true, dataType = "string", paramType = "path", value = "ID of the web hook to delete."),
    new ApiImplicitParam(name = "X-Magda-Session", required = true, dataType = "String", paramType = "header", value = "Magda internal session id")))
  @ApiResponses(Array(
    new ApiResponse(code = 400, message = "The web hook could not be deleted.", response = classOf[BadRequest])))
  def deleteById = delete {
    path(Segment) { (hookId: String) =>
      {
        val result = DB localTx { session =>
          HookPersistence.delete(session, hookId) match {
            case Success(result) =>
              complete(DeleteResult(result))
            case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
          }
        }
        webHookActor ! WebHookActor.InvalidateWebhookCache
        result
      }
    }
  }

  /**
   * @apiGroup Registry Webhooks
   * @api {post} /v0/registry-auth/hooks/{id}/ack Acknowledge a previously-deferred web hook
   *
   * @apiDescription Acknowledges a previously-deferred web hook with a given ID. Acknowledging a previously-POSTed web hook will cause the next, if any, to be sent.
   *
   * @apiHeader {string} X-Magda-Session Magda internal session id
   * @apiParam (path) {string} id ID of the web hook to be acknowledged.
   *
   * @apiSuccess (Success 200) {json} Response The details of the acknowledgement.
   * @apiSuccessExample {json} Response:
   *  {
   *    "lastEventIdReceived": 0
   *  }
   * @apiUse GenericError
   */
  @Path("/{id}/ack")
  @ApiOperation(value = "Acknowledge a previously-deferred web hook", nickname = "ack", httpMethod = "POST", response = classOf[WebHookAcknowledgementResponse],
    notes = "Acknowledges a previously-deferred web hook with a given ID.  Acknowledging a previously-POSTed web hook will cause the next, if any, to be sent.")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the web hook to be acknowledged."),
    new ApiImplicitParam(name = "acknowledgement", required = true, dataType = "au.csiro.data61.magda.model.Registry$WebHookAcknowledgement", paramType = "body", value = "The details of the acknowledgement."),
    new ApiImplicitParam(name = "X-Magda-Session", required = true, dataType = "String", paramType = "header", value = "Magda internal session id")))
  def ack = post {
    path(Segment / "ack") { (id: String) =>
      entity(as[WebHookAcknowledgement]) { acknowledgement =>
        val result = DB localTx { session =>
          HookPersistence.acknowledgeRaisedHook(session, id, acknowledgement) match {
            case Success(result)    => complete(result)
            case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
          }
        }
        webHookActor ! WebHookActor.InvalidateWebhookCache
        webHookActor ! WebHookActor.Process(webHookId = Some(id))
        result
      }
    }
  }

  def route =
    requireIsAdmin(authClient)(system, config) { _ =>
      getAll ~
        create ~
        getById ~
        putById ~
        deleteById ~
        ack
    }
}
