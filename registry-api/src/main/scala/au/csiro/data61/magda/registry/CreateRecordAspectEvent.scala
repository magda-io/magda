package au.csiro.data61.magda.registry

import spray.json.JsObject

case class CreateRecordAspectEvent(recordId: String, aspectId: String, aspect: JsObject) extends RecordEvent

object CreateRecordAspectEvent {
  val Id = 2 // from EventTypes table
}
