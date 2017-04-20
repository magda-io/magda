package au.csiro.data61.magda.registry

case class WebHookPayload(
  action: String,
  lastEventId: Long,
  events: Option[List[RegistryEvent]],
  records: Option[List[Record]],
  aspectDefinitions: Option[List[AspectDefinition]]
)
