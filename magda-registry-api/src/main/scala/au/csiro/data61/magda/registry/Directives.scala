package au.csiro.data61.magda.registry

import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.Directive0
import au.csiro.data61.magda.client.{AuthApiClient, AuthDecisionReqConfig}
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.model.StatusCodes.{
  BadRequest,
  Forbidden,
  InternalServerError
}
import akka.event.LoggingAdapter
import scalikejdbc.{DBSession}
import spray.json.{JsNull, JsNumber, JsObject, JsString, JsValue, JsonParser}
import gnieh.diffson.sprayJson.JsonPatch

import scala.util.{Failure, Success, Try}
import scalikejdbc._

import scala.concurrent.{ExecutionContext, Future, blocking}
import au.csiro.data61.magda.directives.AuthDirectives.{
  requirePermission,
  withAuthDecision
}
import au.csiro.data61.magda.directives.TenantDirectives.requiresTenantId
import au.csiro.data61.magda.model.Auth
import au.csiro.data61.magda.model.Registry.{AspectDefinition, WebHook}
import au.csiro.data61.magda.model.Auth.UnconditionalTrueDecision
import au.csiro.data61.magda.model.TenantId.{SpecifiedTenantId, TenantId}
import gnieh.diffson.PatchException

object Directives extends Protocols with SprayJsonSupport {

  final case class NoRecordFoundException(
      recordId: String
  ) extends Exception(s"Cannot locate record by id: ${recordId}")

  /**
    * retrieve record from DB and convert into JSON data (to be used as part of policy engine context data)
    * @param recordId
    * @param ec
    * @param session
    * @return
    */
  private def createRecordContextData(
      recordId: String,
      tenantId: TenantId
  )(
      implicit ec: ExecutionContext,
      logger: LoggingAdapter
  ): Future[JsObject] = {
    Future {
      var recordJsFields: Map[String, JsValue] = Map()
      var fetchedRecordId: String = ""
      var fetchedRecordTenantId: Option[BigInt] = None

      DB readOnly { implicit session =>
        sql"SELECT * FROM records WHERE recordid=${recordId} ${tenantId match {
          case SpecifiedTenantId(tenantId) => sqls" AND tenantid=${tenantId}"
          case _                           => SQLSyntax.empty
        }} LIMIT 1"
          .foreach { rs =>
            // JDBC treat column name case insensitive
            fetchedRecordId = rs.string("recordId")
            recordJsFields += ("id" -> JsString(fetchedRecordId))
            recordJsFields += ("name" -> JsString(rs.string("name")))
            recordJsFields += ("lastUpdate" -> JsNumber(
              rs.bigInt("lastupdate")
            ))
            rs.stringOpt("sourceTag")
              .foreach(
                item => recordJsFields += ("sourceTag" -> JsString(item))
              )
            rs.stringOpt("tenantId")
              .foreach(
                item => recordJsFields += ("tenantId" -> JsNumber(item))
              )
            fetchedRecordTenantId = rs.bigIntOpt("tenantId").map(BigInt(_))
          }
      }

      if (recordJsFields.isEmpty) {
        throw NoRecordFoundException(recordId)
      }

      DB readOnly { implicit session =>
        // only aspects of the selected record: a record with the same ID may exist in other tenants
        sql"""SELECT aspectid,data FROM recordaspects WHERE recordid=${recordId} ${fetchedRecordTenantId match {
          case Some(recordTenantId) => sqls"AND tenantid=${recordTenantId}"
          case None                 => sqls"AND tenantid IS NULL"
        }}"""
          .foreach { rs =>
            val aspectId = rs.string("aspectid")
            Try(JsonParser(rs.string("data")).asJsObject) match {
              case Success(data) => recordJsFields += (aspectId -> data)
              case Failure(e) =>
                logger.warning(
                  "Failed to parse aspect Json data while prepare policy evaluation context data. recordId: {} aspectId: {}",
                  recordId,
                  aspectId
                )
                throw e
            }
          }
      }

      JsObject(recordJsFields)
    }
  }

  /**
    * a request can only pass this directive when the user has unconditional permission for the given request operation.
    * This directive will retrieve record data and supply to policy engine as part of context data
    *
    * @param authApiClient
    * @param operationUri
    * @param recordId
    * @param session
    * @return
    */
  def requireRecordPermission(
      authApiClient: AuthApiClient,
      operationUri: String,
      recordId: String,
      onRecordNotFound: Option[() => Directive0] = None
  ): Directive0 =
    (extractLog & extractActorSystem & requiresTenantId)
      .tflatMap { t =>
        val log = t._1
        val requestActorSystem = t._2
        val tenantId = t._3

        implicit val blockingExeCtx =
          requestActorSystem.dispatchers.lookup("blocking-io-dispatcher")

        onComplete(
          createRecordContextData(recordId, tenantId)(
            blockingExeCtx,
            log
          )
        ).tflatMap {
          case Tuple1(Success(recordData)) =>
            requirePermission(
              authApiClient,
              operationUri,
              input =
                Some(JsObject("object" -> JsObject("record" -> recordData)))
            )
          case Tuple1(Failure(e: NoRecordFoundException)) =>
            if (onRecordNotFound.isDefined) {
              onRecordNotFound.get()
            } else {
              complete(
                BadRequest,
                ApiError(
                  s"Failed to locate record for auth context data creation."
                )
              )
            }
          case Tuple1(Failure(e)) =>
            log.error(
              "Failed to create record context data for auth decision. record ID: {}. Error: {}",
              recordId,
              e
            )
            complete(
              InternalServerError,
              ApiError(
                s"An error occurred while creating record context data for auth decision."
              )
            )
        }
      }

  /**
    * retrieve aspect record from DB and convert into JSON data (to be used as part of policy engine context data)
    * @param aspectId
    * @param ec
    * @param session
    * @return
    */
  private def createAspectContextData(
      aspectId: String,
      tenantId: TenantId
  )(implicit ec: ExecutionContext): Future[JsObject] = {
    Future {
      var aspectJsFields: Map[String, JsValue] = Map()
      DB readOnly { implicit session =>
        sql"SELECT * FROM aspects WHERE aspectid=${aspectId} ${tenantId match {
          case SpecifiedTenantId(tenantId) => sqls" AND tenantid=${tenantId}"
          case _                           => SQLSyntax.empty
        }} LIMIT 1"
          .foreach { rs =>
            // JDBC treat column name case insensitive
            aspectJsFields += ("id" -> JsString(rs.string("aspectId")))
            aspectJsFields += ("name" -> JsString(rs.string("name")))
            aspectJsFields += ("lastUpdate" -> JsNumber(
              rs.bigInt("lastupdate")
            ))

            rs.bigIntOpt("tenantId")
              .foreach(id => aspectJsFields += ("tenantId" -> JsNumber(id)))

            val jsonSchema = Try {
              JsonParser(rs.string("jsonschema"))
            }.getOrElse(JsNull)

            aspectJsFields += ("jsonSchema" -> jsonSchema)
          }
      }

      if (aspectJsFields.isEmpty) {
        throw NoRecordFoundException(aspectId)
      }

      JsObject(aspectJsFields)

    }
  }

  /**
    * a request can only pass this directive when the user has unconditional permission for the given request operation.
    * This directive will retrieve aspect data and supply to policy engine as part of context data
    *
    * @param authApiClient
    * @param operationUri
    * @param aspectId
    * @param onAspectNotFound Optional fallthrough for when the aspect does not exist (or is not
    *        accessible within the current tenant). Mirrors `requireRecordPermission`'s
    *        `onRecordNotFound`. When supplied, it runs instead of failing the request, so a
    *        caller (e.g. the delete route) can, for example, check the unconditional permission
    *        and let the request proceed to a "nothing to do" result. When `None` (the default,
    *        used by all pre-existing callers), a missing aspect yields the previous
    *        InternalServerError behaviour.
    * @param session
    * @return
    */
  def requireAspectPermission(
      authApiClient: AuthApiClient,
      operationUri: String,
      aspectId: String,
      onAspectNotFound: Option[() => Directive0] = None
  ): Directive0 =
    (extractLog & extractActorSystem & requiresTenantId)
      .tflatMap { t =>
        val log = t._1
        val requestActorSystem = t._2
        val tenantId = t._3

        implicit val blockingExeCtx =
          requestActorSystem.dispatchers.lookup("blocking-io-dispatcher")

        (withExecutionContext(blockingExeCtx) & onComplete(
          createAspectContextData(aspectId, tenantId)(blockingExeCtx)
        )).tflatMap {
          case Tuple1(Success(aspectData)) =>
            requirePermission(
              authApiClient,
              operationUri,
              input =
                Some(JsObject("object" -> JsObject("aspect" -> aspectData)))
            )
          case Tuple1(Failure(e: NoRecordFoundException)) =>
            if (onAspectNotFound.isDefined) {
              onAspectNotFound.get()
            } else {
              log.error(
                "Failed to create aspect context data for auth decision. aspect ID: {}. Error: {}",
                aspectId,
                e
              )
              complete(
                InternalServerError,
                ApiError(
                  s"An error occurred while creating aspect context data for auth decision."
                )
              )
            }
          case Tuple1(Failure(e)) =>
            log.error(
              "Failed to create aspect context data for auth decision. aspect ID: {}. Error: {}",
              aspectId,
              e
            )
            complete(
              InternalServerError,
              ApiError(
                s"An error occurred while creating aspect context data for auth decision."
              )
            )
        }
      }

  /**
    * a request can only pass this directive when:
    * - the aspect exist and the user has `object/aspect/update` permission to the aspect
    *   - the current aspect data will be supplied to policy engine as context data
    * - the aspect doesn't exist and the use has `object/aspect/create` permission to create the aspect
    *   - the new aspect data will be supplied to policy engine as context data
    *
    * @param authApiClient
    * @param newAspectOrJsonPatch
    * @param session
    * @return
    */
  def requireAspectUpdateOrCreateWhenNonExistPermission(
      authApiClient: AuthApiClient,
      aspectId: String,
      newAspectOrJsonPatch: Either[AspectDefinition, JsonPatch]
  ): Directive0 =
    (extractLog & extractActorSystem & requiresTenantId)
      .tflatMap { t =>
        val log = t._1
        val requestActorSystem = t._2
        val tenantId = t._3

        implicit val blockingExeCtx =
          requestActorSystem.dispatchers.lookup("blocking-io-dispatcher")
        onComplete(
          createAspectContextData(aspectId, tenantId)(blockingExeCtx)
            .map { currentAspectData =>
              val aspectDataAfterUpdate = newAspectOrJsonPatch match {
                case Left(newAspectData)   => newAspectData.toJson.asJsObject
                case Right(aspectJsonPath) => aspectJsonPath(currentAspectData)
              }
              (currentAspectData, aspectDataAfterUpdate)
            }
        ).flatMap {
          case Success((currentAspectData, aspectDataAfterUpdate)) =>
            requirePermission(
              authApiClient,
              "object/aspect/update",
              input = Some(
                JsObject("object" -> JsObject("aspect" -> currentAspectData))
              )
            ) & requirePermission(
              authApiClient,
              "object/aspect/update",
              input = Some(
                JsObject(
                  "object" -> JsObject("aspect" -> aspectDataAfterUpdate)
                )
              )
            )
          case Failure(exception: NoRecordFoundException) =>
            newAspectOrJsonPatch match {
              case Left(newAspectData) =>
                requirePermission(
                  authApiClient,
                  "object/aspect/create",
                  input = Some(
                    JsObject(
                      "object" -> JsObject("aspect" -> newAspectData.toJson)
                    )
                  )
                )
              case Right(_) =>
                // When aspect Json Patch was passed (i.e. a patch request),
                // there is no way to create the aspect when it doesn't exist (as we don't know the current data)
                // we will send out BadRequest response immediately
                complete(
                  BadRequest,
                  ApiError(s"Cannot locate aspect record by id: ${aspectId}")
                )
            }
          case Failure(e: PatchException) =>
            complete(
              BadRequest,
              ApiError(s"JSON patch error: ${e}")
            )
          case Failure(e: Throwable) =>
            log.error(
              "Failed to create aspect context data for auth decision. aspect ID: {}. Error: {}",
              aspectId,
              e
            )
            complete(
              InternalServerError,
              ApiError(
                s"An error occurred while creating aspect context data for auth decision."
              )
            )
        }
      }

  /**
    * retrieve webhook record from DB and convert into JSON data (to be used as part of policy engine context data)
    * @param webhookId
    * @param ec
    * @param session
    * @return
    */
  private def createWebhookContextData(
      webhookId: String
  )(implicit ec: ExecutionContext): Future[JsObject] = {
    Future {
      val hookData = DB readOnly { implicit session =>
        HookPersistence
          .getById(webhookId, UnconditionalTrueDecision)
          .map(_.toJson.asJsObject)
      }
      if (hookData.isEmpty) {
        throw NoRecordFoundException(webhookId)
      } else {
        hookData.get
      }
    }
  }

  /**
    * a request can only pass this directive when the user has unconditional permission for the given request operation.
    * This directive will retrieve webhook data and supply to policy engine as part of context data
    *
    * @param authApiClient
    * @param operationUri
    * @param webhookId
    * @param session
    * @return
    */
  def requireWebhookPermission(
      authApiClient: AuthApiClient,
      operationUri: String,
      webhookId: String,
      onRecordNotFound: Option[() => Directive0] = None
  ): Directive0 =
    (extractLog & extractActorSystem).tflatMap { t =>
      val log = t._1
      val requestActorSystem = t._2

      implicit val blockingExeCtx =
        requestActorSystem.dispatchers.lookup("blocking-io-dispatcher")

      (withExecutionContext(blockingExeCtx) & onComplete(
        createWebhookContextData(webhookId)(blockingExeCtx)
      )).tflatMap {
        case Tuple1(Success(hookData)) =>
          requirePermission(
            authApiClient,
            operationUri,
            input = Some(JsObject("object" -> JsObject("webhook" -> hookData)))
          )
        case Tuple1(Failure(e: NoRecordFoundException)) =>
          if (onRecordNotFound.isDefined) {
            onRecordNotFound.get()
          } else {
            complete(
              BadRequest,
              ApiError(
                s"Failed to locate hook for auth context data creation."
              )
            )
          }
        case Tuple1(Failure(e)) =>
          log.error(
            "Failed to create webhook context data for auth decision. webhook ID: {}. Error: {}",
            webhookId,
            e
          )
          complete(
            InternalServerError,
            ApiError(
              s"An error occurred while creating aspect context data for auth decision."
            )
          )
      }
    }

  /**
    * a request can only pass this directive when:
    * - the webhook exist and the user has `object/webhook/update` permission to the webhook
    *   - the current webhook data will be supplied to policy engine as context data
    * - the webhook doesn't exist and the use has `object/webhook/create` permission to create the webhook
    *   - the new webhook data will be supplied to policy engine as context data
    *
    * @param authApiClient
    * @param newWebhook
    * @param session
    * @return
    */
  def requireWebhookUpdateOrCreateWhenNonExistPermission(
      authApiClient: AuthApiClient,
      webhookId: String,
      newWebhook: WebHook
  ): Directive0 =
    (extractLog & extractActorSystem).tflatMap { t =>
      val log = t._1
      val requestActorSystem = t._2

      implicit val blockingExeCtx =
        requestActorSystem.dispatchers.lookup("blocking-io-dispatcher")
      onComplete(
        createWebhookContextData(webhookId)(blockingExeCtx)
      ).flatMap {
        case Success(currentWebHookData) =>
          requirePermission(
            authApiClient,
            "object/webhook/update",
            input = Some(
              JsObject("object" -> JsObject("webhook" -> currentWebHookData))
            )
          ) & requirePermission(
            authApiClient,
            "object/webhook/update",
            input = Some(
              JsObject(
                "object" -> JsObject(
                  "webhook" -> newWebhook.toJson
                )
              )
            )
          )
        case Failure(e: NoRecordFoundException) =>
          requirePermission(
            authApiClient,
            "object/webhook/create",
            input = Some(
              JsObject(
                "object" -> JsObject(
                  "webhook" -> newWebhook.toJson
                )
              )
            )
          )
        case Failure(e: Throwable) =>
          log.error(
            "Failed to create webhook context data for auth decision. webhook ID: {}. Error: {}",
            webhookId,
            e
          )
          complete(
            InternalServerError,
            ApiError(
              s"An error occurred while creating webhook context data for auth decision."
            )
          )
      }
    }

  /**
    * a request can only pass this directive when:
    * - a user has unconditional "object/event/read" permission
    * - or a user has permission to the record that's specified by recordId
    *
    * @param authApiClient
    * @param recordId
    * @param session
    * @return
    */
  def requireRecordEventReadPermission(
      authApiClient: AuthApiClient,
      recordId: String
  ): Directive0 =
    withAuthDecision(authApiClient, AuthDecisionReqConfig("object/event/read"))
      .flatMap { authDecision =>
        if (authDecision.hasResidualRules == false && authDecision.result.isDefined && (true == Auth
              .isTrueEquivalent(authDecision.result.get))) {
          // use has unconditional read permission to event, let request go
          pass
        } else {
          // check if user has read permission to the record
          // if so, the user can access all events of the records as well.
          requireRecordPermission(
            authApiClient,
            "object/record/read",
            recordId,
            onRecordNotFound = Some(
              () =>
                complete(
                  Forbidden,
                  ApiError(
                    s"An error occurred while creating webhook context data for auth decision."
                  )
                )
            )
          )
        }
      }
}
