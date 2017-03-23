package au.csiro.data61.magda.registry

case class RecordsChangedWebHookPayload(
  action: String,
  events: List[RegistryEvent],
  records: List[Record]
)
