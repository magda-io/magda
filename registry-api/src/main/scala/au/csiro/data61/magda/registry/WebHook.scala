package au.csiro.data61.magda.registry

import au.csiro.data61.magda.model.Registry._

case class WebHook (
  id: Option[Int],
  userId: Option[Int],
  name: String,
  active: Boolean,
  lastEvent: Option[Long],
  url: String,
  eventTypes: Set[EventType],
  config: WebHookConfig
)
