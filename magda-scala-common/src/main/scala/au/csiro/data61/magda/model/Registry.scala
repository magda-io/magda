package au.csiro.data61.magda.model

import io.swagger.annotations.{ ApiModel, ApiModelProperty }
import enumeratum.values.{ IntEnum, IntEnumEntry }

import scala.annotation.meta.field
import spray.json.{ DefaultJsonProtocol, JsNumber, JsObject, JsString, JsValue, RootJsonFormat }
import java.time.OffsetDateTime

object Registry {
  @ApiModel(description = "A type of aspect in the registry.")
  case class AspectDefinition(
    @(ApiModelProperty @field)(value = "The unique identifier for the aspect type.", required = true) id: String,

    @(ApiModelProperty @field)(value = "The name of the aspect.", required = true) name: String,

    @(ApiModelProperty @field)(value = "The JSON Schema of this aspect.", required = false, dataType = "object") jsonSchema: Option[JsObject])

  case class WebHookPayload(
    action: String,
    lastEventId: Long,
    events: Option[List[RegistryEvent]],
    records: Option[List[Record]],
    aspectDefinitions: Option[List[AspectDefinition]])

  case class RegistryEvent(
    id: Option[Long],
    eventTime: Option[OffsetDateTime],
    eventType: EventType,
    userId: Int,
    data: JsObject)

  @ApiModel(description = "A record in the registry, usually including data for one or more aspects.")
  case class Record(
    @(ApiModelProperty @field)(value = "The unique identifier of the record", required = true) id: String,

    @(ApiModelProperty @field)(value = "The name of the record", required = true) name: String,

    @(ApiModelProperty @field)(value = "The aspects included in this record", required = true, dataType = "object") aspects: Map[String, JsObject])

  // This is used for the Swagger documentation, but not in the code.
  @ApiModel(description = "The JSON data for an aspect of a record.")
  case class Aspect()

  @ApiModel(description = "The type of a registry modification event.")
  sealed abstract class EventType(val value: Int, val name: String) extends IntEnumEntry {
    def isRecordEvent = this == EventType.CreateRecord || this == EventType.DeleteRecord || this == EventType.PatchRecord
    def isAspectDefinitionEvent = this == EventType.CreateAspectDefinition || this == EventType.PatchAspectDefinition || this == EventType.DeleteAspectDefinition
    def isRecordAspectEvent = this == EventType.CreateRecordAspect || this == EventType.DeleteRecordAspect || this == EventType.PatchRecordAspect
    def isCreateEvent = this == EventType.CreateRecord || this == EventType.CreateRecordAspect || this == EventType.CreateAspectDefinition
    def isDeleteEvent = this == EventType.DeleteRecord || this == EventType.DeleteRecordAspect || this == EventType.DeleteAspectDefinition
    def isPatchEvent = this == EventType.PatchRecord || this == EventType.PatchRecordAspect || this == EventType.PatchAspectDefinition
  }

  case class WebHook(
    id: Option[String] = None,
    userId: Option[Int],
    name: String,
    active: Boolean,
    lastEvent: Option[Long] = None,
    url: String,
    eventTypes: Set[EventType],
    config: WebHookConfig)

  case class WebHookConfig(
    aspects: Option[List[String]] = None,
    optionalAspects: Option[List[String]] = None,
    includeEvents: Option[Boolean] = None,
    includeRecords: Option[Boolean] = None,
    includeAspectDefinitions: Option[Boolean] = None,
    dereference: Option[Boolean] = None)

  case object EventType extends IntEnum[EventType] {
    case object CreateRecord extends EventType(0, "Create Record")
    case object CreateAspectDefinition extends EventType(1, "Create Aspect Definition")
    case object CreateRecordAspect extends EventType(2, "Create Record Aspect")
    case object PatchRecord extends EventType(3, "Patch Record")
    case object PatchAspectDefinition extends EventType(4, "Patch Aspect Definition")
    case object PatchRecordAspect extends EventType(5, "Patch Record Aspect")
    case object DeleteRecord extends EventType(6, "Delete Record")
    case object DeleteAspectDefinition extends EventType(7, "Delete Aspect Definition")
    case object DeleteRecordAspect extends EventType(8, "Delete Record Aspect")

    val values = findValues
  }

  trait Protocols extends DefaultJsonProtocol with au.csiro.data61.magda.model.Temporal.Protocols {
    implicit object EventTypeFormat extends RootJsonFormat[EventType] {
      def write(e: EventType) = JsString(e.toString)
      def read(value: JsValue) = EventType.values.find(e => e.toString == value.asInstanceOf[JsString].value).get
    }

    implicit val recordFormat = jsonFormat3(Record.apply)
    implicit val registryEventFormat = jsonFormat5(RegistryEvent.apply)
    implicit val aspectFormat = jsonFormat3(AspectDefinition.apply)
    implicit val webHookPayloadFormat = jsonFormat5(WebHookPayload.apply)
    implicit val webHookConfigFormat = jsonFormat6(WebHookConfig.apply)
    implicit val webHookFormat = jsonFormat8(WebHook.apply)
  }
}
