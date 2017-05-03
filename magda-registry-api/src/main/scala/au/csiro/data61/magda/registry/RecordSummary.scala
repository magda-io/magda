package au.csiro.data61.magda.registry

import io.swagger.annotations.{ApiModel, ApiModelProperty}

import scala.annotation.meta.field

@ApiModel(description = "A summary of a record in the registry.  Summaries specify which aspects are available, but do not include data for any aspects.")
case class RecordSummary(
  @(ApiModelProperty @field)(value = "The unique identifier of the record", required = true)
  id: String,

  @(ApiModelProperty @field)(value = "The name of the record", required = true)
  name: String,

  @(ApiModelProperty @field)(value = "The list of aspect IDs for which this record has data", required = true)
  aspects: List[String]
)