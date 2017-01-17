package au.csiro.data61.magda.registry

import spray.json.JsObject

case class CreateRecordSectionEvent(recordID: String, sectionID: String, section: JsObject)

object CreateRecordSectionEvent {
  val ID = 2 // from EventTypes table
}