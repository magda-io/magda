package au.csiro.data61.magda.registry

case class CreateRecordEvent(
    recordId: String,
    tenantId: BigInt,
    name: String,
    authnReadPolicyId: Option[String]
) extends RecordEvent

object CreateRecordEvent {
  val Id = 0 // from EventTypes table
}
