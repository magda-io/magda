package au.csiro.data61.magda.registry

/**
  * Event emitted when an aspect definition is deleted (see `AspectPersistence.deleteById`).
  * Mirrors the record-delete event pattern (`DeleteRecordEvent`).
  *
  * The `aspectId` field name is significant: `WebHookProcessor` handles every event for which
  * `EventType.isAspectDefinitionEvent` is true (which now includes this event) by reading
  * `event.data.fields("aspectId")`. The serialized JSON must therefore carry an `aspectId`
  * field. The spray-json format is registered in `Protocols`.
  */
case class DeleteAspectDefinitionEvent(aspectId: String, tenantId: BigInt)

object DeleteAspectDefinitionEvent {
  // Must match EventType.DeleteAspectDefinition (id 7) in magda-scala-common's Registry.scala.
  // That enum entry already existed before this event class was added, so no enum change was needed.
  val Id = 7 // from EventTypes table
}
