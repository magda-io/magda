package au.csiro.data61.magda.registry

case class CreateSectionDefinitionEvent(section: Section)

object CreateSectionDefinitionEvent {
  val ID = 1 // from EventTypes table
}