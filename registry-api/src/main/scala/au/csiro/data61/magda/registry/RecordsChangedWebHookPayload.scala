package au.csiro.data61.magda.registry

case class RecordsChangedWebHookPayload(
  action: String,
  lastEventId: Long,
  events: Option[List[RegistryEvent]],
  records: Option[List[Record]]
)
