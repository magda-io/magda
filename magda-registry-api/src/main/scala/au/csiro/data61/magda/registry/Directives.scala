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
import scalikejdbc.{DBSession, ReadOnlyAutoSession}
import spray.json.{JsNull, JsNumber, JsObject, JsString, JsValue, JsonParser}
import gnieh.diffson.sprayJson.JsonPatch

import scala.util.{Failure, Success, Try}
import scalikejdbc._

import scala.concurrent.{ExecutionContext, Future, blocking}
import au.csiro.data61.magda.directives.AuthDirectives.{
  requirePermission,
  requireUnconditionalAuthDecision,
  withAuthDecision
}
import au.csiro.data61.magda.directives.TenantDirectives.requiresTenantId
import au.csiro.data61.magda.model.Auth
import au.csiro.data61.magda.model.Registry.{AspectDefinition, Record, WebHook}
import au.csiro.data61.magda.util.JsonPatchUtils.applyJsonPathToRecordContextData
import au.csiro.data61.magda.model.Auth.{
  UnconditionalTrueDecision,
  recordToContextData
}
import au.csiro.data61.magda.model.TenantId.{SpecifiedTenantId, TenantId}
import au.csiro.data61.magda.util.JsonUtils
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
      logger: LoggingAdapter,
      session: DBSession
  ): Future[JsObject] = {
    Future {
      blocking {
        var recordJsFields: Map[String, JsValue] = Map()
        var fetchedRecordId: String = ""

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
          }

        if (recordJsFields.isEmpty) {
          throw NoRecordFoundException(recordId)
        }

        sql"""SELECT aspectid,data FROM recordaspects WHERE recordid=${recordId}"""
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

        JsObject(recordJsFields)
      }
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
      onRecordNotFound: Option[() => Directive0] = None,
      session: DBSession = ReadOnlyAutoSession
  ): Directive0 =
    (extractLog & extractExecutionContext & extractActorSystem & requiresTenantId)
      .tflatMap { t =>
        val requestExeCtx = t._2
        val log = t._1
        val requestActorSystem = t._3
        val tenantId = t._4

        implicit val blockingExeCtx =
          requestActorSystem.dispatchers.lookup("blocking-io-dispatcher")

        (withExecutionContext(blockingExeCtx) & onComplete(
          createRecordContextData(recordId, tenantId)(
            blockingExeCtx,
            log,
            session
          )
        )).tflatMap {
          case Tuple1(Success(recordData)) =>
            requirePermission(
              authApiClient,
              operationUri,
              input =
                Some(JsObject("object" -> JsObject("record" -> recordData)))
            ) & withExecutionContext(requestExeCtx) & pass // switch back to akka dispatcher
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
    * a request can only pass this directive when:
    * - the record exist and the user has `object/record/update` permission to the record
    *   - the current record data will be supplied to policy engine as context data
    * - the record doesn't exist:
    *   - the new record data was passed (via `newRecordOrJsonPath`) and the use has `object/record/create` permission to create the record
    *     - i.e. it's a non-patch request
    *     - the new record data will be supplied to policy engine as context data for this case
    *
    * When the record doesn't exist and the record JSON patch was passed (via `newRecordOrJsonPath`), we will response BadRequest response immediately.
    * - as there is no way to process JSON patch without original record data.
    *
    * @param authApiClient
    * @param recordId
    * @param newRecordOrJsonPath
    * @param session
    * @return
    */
  def requireRecordUpdateOrCreateWhenNonExistPermission(
      authApiClient: AuthApiClient,
      recordId: String,
      newRecordOrJsonPath: Either[Record, JsonPatch],
      merge: Boolean = false,
      session: DBSession = ReadOnlyAutoSession
  ): Directive0 =
    (extractLog & extractExecutionContext & extractActorSystem & requiresTenantId)
      .tflatMap { t =>
        val requestExeCtx = t._2
        val log = t._1
        val requestActorSystem = t._3
        val tenantId = t._4

        implicit val blockingExeCtx =
          requestActorSystem.dispatchers.lookup("blocking-io-dispatcher")
        onComplete(
          createRecordContextData(recordId, tenantId)(
            blockingExeCtx,
            log,
            session
          ).map { currentRecordData =>
            val recordContextDataAfterUpdate = newRecordOrJsonPath match {
              case Left(newRecord) =>
                val newRecordJsonWithoutAspects =
                  recordToContextData(newRecord.copy(aspects = Map()))
                var mergedRecordFields = JsonUtils
                  .merge(currentRecordData, newRecordJsonWithoutAspects)
                  .asJsObject
                  .fields
                newRecord.aspects.foreach { aspect =>
                  val aspectName = aspect._1
                  val aspectData = if (merge) {
                    JsonUtils
                      .merge(
                        currentRecordData.fields
                          .get(aspectName)
                          .getOrElse(JsObject()),
                        aspect._2
                      )
                  } else {
                    aspect._2.asInstanceOf[JsValue]
                  }
                  mergedRecordFields += (aspectName -> aspectData)
                }
                JsObject(mergedRecordFields)
              case Right(recordJsonPath) =>
                applyJsonPathToRecordContextData(
                  currentRecordData,
                  recordJsonPath
                )
            }
            (currentRecordData, recordContextDataAfterUpdate)
          }
        ).flatMap {
          case Success((currentRecordData, recordContextDataAfterUpdate)) =>
            /*
          We make sure user has permission to perform "object/record/update" operation on
          - current record
          - the record after update
          i.e. A user can't modify a record's data to make it a record that he has no permission to modify.
          Useful use case would be: a user with permission to only `update` draft dataset can't modify modify the draft dataset
          to make it a publish dataset, unless he also has permission to update publish datasets.
             */
            requirePermission(
              authApiClient,
              "object/record/update",
              input = Some(
                JsObject(
                  "object" -> JsObject("record" -> currentRecordData)
                )
              )
            ) & requirePermission(
              authApiClient,
              "object/record/update",
              input = Some(
                JsObject(
                  "object" -> JsObject(
                    "record" -> recordContextDataAfterUpdate
                  )
                )
              )
            ) & withExecutionContext(requestExeCtx) & pass
          case Failure(_: NoRecordFoundException) =>
            newRecordOrJsonPath match {
              case Left(newRecord) =>
                // if a new record data was passed (i.e. non json patch request),
                // we will assess if user has permission to create the record as well
                requirePermission(
                  authApiClient,
                  "object/record/create",
                  input = Some(
                    JsObject(
                      "object" -> JsObject(
                        "record" -> recordToContextData(newRecord)
                      )
                    )
                  )
                ) & withExecutionContext(requestExeCtx) & pass
              case Right(_) =>
                // When record Json Patch was passed (i.e. a patch request),
                // there is no way to create the record when it doesn't exist (as we don't know the current data)
                // we will send out BadRequest response immediately
                complete(
                  BadRequest,
                  ApiError(s"Cannot locate request record by id: ${recordId}")
                )
            }
          case Failure(e: PatchException) =>
            complete(
              BadRequest,
              ApiError(s"JSON patch error: ${e}")
            )
          case Failure(e: Throwable) =>
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
    * a request can only pass this directive when the user has permission to perform `update` operation on
    * both current record and record after the aspect changes
    *
    * @param authApiClient
    * @param recordId
    * @param aspectId
    * @param newAspectOrAspectJsonPath
    * @param session
    * @return
    */
  def requireRecordAspectUpdatePermission(
      authApiClient: AuthApiClient,
      recordId: String,
      aspectId: String,
      newAspectOrAspectJsonPath: Either[JsObject, JsonPatch],
      merge: Boolean = false,
      session: DBSession = ReadOnlyAutoSession
  ): Directive0 =
    (extractLog & extractExecutionContext & extractActorSystem & requiresTenantId)
      .tflatMap { t =>
        val requestExeCtx = t._2
        val log = t._1
        val requestActorSystem = t._3
        val tenantId = t._4

        implicit val blockingExeCtx =
          requestActorSystem.dispatchers.lookup("blocking-io-dispatcher")

        onComplete(
          createRecordContextData(recordId, tenantId)(
            blockingExeCtx,
            log,
            session
          ).map { currentRecordData =>
            val recordContextDataAfterUpdate = newAspectOrAspectJsonPath match {
              case Left(newAspect) =>
                if (merge) {
                  // merge aspect data
                  val oldAspectData =
                    currentRecordData.fields.get(aspectId).getOrElse(JsObject())
                  val finalAspectData =
                    JsonUtils.merge(oldAspectData, newAspect)
                  JsObject(
                    currentRecordData.fields + (aspectId -> finalAspectData)
                  )
                } else {
                  JsObject(currentRecordData.fields + (aspectId -> newAspect))
                }
              case Right(recordJsonPath) =>
                val newAspectData = recordJsonPath(
                  currentRecordData.fields
                    .get(aspectId)
                    .getOrElse(JsObject())
                )
                JsObject(
                  currentRecordData.fields + (aspectId -> newAspectData)
                )
            }
            (currentRecordData, recordContextDataAfterUpdate)
          }
        ).flatMap {
          case Success((currentRecordData, recordContextDataAfterUpdate)) =>
            //val recordContextDataAfterUpdate =
            /*
          We make sure user has permission to perform "object/record/update" operation on
          - current record
          - the record after the aspect data update
          i.e. A user can't modify a record's data to make it a record that he has no permission to modify.
             */
            requirePermission(
              authApiClient,
              "object/record/update",
              input = Some(
                JsObject("object" -> JsObject("record" -> currentRecordData))
              )
            ) & requirePermission(
              authApiClient,
              "object/record/update",
              input = Some(
                JsObject(
                  "object" -> JsObject(
                    "record" -> recordContextDataAfterUpdate
                  )
                )
              )
            ) & withExecutionContext(requestExeCtx) & pass
          case Failure(_: NoRecordFoundException) =>
            // There is no way to construct full record context data for auth decision without the original record
            // we will send out BadRequest response immediately
            complete(
              BadRequest,
              ApiError(s"Cannot locate request record by id: ${recordId}")
            )
          case Failure(e: PatchException) =>
            complete(
              BadRequest,
              ApiError(s"JSON patch error: ${e}")
            )
          case Failure(e: Throwable) =>
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
    * a request can only pass this directive when the user has permission to perform `update` operation on
    * both current record and record after the aspect is deleted
    *
    * @param authApiClient
    * @param recordId
    * @param aspectId
    * @param session
    * @return
    */
  def requireDeleteRecordAspectPermission(
      authApiClient: AuthApiClient,
      recordId: String,
      aspectId: String,
      session: DBSession = ReadOnlyAutoSession
  ): Directive0 =
    (extractLog & extractExecutionContext & extractActorSystem & requiresTenantId)
      .tflatMap { t =>
        val requestExeCtx = t._2
        val log = t._1
        val requestActorSystem = t._3
        val tenantId = t._4

        implicit val blockingExeCtx =
          requestActorSystem.dispatchers.lookup("blocking-io-dispatcher")

        onComplete(
          createRecordContextData(recordId, tenantId)(
            blockingExeCtx,
            log,
            session
          ).map { currentRecordData =>
            val recordContextDataAfterUpdate =
              JsObject(currentRecordData.fields - aspectId)
            (currentRecordData, recordContextDataAfterUpdate)
          }
        ).flatMap {
          case Success((currentRecordData, recordContextDataAfterUpdate)) =>
            /*
          Make sure user has permission before & after delete the aspect
             */
            requirePermission(
              authApiClient,
              "object/record/update",
              input = Some(
                JsObject("object" -> JsObject("record" -> currentRecordData))
              )
            ) & requirePermission(
              authApiClient,
              "object/record/update",
              input = Some(
                JsObject(
                  "object" -> JsObject(
                    "record" -> recordContextDataAfterUpdate
                  )
                )
              )
            ) & withExecutionContext(requestExeCtx) & pass
          case Failure(_: NoRecordFoundException) =>
            // when record cannot found, only user has unconditional record update access can proceed to this API (and potentially know the aspect has been already deleted)
            requireUnconditionalAuthDecision(
              authApiClient,
              AuthDecisionReqConfig("object/record/update")
            ) & withExecutionContext(requestExeCtx) & pass
          case Failure(e: Throwable) =>
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
  )(implicit ec: ExecutionContext, session: DBSession): Future[JsObject] = {
    Future {
      blocking {
        var aspectJsFields: Map[String, JsValue] = Map()
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

        if (aspectJsFields.isEmpty) {
          throw NoRecordFoundException(aspectId)
        }

        JsObject(aspectJsFields)
      }
    }
  }

  /**
    * a request can only pass this directive when the user has unconditional permission for the given request operation.
    * This directive will retrieve aspect data and supply to policy engine as part of context data
    *
    * @param authApiClient
    * @param operationUri
    * @param aspectId
    * @param session
    * @return
    */
  def requireAspectPermission(
      authApiClient: AuthApiClient,
      operationUri: String,
      aspectId: String,
      session: DBSession = ReadOnlyAutoSession
  ): Directive0 =
    (extractLog & extractExecutionContext & extractActorSystem & requiresTenantId)
      .tflatMap { t =>
        val requestExeCtx = t._2
        val log = t._1
        val requestActorSystem = t._3
        val tenantId = t._4

        implicit val blockingExeCtx =
          requestActorSystem.dispatchers.lookup("blocking-io-dispatcher")

        (withExecutionContext(blockingExeCtx) & onComplete(
          createAspectContextData(aspectId, tenantId)(blockingExeCtx, session)
        )).tflatMap {
          case Tuple1(Success(aspectData)) =>
            requirePermission(
              authApiClient,
              operationUri,
              input =
                Some(JsObject("object" -> JsObject("aspect" -> aspectData)))
            ) & withExecutionContext(requestExeCtx) & pass // switch back to akka dispatcher
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
      newAspectOrJsonPatch: Either[AspectDefinition, JsonPatch],
      session: DBSession = ReadOnlyAutoSession
  ): Directive0 =
    (extractLog & extractExecutionContext & extractActorSystem & requiresTenantId)
      .tflatMap { t =>
        val requestExeCtx = t._2
        val log = t._1
        val requestActorSystem = t._3
        val tenantId = t._4

        implicit val blockingExeCtx =
          requestActorSystem.dispatchers.lookup("blocking-io-dispatcher")
        onComplete(
          createAspectContextData(aspectId, tenantId)(blockingExeCtx, session)
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
            ) & withExecutionContext(requestExeCtx) & pass
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
                ) & withExecutionContext(requestExeCtx) & pass
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
  )(implicit ec: ExecutionContext, session: DBSession): Future[JsObject] = {
    Future {
      blocking {
        val hookData = HookPersistence
          .getById(webhookId, UnconditionalTrueDecision)
          .map(_.toJson.asJsObject)
        if (hookData.isEmpty) {
          throw NoRecordFoundException(webhookId)
        } else {
          hookData.get
        }
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
      onRecordNotFound: Option[() => Directive0] = None,
      session: DBSession = ReadOnlyAutoSession
  ): Directive0 =
    (extractLog & extractExecutionContext & extractActorSystem).tflatMap { t =>
      val requestExeCtx = t._2
      val log = t._1
      val requestActorSystem = t._3

      implicit val blockingExeCtx =
        requestActorSystem.dispatchers.lookup("blocking-io-dispatcher")

      (withExecutionContext(blockingExeCtx) & onComplete(
        createWebhookContextData(webhookId)(blockingExeCtx, session)
      )).tflatMap {
        case Tuple1(Success(hookData)) =>
          requirePermission(
            authApiClient,
            operationUri,
            input = Some(JsObject("object" -> JsObject("webhook" -> hookData)))
          ) & withExecutionContext(requestExeCtx) & pass // switch back to akka dispatcher
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
      newWebhook: WebHook,
      session: DBSession = ReadOnlyAutoSession
  ): Directive0 =
    (extractLog & extractExecutionContext & extractActorSystem).tflatMap { t =>
      val requestExeCtx = t._2
      val log = t._1
      val requestActorSystem = t._3

      implicit val blockingExeCtx =
        requestActorSystem.dispatchers.lookup("blocking-io-dispatcher")
      onComplete(
        createWebhookContextData(webhookId)(blockingExeCtx, session)
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
          ) & withExecutionContext(requestExeCtx) & pass
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
          ) & withExecutionContext(requestExeCtx) & pass
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
      recordId: String,
      session: DBSession = ReadOnlyAutoSession
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
            ),
            session
          )
        }
      }
}
