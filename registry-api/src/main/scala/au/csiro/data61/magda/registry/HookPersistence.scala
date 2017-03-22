package au.csiro.data61.magda.registry

import spray.json._
import gnieh.diffson.sprayJson._
import scalikejdbc._

import scala.util.{Success, Try}

object HookPersistence extends Protocols with DiffsonProtocol {
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
      url = hook.url,
      eventTypes = Set[EventType](),
      config = WebHookConfig()
    ))
  }
}
