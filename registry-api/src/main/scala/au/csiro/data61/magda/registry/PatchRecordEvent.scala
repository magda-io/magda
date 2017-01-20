package au.csiro.data61.magda.registry

import gnieh.diffson.sprayJson._

case class PatchRecordEvent(recordID: String, patch: JsonPatch)

object PatchRecordEvent {
  val ID = 3 // from EventTypes table
}