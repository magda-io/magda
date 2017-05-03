package au.csiro.data61.magda.registry

import spray.json.JsObject

case class CreateAspectDefinitionEvent(aspectId: String, name: String, jsonSchema: Option[JsObject])

object CreateAspectDefinitionEvent {
  val Id = 1 // from EventTypes table
}
