package au.csiro.data61.magda.registry

case class CreateRecordEvent(recordId: String, name: String)

object CreateRecordEvent {
  val Id = 0 // from EventTypes table
}
