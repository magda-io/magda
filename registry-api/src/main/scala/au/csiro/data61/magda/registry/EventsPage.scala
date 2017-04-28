package au.csiro.data61.magda.registry

import io.swagger.annotations.{ApiModel, ApiModelProperty}
import au.csiro.data61.magda.model.Registry._

import scala.annotation.meta.field

@ApiModel(description = "A page of events.")
case class EventsPage(
  @(ApiModelProperty @field)(value = "The total number of events available.", required = true)
  totalCount: Int,

  @(ApiModelProperty @field)(value = "A token to be used to get the next page of events.", required = true)
  nextPageToken: Option[String],

  @(ApiModelProperty @field)(value = "The events in this page.", required = true)
  events: List[RegistryEvent]
)
