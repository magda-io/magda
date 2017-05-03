package au.csiro.data61.magda.registry

case class DeleteRecordEvent(recordId: String) extends RecordEvent

object DeleteRecordEvent {
  val Id = 6 // from EventTypes table
}
