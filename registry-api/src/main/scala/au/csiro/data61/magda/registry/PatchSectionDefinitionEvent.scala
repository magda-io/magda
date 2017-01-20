package au.csiro.data61.magda.registry

import gnieh.diffson.sprayJson._

case class PatchSectionDefinitionEvent(sectionID: String, patch: JsonPatch)

object PatchSectionDefinitionEvent {
  val ID = 4 // from EventTypes table
}