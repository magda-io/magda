package au.csiro.data61.magda.external.registry

import spray.json.{DefaultJsonProtocol, JsObject}

case class RegistryRecordsResponse(
  totalCount: Long,
  nextPageToken: Option[String],
  records: List[RegistryRecord])

case class RegistryRecord(
  id: String,
  name: String,
  aspects: Map[String, JsObject]
)

trait RegistryProtocols extends DefaultJsonProtocol {
  implicit val registryRecordFormat = jsonFormat3(RegistryRecord.apply)
  implicit val registryRecordsResponseFormat = jsonFormat3(RegistryRecordsResponse.apply)
}
