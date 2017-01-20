package au.csiro.data61.magda.registry

import io.swagger.annotations.{ApiModel, ApiModelProperty}
import spray.json.{JsObject, JsValue}

import scala.annotation.meta.field

@ApiModel(description = "A record in the registry, usually including data for one or more sections.")
case class Record(
  @(ApiModelProperty @field)(value = "The unique identifier of the record", required = true)
  id: String,

  @(ApiModelProperty @field)(value = "The name of the record", required = true)
  name: String,

  @(ApiModelProperty @field)(value = "The sections included in this record", required = true)
  sections: Map[String, JsObject]
)
