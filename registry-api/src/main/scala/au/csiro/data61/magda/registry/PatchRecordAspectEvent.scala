package au.csiro.data61.magda.registry

import gnieh.diffson.sprayJson._

case class PatchRecordAspectEvent(recordId: String, aspectId: String, patch: JsonPatch)

object PatchRecordAspectEvent {
  val Id = 5 // from EventTypes table
}