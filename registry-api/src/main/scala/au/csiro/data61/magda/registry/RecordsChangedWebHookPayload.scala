package au.csiro.data61.magda.registry

case class RecordsChangedWebHookPayload(
  action: String,
  lastEventId: Long,
  events: List[RegistryEvent],
  records: List[Record]
)
