package au.csiro.data61.magda.registry

case class WebHookConfig (
  aspects: Option[List[String]] = None,
  optionalAspects: Option[List[String]] = None,
  includeEvents: Option[Boolean] = None,
  includeRecords: Option[Boolean] = None,
  includeAspectDefinitions: Option[Boolean] = None,
  dereference: Option[Boolean] = None
)
