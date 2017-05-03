package au.csiro.data61.magda.registry

import gnieh.diffson.sprayJson._

case class PatchRecordEvent(recordId: String, patch: JsonPatch) extends RecordEvent

object PatchRecordEvent {
  val Id = 3 // from EventTypes table
}
