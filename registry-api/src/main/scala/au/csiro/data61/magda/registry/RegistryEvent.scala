package au.csiro.data61.magda.registry

import java.time.OffsetDateTime

import spray.json.JsObject

case class RegistryEvent(
  id: Option[Long],
  eventTime: Option[OffsetDateTime],
  eventType: EventType,
  userId: Int,
  data: JsObject
)
