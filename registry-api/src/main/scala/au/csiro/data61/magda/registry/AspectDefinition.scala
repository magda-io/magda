package au.csiro.data61.magda.registry

import io.swagger.annotations.{ApiModel, ApiModelProperty}
import spray.json.JsObject

import scala.annotation.meta.field

@ApiModel(description = "A type of aspect in the registry.")
case class AspectDefinition(
  @(ApiModelProperty @field)(value = "The unique identifier for the aspect type.", required = true)
  id: String,

  @(ApiModelProperty @field)(value = "The name of the aspect.", required = true)
  name: String,

  @(ApiModelProperty @field)(value = "The JSON Schema of this aspect.", required = false, dataType = "object")
  jsonSchema: Option[JsObject])
