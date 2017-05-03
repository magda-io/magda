package au.csiro.data61.magda.registry

import io.swagger.annotations.{ApiModel, ApiModelProperty}

import scala.annotation.meta.field

@ApiModel(description = "A page of record summaries.")
case class RecordSummariesPage(
  @(ApiModelProperty @field)(value = "The total number of record summaries available.", required = true)
  totalCount: Int,

  @(ApiModelProperty @field)(value = "A token to be used to get the next page of record summaries.", required = true)
  nextPageToken: Option[String],

  @(ApiModelProperty @field)(value = "The record summaries in this page.", required = true)
  records: List[RecordSummary]
)
