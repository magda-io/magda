package au.csiro.data61.magda.registry

import spray.json._
import gnieh.diffson.sprayJson._
import scalikejdbc._

import scala.util.{Success, Try}

object HookPersistence extends Protocols with DiffsonProtocol {
  def getAll(implicit session: DBSession): List[WebHook] = {
    sql"""select
            webhookId,
            userId,
            name,
            active,
            lastEvent,
            url,
            (
              select array_agg(eventTypeId)
              from WebHookEvents
              where WebHookEvents.webHookId=WebHooks.webHookId
            ) as eventTypes,
            config
          from WebHooks"""
      .map(rowToHook).list.apply()
  }

  def getById(implicit session: DBSession, id: Int): Option[WebHook] = {
    sql"""select
            webhookId,
            userId,
            name,
            active,
            lastEvent,
            url,
            (
              select array_agg(eventTypeId)
              from WebHookEvents
              where WebHookEvents.webHookId=WebHooks.webHookId
            ) as eventTypes,
            config
          from WebHooks
          where webHookId=$id"""
      .map(rowToHook).single.apply()
  }

  def create(implicit session: DBSession, hook: WebHook): Try[WebHook] = {
    val id =
      sql"""insert into WebHooks (userId, name, active, lastEvent, url, config)
            values (0, ${hook.name}, ${hook.active}, (select eventId from Events order by eventId desc limit 1), ${hook.url}, ${hook.config.toJson.compactPrint}::jsonb)"""
        .updateAndReturnGeneratedKey().apply()

    val batchParameters = hook.eventTypes.map(eventType => Seq('webhookId -> id, 'eventTypeId -> eventType.value)).toSeq
    sql"""insert into WebHookEvents (webhookId, eventTypeId) values ({webhookId}, {eventTypeId})""".batchByName(batchParameters:_*).apply()

    Success(WebHook(
      id = Some(id.toInt),
      userId = Some(0),
      name = hook.name,
      active = hook.active,
      lastEvent = None, // TODO: include real lastEvent
      url = hook.url,
      eventTypes = Set[EventType](),
      config = WebHookConfig()
    ))
  }

  private def rowToHook(rs: WrappedResultSet): WebHook = WebHook(
    id = Some(rs.int("webhookId")),
    userId = Some(rs.int("userId")),
    name = rs.string("name"),
    active = rs.boolean("active"),
    lastEvent = rs.longOpt("lastEvent"),
    url = rs.string("url"),
    eventTypes = rs.arrayOpt("eventTypes").map(a => a.getArray().asInstanceOf[Array[Integer]].map(EventType.withValue(_)).toSet).getOrElse(Set()),
    config = JsonParser(rs.string("config")).convertTo[WebHookConfig])
}
