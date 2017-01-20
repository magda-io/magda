package au.csiro.data61.magda.registry

import io.swagger.annotations.{ApiModel, ApiModelProperty}
import spray.json.JsObject

import scala.annotation.meta.field

@ApiModel(description = "A section in a record in the registry.")
case class Section(
  @(ApiModelProperty @field)(value = "The unique identifier for the section.", required = true)
  id: String,

  @(ApiModelProperty @field)(value = "The name of the section.", required = true)
  name: String,

  @(ApiModelProperty @field)(value = "The JSON Schema of this section.", required = false, dataType = "object")
  jsonSchema: Option[JsObject])
