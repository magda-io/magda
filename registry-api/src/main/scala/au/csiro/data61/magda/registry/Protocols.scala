package au.csiro.data61.magda.registry

import gnieh.diffson.FormatException
import spray.json.{DefaultJsonProtocol, JsArray, JsValue, RootJsonFormat}
import gnieh.diffson.sprayJson._

trait Protocols extends DefaultJsonProtocol with DiffsonProtocol {
  implicit val badRequestFormat = jsonFormat1(BadRequest.apply)
  implicit val aspectFormat = jsonFormat3(AspectDefinition.apply)
  implicit val recordFormat = jsonFormat3(Record.apply)
  implicit val recordSummaryFormat = jsonFormat3(RecordSummary.apply)
  implicit val patchAspectDefinitionEventFormat = jsonFormat2(PatchAspectDefinitionEvent.apply)
  implicit val createAspectDefinitionEventFormat = jsonFormat1(CreateAspectDefinitionEvent.apply)
  implicit val createRecordEventFormat = jsonFormat2(CreateRecordEvent.apply)
  implicit val createRecordAspectEventFormat = jsonFormat3(CreateRecordAspectEvent.apply)
  implicit val patchRecordEventFormat = jsonFormat2(PatchRecordEvent.apply)
  implicit val patchRecordAspectEventFormat = jsonFormat3(PatchRecordAspectEvent.apply)
  implicit val recordsPageFormat = jsonFormat3(RecordsPage.apply)
}
