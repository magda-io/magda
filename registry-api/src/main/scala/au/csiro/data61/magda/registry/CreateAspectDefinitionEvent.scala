package au.csiro.data61.magda.registry

case class CreateAspectDefinitionEvent(aspect: AspectDefinition)

object CreateAspectDefinitionEvent {
  val Id = 1 // from EventTypes table
}