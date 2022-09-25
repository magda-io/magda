package au.csiro.data61.magda.registry

import au.csiro.data61.magda.model.AspectQueryToSqlConfig
import au.csiro.data61.magda.model.Auth.AuthDecision

import java.util.UUID
import spray.json._
import gnieh.diffson.sprayJson._
import scalikejdbc._
import au.csiro.data61.magda.model.Registry._
import scalikejdbc.interpolation.SQLSyntax

import java.time.OffsetDateTime
import scala.util.{Failure, Success, Try}

object HookPersistence extends Protocols with DiffsonProtocol {

  def getAll(
      authDecision: AuthDecision
  )(implicit session: DBSession): List[WebHook] = {
    val authDecisionCondition = authDecision.toSql(
      AspectQueryToSqlConfig(
        prefixes = Set("input.object.webhook"),
        genericQuery = true
      )
    )

    val whereClauseParts = Seq(authDecisionCondition)

    sql"""select
            webhookId,
            name,
            active,
            lastEvent,
            url,
            isWaitingForResponse,
            (
              select array_agg(eventTypeId)
              from WebHookEvents
              where WebHookEvents.webHookId=WebHooks.webHookId
            ) as eventTypes,
            config,
            enabled,
            lastRetryTime,
            retryCount,
            ownerId,
            creatorId,
            createTime,
            editorId,
            editTime
          from WebHooks ${SQLSyntax
      .where(SQLSyntax.toAndConditionOpt(whereClauseParts: _*))}"""
      .map(rowToHook)
      .list
      .apply()
  }

  def getById(id: String, authDecision: AuthDecision)(
      implicit session: DBSession
  ): Option[WebHook] = {
    val authDecisionCondition = authDecision.toSql(
      AspectQueryToSqlConfig(
        prefixes = Set("input.object.webhook"),
        genericQuery = true
      )
    )

    val whereClauseParts = Seq(authDecisionCondition) :+ Some(
      SQLSyntax.eq(sqls"webHookId", id)
    )

    sql"""select
            webhookId,
            name,
            active,
            lastEvent,
            url,
            isWaitingForResponse,
            (
              select array_agg(eventTypeId)
              from WebHookEvents
              where WebHookEvents.webHookId=WebHooks.webHookId
            ) as eventTypes,
            config,
            enabled,
            lastRetryTime,
            retryCount,
            ownerId,
            creatorId,
            createTime,
            editorId,
            editTime
          from WebHooks
          ${SQLSyntax
      .where(SQLSyntax.toAndConditionOpt(whereClauseParts: _*))}"""
      .map(rowToHook)
      .single
      .apply()
  }

  /**
    * Register a new web hook. The new hook subscribes to receive new events that occur after the registration
    * and meet the criteria specified by the hook:
    *
    *   1. the event types (specified in hook.eventTypes).
    *   2. the aspect IDs (specified in hook.config, both compulsory and optional aspect IDs.
    *       See [[au.csiro.data61.magda.model.Registry.WebHookConfig]] for other config parameters.).
    *
    * The registry will use the above criteria to find events from events table then send them to the hook.
    * In the current implementation, all web hooks are tenant independent. That is, in multi-tenant mode, a web
    * hook will receive events belonging to all tenants.
    *
    * See [[au.csiro.data61.magda.registry.WebHookActor.SingleWebHookActor]] for the implementation that provides
    * event service for all web hooks, such as indexer and minions.
    *
    * @param session
    * @param hook
    * @return
    */
  def create(hook: WebHook, userId: Option[String])(
      implicit session: DBSession
  ): Try[WebHook] = {
    Try {
      val theHookId = hook.id match {
        case None     => UUID.randomUUID().toString()
        case Some(id) => id
      }

      val userIdSql = userId.map(id => sqls"${id}::UUID").getOrElse(sqls"NULL")

      sql"""insert into WebHooks (webHookId, name, active, lastEvent, url, config, enabled, ownerId, creatorId, editorId)
          values (
            $theHookId,
            ${hook.name},
            ${hook.active},
            (select eventId from Events order by eventId desc limit 1),
            ${hook.url},
            ${hook.config.toJson.compactPrint}::jsonb,
            ${hook.enabled},
            ${userIdSql},
            ${userIdSql},
            ${userIdSql}
           )""".update
        .apply()

      val batchParameters = hook.eventTypes
        .map(
          eventType =>
            Seq('webhookId -> theHookId, 'eventTypeId -> eventType.value)
        )
        .toSeq
      sql"""insert into WebHookEvents (webhookId, eventTypeId) values ({webhookId}, {eventTypeId})"""
        .batchByName(batchParameters: _*)
        .apply()

      WebHook(
        id = Some(theHookId),
        name = hook.name,
        active = hook.active,
        lastEvent = None, // TODO: include real lastEvent
        url = hook.url,
        eventTypes = hook.eventTypes,
        isWaitingForResponse = None,
        config = hook.config,
        enabled = hook.enabled,
        ownerId = userId,
        creatorId = userId,
        editorId = userId,
        createTime = Some(OffsetDateTime.now()),
        editTime = Some(OffsetDateTime.now())
      )
    }
  }

  def delete(hookId: String)(implicit session: DBSession): Try[Boolean] = {
    Try {
      sql"delete from WebHookEvents where webHookId=$hookId".update.apply()
      sql"delete from WebHooks where webHookId=$hookId".update.apply() > 0
    }
  }

  def setLastEvent(
      id: String,
      lastEventId: Long,
      userId: Option[String] = None
  )(implicit session: DBSession) = {
    val userIdSql = userId.map(id => sqls"${id}::UUID").getOrElse(sqls"NULL")
    sql"update WebHooks set lastEvent=$lastEventId , editorId=${userIdSql}, editTime=CURRENT_TIMESTAMP where webHookId=$id".update
      .apply()
  }

  def setIsWaitingForResponse(
      id: String,
      isWaitingForResponse: Boolean,
      userId: Option[String] = None
  )(implicit session: DBSession) = {
    val userIdSql = userId.map(id => sqls"${id}::UUID").getOrElse(sqls"NULL")
    sql"update WebHooks set isWaitingForResponse=$isWaitingForResponse , editorId=${userIdSql}, editTime=CURRENT_TIMESTAMP where webHookId=$id".update
      .apply()
  }

  def setActive(id: String, active: Boolean, userId: Option[String] = None)(
      implicit session: DBSession
  ) = {
    val userIdSql = userId.map(id => sqls"${id}::UUID").getOrElse(sqls"NULL")
    sql"update WebHooks set active=$active , editorId=${userIdSql}, editTime=CURRENT_TIMESTAMP where webHookId=$id".update
      .apply()
  }

  def retry(id: String, userId: Option[String] = None)(
      implicit session: DBSession
  ) = {
    val userIdSql = userId.map(id => sqls"${id}::UUID").getOrElse(sqls"NULL")
    sql"update WebHooks set active=${true}, lastretrytime=NOW(), retrycount=retrycount+1 , editorId=${userIdSql}, editTime=CURRENT_TIMESTAMP where webHookId=$id".update
      .apply()
  }

  def resetRetryCount(id: String, userId: Option[String] = None)(
      implicit session: DBSession
  ) = {
    val userIdSql = userId.map(id => sqls"${id}::UUID").getOrElse(sqls"NULL")
    sql"update WebHooks set lastretrytime=NULL, retrycount=0 , editorId=${userIdSql}, editTime=CURRENT_TIMESTAMP where webHookId=$id".update
      .apply()
  }

  def putById(
      id: String,
      hook: WebHook,
      userId: Option[String]
  )(implicit session: DBSession): Try[WebHook] = {
    if (id != hook.id.getOrElse("")) {
      Failure(
        new RuntimeException(
          "The provided ID does not match the web hook's ID."
        )
      )
    } else {
      val userIdSql = userId.map(id => sqls"${id}::UUID").getOrElse(sqls"NULL")
      sql"""insert into WebHooks (webHookId, name, active, lastevent, url, config, enabled, ownerId, creatorId, editorId)
          values (
            ${id},
            ${hook.name},
            ${hook.active},
            (select eventId from Events order by eventId desc limit 1),
            ${hook.url},
            ${hook.config.toJson.compactPrint}::jsonb,
            ${hook.enabled},
            ${userIdSql},
            ${userIdSql},
            ${userIdSql}
          )
          on conflict (webHookId) do update
          set
            name = ${hook.name},
            active = ${hook.active},
            url = ${hook.url},
            config = ${hook.config.toJson.compactPrint}::jsonb,
            editorId = ${userIdSql},
            editTime = CURRENT_TIMESTAMP
          """.update
        .apply()

      sql"delete from WebHookEvents where webHookId=${id}".update.apply()

      val batchParameters = hook.eventTypes
        .map(
          eventType => Seq('webhookId -> id, 'eventTypeId -> eventType.value)
        )
        .toSeq
      sql"""insert into WebHookEvents (webhookId, eventTypeId) values ({webhookId}, {eventTypeId})"""
        .batchByName(batchParameters: _*)
        .apply()

      Success(hook)
    }
  }

  def acknowledgeRaisedHook(
      id: String,
      acknowledgement: WebHookAcknowledgement
  )(implicit session: DBSession): Try[WebHookAcknowledgementResponse] = {
    Try {
      val setActive = acknowledgement.active.getOrElse(true) match {
        case true =>
          sqls", active=true, lastretrytime=null, retrycount=0"
        case false => sqls", active=false"
      }

      if (acknowledgement.succeeded) {
        acknowledgement.lastEventIdReceived match {
          case Some(eventId) =>
            sql"update WebHooks set isWaitingForResponse=false, lastEvent=${acknowledgement.lastEventIdReceived} ${setActive} where webHookId=$id".update
              .apply()
            WebHookAcknowledgementResponse(eventId)
          case None =>
            throw new Exception(
              "If acknowledgement succeeded is true, lastEventIdReceived must be provided"
            )
        }
      } else {
        sql"update WebHooks set isWaitingForResponse=false ${setActive} where webHookId=$id".update
          .apply()
        WebHookAcknowledgementResponse(
          sql"select lastEvent from WebHooks where webHookId=$id"
            .map(rs => rs.long("lastEvent"))
            .single
            .apply()
            .get
        )
      }
    }
  }

  private def rowToHook(rs: WrappedResultSet): WebHook = WebHook(
    id = Some(rs.string("webhookId")),
    name = rs.string("name"),
    active = rs.boolean("active"),
    lastEvent = rs.longOpt("lastEvent"),
    url = rs.string("url"),
    eventTypes = rs
      .arrayOpt("eventTypes")
      .map(
        a =>
          a.getArray()
            .asInstanceOf[Array[Integer]]
            .map(EventType.withValue(_))
            .toSet
      )
      .getOrElse(Set()),
    isWaitingForResponse = rs.booleanOpt("isWaitingForResponse"),
    config = JsonParser(rs.string("config")).convertTo[WebHookConfig],
    enabled = rs.boolean("enabled"),
    lastRetryTime = rs.offsetDateTimeOpt("lastRetryTime"),
    retryCount = rs.int("retryCount"),
    ownerId = rs.stringOpt("ownerId"),
    creatorId = rs.stringOpt("creatorId"),
    editorId = rs.stringOpt("editorId"),
    createTime = Try(rs.stringOpt("createTime").map(OffsetDateTime.parse(_)))
      .getOrElse(None),
    editTime = Try(rs.stringOpt("editTime").map(OffsetDateTime.parse(_)))
      .getOrElse(None)
  )
}
