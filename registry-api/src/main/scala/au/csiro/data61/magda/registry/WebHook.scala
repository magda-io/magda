package au.csiro.data61.magda.registry

import spray.json.JsObject

case class WebHook (
  id: Option[Int],
  userId: Option[Int],
  name: String,
  active: Boolean,
  url: String,
  eventTypes: Set[EventType],
  config: WebHookConfig
)
