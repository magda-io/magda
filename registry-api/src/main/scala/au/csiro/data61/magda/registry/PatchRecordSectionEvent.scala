package au.csiro.data61.magda.registry

import gnieh.diffson.sprayJson._

case class PatchRecordSectionEvent(recordID: String, sectionID: String, patch: JsonPatch)

object PatchRecordSectionEvent {
  val ID = 5 // from EventTypes table
}