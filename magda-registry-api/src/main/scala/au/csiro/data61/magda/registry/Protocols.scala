package au.csiro.data61.magda.registry

import spray.json._
import gnieh.diffson.sprayJson._
import au.csiro.data61.magda.model.Registry.{ RegistryProtocols => CommonRegistryProtocols, Record, RecordSummary, RecordType }

trait Protocols extends DiffsonProtocol with CommonRegistryProtocols {
  implicit val badRequestFormat = jsonFormat1(BadRequest.apply)
  implicit val recordsPageFormat = jsonFormat3(RecordsPage.apply[Record])
  implicit val recordSummariesPageFormat = jsonFormat3(RecordsPage.apply[RecordSummary])
  implicit val recordSummariesPageFormat2 = jsonFormat3(RecordsPage.apply[RecordType])
  implicit val patchAspectDefinitionEventFormat = jsonFormat2(PatchAspectDefinitionEvent.apply)
  implicit val createAspectDefinitionEventFormat = jsonFormat3(CreateAspectDefinitionEvent.apply)
  implicit val createRecordEventFormat = jsonFormat2(CreateRecordEvent.apply)
  implicit val createRecordAspectEventFormat = jsonFormat3(CreateRecordAspectEvent.apply)
  implicit val deleteRecordAspectEventFormat = jsonFormat2(DeleteRecordAspectEvent.apply)
  implicit val patchRecordEventFormat = jsonFormat2(PatchRecordEvent.apply)
  implicit val patchRecordAspectEventFormat = jsonFormat3(PatchRecordAspectEvent.apply)
  implicit val deleteRecordEventFormat = jsonFormat1(DeleteRecordEvent.apply)
  implicit val deleteResultFormat = jsonFormat1(DeleteResult.apply)
  implicit val multipleDeleteResultFormat = jsonFormat1(MultipleDeleteResult.apply)
  implicit val eventsPageFormat = jsonFormat3(EventsPage.apply)
  implicit val webHookResponseFormat = jsonFormat1(WebHookResponse.apply)
  implicit val countResponseFormat = jsonFormat1(CountResponse.apply)
}
