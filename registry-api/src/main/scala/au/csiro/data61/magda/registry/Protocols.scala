package au.csiro.data61.magda.registry

import spray.json.{DefaultJsonProtocol, JsNumber, JsValue, RootJsonFormat}
import gnieh.diffson.sprayJson._

trait Protocols extends DefaultJsonProtocol with DiffsonProtocol with au.csiro.data61.magda.model.temporal.Protocols {
  implicit object EventTypeFormat extends RootJsonFormat[EventType] {
    def write(e: EventType) = JsNumber(e.value)
    def read(value: JsValue) = EventType.withValue(value.asInstanceOf[JsNumber].value.toInt)
  }

  implicit val badRequestFormat = jsonFormat1(BadRequest.apply)
  implicit val aspectFormat = jsonFormat3(AspectDefinition.apply)
  implicit val recordFormat = jsonFormat3(Record.apply)
  implicit val recordSummaryFormat = jsonFormat3(RecordSummary.apply)
  implicit val patchAspectDefinitionEventFormat = jsonFormat2(PatchAspectDefinitionEvent.apply)
  implicit val createAspectDefinitionEventFormat = jsonFormat1(CreateAspectDefinitionEvent.apply)
  implicit val createRecordEventFormat = jsonFormat2(CreateRecordEvent.apply)
  implicit val createRecordAspectEventFormat = jsonFormat3(CreateRecordAspectEvent.apply)
  implicit val deleteRecordAspectEventFormat = jsonFormat2(DeleteRecordAspectEvent.apply)
  implicit val patchRecordEventFormat = jsonFormat2(PatchRecordEvent.apply)
  implicit val patchRecordAspectEventFormat = jsonFormat3(PatchRecordAspectEvent.apply)
  implicit val recordsPageFormat = jsonFormat3(RecordsPage.apply)
  implicit val recordSummariesPageFormat = jsonFormat3(RecordSummariesPage.apply)
  implicit val deleteResultFormat = jsonFormat1(DeleteResult.apply)
  implicit val webHookConfigFormat = jsonFormat1(WebHookConfig.apply)
  implicit val webHookFormat = jsonFormat8(WebHook.apply)
  implicit val registryEventFormat = jsonFormat5(RegistryEvent.apply)
  implicit val recordsChangedWebHookPayloadFormat = jsonFormat4(RecordsChangedWebHookPayload.apply)
}
