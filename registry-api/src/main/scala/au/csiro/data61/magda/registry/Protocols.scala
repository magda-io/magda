package au.csiro.data61.magda.registry

import spray.json._
import au.csiro.data61.magda.model.Registry._
import gnieh.diffson.sprayJson._
import au.csiro.data61.magda.model.Registry.{ Protocols => CommonRegistryProtocols }
import au.csiro.data61.magda.registry.DeleteResult
import au.csiro.data61.magda.registry.BadRequest

trait Protocols extends DefaultJsonProtocol with DiffsonProtocol with au.csiro.data61.magda.model.Temporal.Protocols with CommonRegistryProtocols {

  implicit val badRequestFormat = jsonFormat1(BadRequest.apply)
  implicit val recordSummaryFormat = jsonFormat3(RecordSummary.apply)
  implicit val patchAspectDefinitionEventFormat = jsonFormat2(PatchAspectDefinitionEvent.apply)
  implicit val createAspectDefinitionEventFormat = jsonFormat3(CreateAspectDefinitionEvent.apply)
  implicit val createRecordEventFormat = jsonFormat2(CreateRecordEvent.apply)
  implicit val createRecordAspectEventFormat = jsonFormat3(CreateRecordAspectEvent.apply)
  implicit val deleteRecordAspectEventFormat = jsonFormat2(DeleteRecordAspectEvent.apply)
  implicit val patchRecordEventFormat = jsonFormat2(PatchRecordEvent.apply)
  implicit val patchRecordAspectEventFormat = jsonFormat3(PatchRecordAspectEvent.apply)
  implicit val recordsPageFormat = jsonFormat3(RecordsPage.apply)
  implicit val recordSummariesPageFormat = jsonFormat3(RecordSummariesPage.apply)
  implicit val deleteResultFormat = jsonFormat1(DeleteResult.apply)
  implicit val webHookConfigFormat = jsonFormat6(WebHookConfig.apply)
  implicit val webHookFormat = jsonFormat8(WebHook.apply)
  implicit val eventsPageFormat = jsonFormat3(EventsPage.apply)
}
