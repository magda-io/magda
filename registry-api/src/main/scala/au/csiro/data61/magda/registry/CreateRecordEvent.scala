package au.csiro.data61.magda.registry

case class CreateRecordEvent(id: String, name: String)

object CreateRecordEvent {
  val Id = 0 // from EventTypes table
}