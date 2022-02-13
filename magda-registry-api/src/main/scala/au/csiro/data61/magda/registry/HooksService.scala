package au.csiro.data61.magda.registry

import javax.ws.rs.Path
import akka.actor.{ActorRef, ActorSystem}
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.stream.Materializer
import akka.http.scaladsl.server.Directives._
import akka.pattern.ask
import scalikejdbc.DB
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.Route
import akka.util.Timeout
import io.swagger.annotations._
import au.csiro.data61.magda.model.Registry.{
  WebHook,
  WebHookAcknowledgement,
  WebHookAcknowledgementResponse
}

import scala.util.{Failure, Success}
import com.typesafe.config.Config
import au.csiro.data61.magda.client.{AuthApiClient, AuthDecisionReqConfig}
import au.csiro.data61.magda.directives.AuthDirectives.{
  requirePermission,
  requireUnconditionalAuthDecision,
  requireUserId,
  withAuthDecision
}
import au.csiro.data61.magda.registry.Directives.{
  requireWebhookPermission,
  requireWebhookUpdateOrCreateWhenNonExistPermission
}
import org.postgresql.util.PSQLException
import spray.json.JsObject

import scala.concurrent.duration._
import scala.concurrent.Await

@Path("/hooks")
@io.swagger.annotations.Api(value = "web hooks", produces = "application/json")
class HooksService(
    config: Config,
    webHookActor: ActorRef,
    authClient: AuthApiClient,
    system: ActorSystem,
    materializer: Materializer,
    authApiClient: RegistryAuthApiClient
) extends Protocols
    with SprayJsonSupport {

  /**
    * @apiGroup Registry Webhooks
    * @api {get} /v0/registry/hooks Get a list of all web hooks
    *
    * @apiDescription Get a list of all web hooks
    * @apiHeader {string} X-Magda-Session Magda internal session id (JWT Token)
    * @apiSuccess (Success 200) {json} Response a list of webhook records
    * @apiSuccessExample {json} Response:
    * [
    *  {
    *    "id": "string",
    *    "name": "string",
    *    "active": true,
    *    "lastEvent": 1232312,
    *    "url": "string",
    *    "eventTypes": [
    *       "CreateRecord"
    *    ],
    *    "isWaitingForResponse": false,
    *    "config": {
    *      "aspects": [
    *        "string"
    *      ],
    *      "optionalAspects": [
    *        "string"
    *      ],
    *      "includeEvents": false,
    *      "includeRecords": true,
    *      "includeAspectDefinitions": false,
    *      "dereference": true
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
  @ApiOperation(
    value = "Get a list of all web hooks",
    nickname = "getAll",
    httpMethod = "GET",
    response = classOf[WebHook],
    responseContainer = "List"
  )
  @ApiImplicitParams(
    Array(
      new ApiImplicitParam(
        name = "X-Magda-Session",
        required = true,
        dataType = "String",
        paramType = "header",
        value = "Magda internal session id"
      )
    )
  )
  def getAll = get {
    pathEnd {
      withAuthDecision(
        authApiClient,
        AuthDecisionReqConfig("object/webhook/read")
      ) { authDecision =>
        complete {
          val hooks = DB readOnly { implicit session =>
            HookPersistence.getAll(authDecision)
          }

          implicit val timeout = Timeout(30 seconds)

          hooks.map { hook =>
            val status = Await
              .result(
                webHookActor ? WebHookActor.GetStatus(hook.id.get),
                30 seconds
              )
              .asInstanceOf[WebHookActor.Status]
            hook.copy(
              isRunning = Some(!status.isProcessing.isEmpty),
              isProcessing = Some(status.isProcessing.getOrElse(false))
            )
          }
        }
      }
    }
  }

  /**
    * @apiGroup Registry Webhooks
    * @api {post} http://some-remote-host/webhook-notification-recipient-endpoint Webhook Notification Recipient Endpoint
    *
    * @apiDescription Once a remote host register an endpoint `url` as webhook via Registry `Create a new web hook` API (see the API doc in this section),
    *   registry will send notifications as HTTP POST request when any new events are generated in the system. This section specify
    *   the expected notifcation request payload from registry and possible responses from the `Webhook Notification Recipient`.
    *
    * @apiParam (Request Body JSON) {String="records.changed"} action The webhook action. Currently, will always be fixed string "records.changed".
    * @apiParam (Request Body JSON) {Number} lastEventId the id of last event included in this notification.
    * @apiParam (Request Body JSON) {Object[]} [events] A array of raw events. Only available when webhook config `includeEvents` field is set to `true` when create webhook.
    * @apiParam (Request Body JSON) {Number} events.id The id of the event.
    * @apiParam (Request Body JSON) {String} events.eventTime The time stamp of the event. e.g. `2018-01-16T09:01:40.776Z`
    * @apiParam (Request Body JSON) {String="CreateRecord", "CreateAspectDefinition", "CreateRecordAspect", "PatchRecord", "PatchAspectDefinition", "PatchRecordAspect", "DeleteRecord", "DeleteAspectDefinition", "DeleteRecordAspect"} events.eventType The type of the event.
    * @apiParam (Request Body JSON) {String} [events.userId] The id of the user whose action triggered the event.
    * @apiParam (Request Body JSON) {Object} events.data The event data. The type of event data depends on event type.
    *   Generally, if it's a "Create" type event, the data will be the data of the record or aspect.
    *   If it's a "Patch" (i.e. Update) type event, the data will be [jsonpatch](http://jsonpatch.com/) format to specify the changes.
    *   If it's a "Delete" type event, the data will be id of the record (or aspect) to be impacted.
    * @apiParam (Request Body JSON) {Number} events.tenantId The tenant id of the event. Unless multi-tenant feature is turned on, the value of this field will always be `0`.
    * @apiParam (Request Body JSON) {Object[]} [records] A array of relevant records. Only available when webhook config `includeRecords` field is set to `true` when create webhook.
    * @apiParam (Request Body JSON) {String} records.id The id of the record.
    * @apiParam (Request Body JSON) {String} records.name The name of the record.
    * @apiParam (Request Body JSON) {Object} records.aspects An object contains the record's aspects data. The keys of the object will be IDs of aspects.
    * @apiParam (Request Body JSON) {String} records.sourceTag A tag representing the action by the source of this record. (e.g. an id for a individual crawl of a data portal).
    * @apiParam (Request Body JSON) {String} records.tenantId The tenant id of the event. Unless multi-tenant feature is turned on, the value of this field will always be `0`.
    * @apiParam (Request Body JSON) {Object[]} [aspectDefinitions] A array of relevant aspect definitions. Only available when webhook config `includeAspectDefinitions` field is set to `true` when create webhook.
    * @apiParam (Request Body JSON) {String} aspectDefinitions.id The ID of the aspect.
    * @apiParam (Request Body JSON) {String} aspectDefinitions.name The name of the aspect.
    * @apiParam (Request Body JSON) {Object} aspectDefinitions.jsonSchema JSON schema that used to validate aspect data.
    * @apiParam (Request Body JSON) {String} deferredResponseUrl An URL that can be used by `Webhook Notification Recipient` to acknowledge the completion of notification processing at later time.
    *   If the `Webhook Notification Recipient` decides to do so, he needs to respond `201` status code and JSON data `{status: "Working", deferResponse: true}` to defer the response.
    *   Also see `Acknowledge a previously-deferred web hook` API in this section.
    *
    * @apiParamExample {json} Webhook Notification Payload Example
    *  {
    *    "action": "records.changed",
    *    "lastEventId": 1234443,
    *    "events": [{
    *      "data": {
    *        "aspectId": "ckan-resource",
    *        "patch": [{
    *          "op": "remove",
    *          "path": "/webstore_last_updated"
    *        },
    *        {
    *          "op": "remove",
    *          "path": "/webstore_url"
    *        }],
    *        "recordId": "dist-dga-0ca78178-7482-486f-ae85-9cd97c7c97c9"
    *      },
    *      "eventTime": "2018-06-16T04:08:57.044Z",
    *      "eventType": "PatchRecordAspect",
    *      "id": 8940964,
    *      "tenantId": 0
    *    }],
    *    "records": [{
    *      "id": "dist-dga-0ca78178-7482-486f-ae85-9cd97c7c97c9",
    *      "name": "a test dataset",
    *      "aspects": {
    *        "aspect-one": {...},
    *        "aspect-two": {...}
    *      },
    *      "sourceTag": "sds-sdssd-sdsddssd",
    *      "tenantId": 0
    *    }],
    *    "deferredResponseUrl": "http://xxx",
    *  }
    *
    * @apiSuccess (Success 201 JSON Response Body) {String="Working","Received"} status A status string indicates the notification processing result.
    *   When `status`=`Working`, `deferResponse` must set to `true` --- indicates that `Webhook Notification Recipient` want to defer the reponse of the notification processing.
    *   Otherwise, the `Webhook Notification Recipient` should respond `status`=`Received`, `deferResponse`= `false`.
        Once the `Webhook Notification Recipient` finish the notification process, he will need to call `Acknowledge a previously-deferred web hook` API (see in this section) in order to receive next notification.
    * @apiSuccess (Success 201 JSON Response Body) {Boolean} deferResponse Indicate whether `Webhook Notification Recipient` want to defer the reponse of the notification processing.
    * @apiSuccessExample {json} Response Without Defer
    *   {
    *     "status": "Received",
    *     "deferResponse": false
    *   }
    *
    * @apiError (Error 500 JSON Response Body) {String="Error"} status A status string indicates the notification processing result.
    *   As it's an error response, its value should always be "Error".
    * @apiError (Error 500 JSON Response Body) {Boolean} deferResponse Indicate whether `Webhook Notification Recipient` want to defer the reponse of the notification processing.
    *   As it's an error response, its value should always be `false`.
    * @apiErrorExample {json} Error Response
    *   {
    *     "status": "Error",
    *     "deferResponse": false
    *   }
    */

  /**
    * @apiGroup Registry Webhooks
    * @api {post} /v0/registry/hooks Create a new web hook
    *
    * @apiDescription Create a new web hook. Please note: newly created webhook will be set to receive notification after most recent events at the time when the webhook is created,
    *   rather than from the first event. Thus, the `lastEvent` field in the response will unlikely be the first event ID.
    *
    * @apiHeader {string} X-Magda-Session Magda internal session id (JWT Token)
    * @apiParam (Request Body JSON) {String} [id] The ID of the webhook to be created. The ID string must be unique across the system.
    *   If no ID is provided, an UUID will be auto-created.
    * @apiParam (Request Body JSON) {String} name The name of the webhook to be created.
    * @apiParam (Request Body JSON) {Boolean} active Whether set the webhook to be an active one.
    *   Please note: registry will try periodically wake all inactive webhook.
    *   If you want to stop the webhook from working forever, please set the `enabled` field to `false`
    * @apiParam (Request Body JSON) {Boolean} enabled Whether enable the webhook. A disabled webhook will never run.
    * @apiParam (Request Body JSON) {String} url specify a HTTP url where registry should send notifications to.
    * @apiParam (Request Body JSON) {Object} config A webhook config object. Fields see below:
    * @apiParam (Request Body JSON) {Boolean} [config.includeEvents] Whether include raw events in the webhook notification payload.
    *   See sample webhook notification payload below.
    * @apiParam (Request Body JSON) {Boolean} [config.includeRecords] Whether include relevant records in the webhook notification payload.
    *   See sample webhook notification payload below.
    * @apiParam (Request Body JSON) {Boolean} [config.includeAspectDefinitions] Whether include relevant aspect definitions in the webhook notification payload.
    *   See sample webhook notification payload below.
    * @apiParam (Request Body JSON) {Boolean} [config.dereference] When `includeRecords` = `true`, set `dereference`=`true` will make registry automatically dereference links to other records
    *   when attach relevent records to webhook notification payload.
    * @apiParam (Request Body JSON) {String[]} [config.aspects] When `includeRecords` = `true`, registry will only include records whose aspects have been impacted by the event
    *   according to the aspects list provided here in the webhook notification payload.
    * @apiParam (Request Body JSON) {String[]} [config.optionalAspects] When `includeRecords` = `true`, registry will also include additional (optional) aspect data in the relevant record data
    *   in the webhook notification payload.
    * @apiParam (Request Body JSON) {Number[]} eventTypes specify a list of event types that the webhook's interested in. Possible values are:
    *   <ul>
    *     <li>`0`: "CreateRecord"</li>
    *     <li>`1`: "CreateAspectDefinition"</li>
    *     <li>`2`: "CreateRecordAspect"</li>
    *     <li>`3`: "PatchRecord"</li>
    *     <li>`4`: "PatchAspectDefinition"</li>
    *     <li>`5`: "PatchRecordAspect"</li>
    *     <li>`6`: "DeleteRecord"</li>
    *     <li>`7`: "DeleteAspectDefinition"</li>
    *     <li>`8`: "DeleteRecordAspect"</li>
    *   </ul>
    *   If you are not interested in the raw events in the webhook notification payload (e.g. you set `webhook.config.includeEvents`=`false` to turn it off), you can supply empty array [] here.
    *
    * @apiParamExample {json} Create WebHook Request Body Example
    *  {
    *    "id": "string",
    *    "name": "string",
    *    "active": true,
    *    "url": "string",
    *    "eventTypes": [
    *      0
    *    ],
    *    "config": {
    *      "aspects": [
    *        "string"
    *      ],
    *      "optionalAspects": [
    *        "string"
    *      ],
    *      "includeEvents": false,
    *      "includeRecords": true,
    *      "includeAspectDefinitions": false,
    *      "dereference": true
    *    },
    *    "enabled": true
    *  }
    *
    * @apiSuccess (Success 200) {json} ResponseBody the JSON response body will be the created webhook record in JSON format.
    * @apiSuccessExample {json} Successful Create WebHook Request Response
    *  {
    *    "id": "string",
    *    "name": "string",
    *    "active": true,
    *    "lastEvent": 1232312,
    *    "url": "string",
    *    "eventTypes": [
    *       "CreateRecord"
    *    ],
    *    "isWaitingForResponse": false,
    *    "config": {
    *      "aspects": [
    *        "string"
    *      ],
    *      "optionalAspects": [
    *        "string"
    *      ],
    *      "includeEvents": false,
    *      "includeRecords": true,
    *      "includeAspectDefinitions": false,
    *      "dereference": true
    *    },
    *    "enabled": true,
    *    "lastRetryTime": "2018-08-29T07:04:15.711Z",
    *    "retryCount": 0,
    *    "isRunning": true,
    *    "isProcessing": true
    *  }
    * @apiUse GenericError
    */
  @ApiOperation(
    value = "Create a new web hook",
    nickname = "create",
    httpMethod = "POST",
    response = classOf[WebHook]
  )
  @ApiImplicitParams(
    Array(
      new ApiImplicitParam(
        name = "hook",
        required = true,
        dataType = "au.csiro.data61.magda.model.Registry$WebHook",
        paramType = "body",
        value = "The definition of the new web hook."
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
  def create = post {
    pathEnd {
      requireUserId { userId =>
        entity(as[WebHook]) { hook =>
          requirePermission(
            authApiClient,
            "object/webhook/create",
            input = Some(
              JsObject(
                "object" -> JsObject(
                  "webhook" -> hook.toJson
                )
              )
            )
          ) {
            val result = DB localTx { implicit session =>
              HookPersistence.create(hook, Some(userId)) match {
                case Success(theResult) => complete(theResult)
                case Failure(e: PSQLException) if e.getSQLState == "23505" =>
                  complete(
                    StatusCodes.BadRequest,
                    ApiError(s"Duplicated webhook id supplied: ${hook.id}")
                  )
                case Failure(exception) =>
                  complete(
                    StatusCodes.BadRequest,
                    ApiError(exception.getMessage)
                  )
              }
            }
            webHookActor ! WebHookActor.InvalidateWebHookCacheThenProcess()
            result
          }
        }
      }
    }
  }

  /**
    * @apiGroup Registry Webhooks
    * @api {get} /v0/registry/hooks/{id} Get a web hook by ID
    *
    * @apiDescription Get a web hook by ID
    * @apiHeader {string} X-Magda-Session Magda internal session id (JWT Token)
    * @apiParam (path) {string} id ID of the web hook to be fetched.
    * @apiSuccess (Success 200) {json} Response the webhook record
    * @apiSuccessExample {json} Response:
    *  {
    *    "id": "string",
    *    "name": "string",
    *    "active": true,
    *    "lastEvent": 1232312,
    *    "url": "string",
    *    "eventTypes": [
    *       "CreateRecord"
    *    ],
    *    "isWaitingForResponse": false,
    *    "config": {
    *      "aspects": [
    *        "string"
    *      ],
    *      "optionalAspects": [
    *        "string"
    *      ],
    *      "includeEvents": false,
    *      "includeRecords": true,
    *      "includeAspectDefinitions": false,
    *      "dereference": true
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
  @ApiOperation(
    value = "Get a web hook by ID",
    nickname = "getById",
    httpMethod = "GET",
    response = classOf[WebHook]
  )
  @ApiImplicitParams(
    Array(
      new ApiImplicitParam(
        name = "id",
        required = true,
        dataType = "string",
        paramType = "path",
        value = "ID of the web hook to be fetched."
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
  def getById = get {
    path(Segment) { (id: String) =>
      withAuthDecision(
        authApiClient,
        AuthDecisionReqConfig("object/webhook/read")
      ) { authDecision =>
        DB readOnly { implicit session =>
          HookPersistence.getById(id, authDecision)
        } match {
          case Some(hook) =>
            implicit val timeout = Timeout(30 seconds)

            val status = Await
              .result(
                webHookActor ? WebHookActor.GetStatus(hook.id.get),
                30 seconds
              )
              .asInstanceOf[WebHookActor.Status]

            complete(
              hook.copy(
                isRunning = Some(!status.isProcessing.isEmpty),
                isProcessing = Some(status.isProcessing.getOrElse(false))
              )
            )

          case None =>
            complete(
              StatusCodes.NotFound,
              ApiError("No web hook exists with that ID.")
            )
        }
      }
    }
  }

  /**
    * @apiGroup Registry Webhooks
    * @api {put} /v0/registry/hooks/{id} Modify a web hook by ID
    *
    * @apiDescription Modifies the web hook with a given ID. If a web hook with the ID does not yet exist, it is created.
    *
    * @apiHeader {string} X-Magda-Session Magda internal session id (JWT Token)
    * @apiParam (path) {string} id ID of the web hook to be fetched.
    * @apiParam (Request Body JSON) {String} [id] The ID of the webhook to be created. The ID string must be unique across the system.
    *   If no ID is provided, an UUID will be auto-created.
    * @apiParam (Request Body JSON) {String} name The name of the webhook to be created.
    * @apiParam (Request Body JSON) {Boolean} active Whether set the webhook to be an active one.
    *   Please note: registry will try periodically wake all inactive webhook.
    *   If you want to stop the webhook from working forever, please set the `enabled` field to `false`
    * @apiParam (Request Body JSON) {Boolean} enabled Whether enable the webhook. A disabled webhook will never run.
    * @apiParam (Request Body JSON) {String} url specify a HTTP url where registry should send notifications to.
    * @apiParam (Request Body JSON) {Object} config A webhook config object. Fields see below:
    * @apiParam (Request Body JSON) {Boolean} [config.includeEvents] Whether include raw events in the webhook notification payload.
    *   See sample webhook notification payload below.
    * @apiParam (Request Body JSON) {Boolean} [config.includeRecords] Whether include relevant records in the webhook notification payload.
    *   See sample webhook notification payload below.
    * @apiParam (Request Body JSON) {Boolean} [config.includeAspectDefinitions] Whether include relevant aspect definitions in the webhook notification payload.
    *   See sample webhook notification payload below.
    * @apiParam (Request Body JSON) {Boolean} [config.dereference] When `includeRecords` = `true`, set `dereference`=`true` will make registry automatically dereference links to other records
    *   when attach relevent records to webhook notification payload.
    * @apiParam (Request Body JSON) {String[]} [config.aspects] When `includeRecords` = `true`, registry will only include records whose aspects have been impacted by the event
    *   according to the aspects list provided here in the webhook notification payload.
    * @apiParam (Request Body JSON) {String[]} [config.optionalAspects] When `includeRecords` = `true`, registry will also include additional (optional) aspect data in the relevant record data
    *   in the webhook notification payload.
    * @apiParam (Request Body JSON) {Number[]} eventTypes specify a list of event types that the webhook's interested in. Possible values are:
    *   <ul>
    *     <li>`0`: "CreateRecord"</li>
    *     <li>`1`: "CreateAspectDefinition"</li>
    *     <li>`2`: "CreateRecordAspect"</li>
    *     <li>`3`: "PatchRecord"</li>
    *     <li>`4`: "PatchAspectDefinition"</li>
    *     <li>`5`: "PatchRecordAspect"</li>
    *     <li>`6`: "DeleteRecord"</li>
    *     <li>`7`: "DeleteAspectDefinition"</li>
    *     <li>`8`: "DeleteRecordAspect"</li>
    *   </ul>
    *   If you are not interested in the raw events in the webhook notification payload (e.g. you set `webhook.config.includeEvents`=`false` to turn it off), you can supply empty array [] here.
    *
    * @apiParamExample {json} Modify WebHook Request Body Example
    *  {
    *    "id": "string",
    *    "name": "string",
    *    "active": true,
    *    "url": "string",
    *    "eventTypes": [
    *      0
    *    ],
    *    "config": {
    *      "aspects": [
    *        "string"
    *      ],
    *      "optionalAspects": [
    *        "string"
    *      ],
    *      "includeEvents": false,
    *      "includeRecords": true,
    *      "includeAspectDefinitions": false,
    *      "dereference": true
    *    },
    *    "enabled": true
    *  }
    *
    * @apiSuccess (Success 200) {json} ResponseBody the JSON response body will be the modified webhook record in JSON format
    * @apiSuccessExample {json} Successful Modify WebHook Request Response
    *  {
    *    "id": "string",
    *    "name": "string",
    *    "active": true,
    *    "lastEvent": 1232312,
    *    "url": "string",
    *    "eventTypes": [
    *       "CreateRecord"
    *    ],
    *    "isWaitingForResponse": false,
    *    "config": {
    *      "aspects": [
    *        "string"
    *      ],
    *      "optionalAspects": [
    *        "string"
    *      ],
    *      "includeEvents": false,
    *      "includeRecords": true,
    *      "includeAspectDefinitions": false,
    *      "dereference": true
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
  @ApiOperation(
    value = "Modify a web hook by ID",
    nickname = "putById",
    httpMethod = "PUT",
    response = classOf[WebHook],
    notes =
      "Modifies the web hook with a given ID.  If a web hook with the ID does not yet exist, it is created."
  )
  @ApiImplicitParams(
    Array(
      new ApiImplicitParam(
        name = "id",
        required = true,
        dataType = "string",
        paramType = "path",
        value = "ID of the aspect to be saved."
      ),
      new ApiImplicitParam(
        name = "hook",
        required = true,
        dataType = "au.csiro.data61.magda.model.Registry$WebHook",
        paramType = "body",
        value = "The web hook to save."
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
        entity(as[WebHook]) { hook =>
          requireWebhookUpdateOrCreateWhenNonExistPermission(
            authClient,
            id,
            hook
          ) {
            val result = DB localTx { implicit session =>
              HookPersistence.putById(id, hook, Some(userId)) match {
                case Success(theResult) => complete(theResult)
                case Failure(exception) =>
                  complete(
                    StatusCodes.BadRequest,
                    ApiError(exception.getMessage)
                  )
              }
            }

            // The current restart logic for a subscriber has two steps:
            // 1) It will first update its web hook in the registry by making a PUT request
            //    to the registry, which is handled by putById function (this function) of this class.
            //    By sending message WebHookActor.InvalidateWebhookCache to the WebHookActor, it will
            //    not trigger any event processing.
            // 2) The subscriber will then make a POST request to the endpoint hooks/{hookid}/ack,
            //    which will be handled by the ack function of this class. However, the act function
            //    will send message WebHookActor.InvalidateWebHookCacheThenProcess(webHookId = Some(id))
            //    to the WebHookActor, which may trigger event processing.
            //
            // TODO: If the following message WebHookActor.InvalidateWebhookCache is replaced by
            // WebHookActor.InvalidateWebHookCacheThenProcess(webHookId = Some(id)), a subscriber
            // restart logic can be simplified: The above step 2) can be removed.
            // However, if replacing the message without changing a subscriber's restart logic, it
            // may trigger duplicate event processing.
            webHookActor ! WebHookActor.InvalidateWebhookCache
            result
          }
        }
      }
    }
  }

  /**
    * @apiGroup Registry Webhooks
    * @api {delete} /v0/registry/hooks/{id} Delete a web hook
    *
    * @apiDescription Delete a web hook
    *
    * @apiHeader {string} X-Magda-Session Magda internal session id (JWT Token)
    * @apiParam (path) {string} id ID of the web hook to delete.
    *
    * @apiSuccess (Success 200 JSON Response Body) {Boolean} deleted indicates deletion result.
    * @apiSuccessExample {json} Response:
    *  {
    *    "deleted": true
    *  }
    * @apiError (Error 400 Text Response Body) {text} Response could not delete
    * @apiUse GenericError
    */
  @Path("/{hookId}")
  @ApiOperation(
    value = "Delete a web hook",
    nickname = "deleteById",
    httpMethod = "DELETE",
    response = classOf[DeleteResult]
  )
  @ApiImplicitParams(
    Array(
      new ApiImplicitParam(
        name = "hookId",
        required = true,
        dataType = "string",
        paramType = "path",
        value = "ID of the web hook to delete."
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
        message = "The web hook could not be deleted.",
        response = classOf[ApiError]
      )
    )
  )
  def deleteById = delete {
    path(Segment) { (hookId: String) =>
      requireWebhookPermission(
        authClient,
        "object/webhook/delete",
        hookId,
        onRecordNotFound = Some(() => {
          // when record not found, only user has unconditional permission can confirm the hook is deleted
          requireUnconditionalAuthDecision(
            authClient,
            AuthDecisionReqConfig("object/webhook/delete")
          ) & pass
        })
      ) {
        val result = DB localTx { implicit session =>
          HookPersistence.delete(hookId) match {
            case Success(result) =>
              complete(DeleteResult(result))
            case Failure(exception) =>
              complete(StatusCodes.BadRequest, ApiError(exception.getMessage))
          }
        }
        webHookActor ! WebHookActor.InvalidateWebhookCache
        result
      }
    }
  }

  /**
    * @apiGroup Registry Webhooks
    * @api {post} /v0/registry/hooks/{id}/ack Acknowledge a previously-deferred web hook
    *
    * @apiDescription Acknowledges a previously-deferred web hook with a given ID. Acknowledging a previously-POSTed web hook notificaiton will cause the next, if any, to be sent.
    *   `Webhook Notification Recipient` only need to request this endpoint when he previously deferred the response for a web hook notificaiton.
    *
    * @apiHeader {String} X-Magda-Session Magda internal session id (JWT Token)
    * @apiParam (path) {String} id the ID of the web hook to be acknowledged.
    *
    * @apiParam (Request Body JSON) {Boolean} succeeded Whether the web hook notification was processed successfully and the `Webhook Notification Recipient` is ready for further notifications.
    *   `false` indicates the web hook notification was processed unsuccessfully, the same notification will be repeated.
    * @apiParam (Request Body JSON) {Number} [lastEventIdReceived] The ID of the last event received by the `Webhook Notification Recipient`.
    *   This should be the value of the `lastEventId` property of the web hook notification payload that is being acknowledged.  This value is ignored if `succeeded` is `false`.
    * @apiParam (Request Body JSON) {Boolean} [active] Should the status of webhook be changed to `active` or `inactive`.
    *   `Webhook Notification Recipient` normally only want to set this field when the previous processing was failed and want registry pause the notification delivery for a while.
    *   Please note: an inactive web hook will be waken up after certain amount of time (By default: 1 hour). This can be configured by registry `webhooks.retryInterval` option.
    *
    * @apiParamExample {json} Successful Acknowledgement Request Body Example
    *  {
    *    "succeeded": true,
    *    "lastEventIdReceived": 123222
    *  }
    *
    * @apiParamExample {json} Unsuccessfully Acknowledgement Request Body Example
    *  {
    *    "succeeded": false,
    *    "active": false // -- optionally pause the further notifcation delivery
    *  }
    *
    * @apiSuccess (Success 200 JSON Response Body) {number} lastEventIdReceived the id of last event received.
    * @apiSuccessExample {json} Sample Success Response
    *  {
    *    "lastEventIdReceived": 123423
    *  }
    * @apiUse GenericError
    */
  @Path("/{id}/ack")
  @ApiOperation(
    value = "Acknowledge a previously-deferred web hook",
    nickname = "ack",
    httpMethod = "POST",
    response = classOf[WebHookAcknowledgementResponse],
    notes =
      "Acknowledges a previously-deferred web hook with a given ID.  Acknowledging a previously-POSTed web hook will cause the next, if any, to be sent."
  )
  @ApiImplicitParams(
    Array(
      new ApiImplicitParam(
        name = "id",
        required = true,
        dataType = "string",
        paramType = "path",
        value = "ID of the web hook to be acknowledged."
      ),
      new ApiImplicitParam(
        name = "acknowledgement",
        required = true,
        dataType = "au.csiro.data61.magda.model.Registry$WebHookAcknowledgement",
        paramType = "body",
        value = "The details of the acknowledgement."
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
  def ack: Route = post {
    path(Segment / "ack") { id: String =>
      requireWebhookPermission(authClient, "object/webhook/ack", id) {
        entity(as[WebHookAcknowledgement]) { acknowledgement =>
          val result = DB localTx { implicit session =>
            HookPersistence
              .acknowledgeRaisedHook(id, acknowledgement) match {
              case Success(theResult) => complete(theResult)
              case Failure(exception) =>
                complete(StatusCodes.BadRequest, ApiError(exception.getMessage))
            }
          }

          webHookActor ! WebHookActor.InvalidateWebHookCacheThenProcess(
            webHookId = Some(id)
          )
          result
        }
      }
    }
  }

  def route: Route =
    getAll ~
      create ~
      getById ~
      putById ~
      deleteById ~
      ack
}
