package au.csiro.data61.magda.registry

import io.swagger.annotations.{ApiModel, ApiModelProperty}

import scala.annotation.meta.field

@ApiModel(description = "The response to an asynchronous web hook acknowledgement.")
case class WebHookAcknowledgementResponse(
   @(ApiModelProperty @field)(value = "The ID of the last event successfully received by the listener.  Further notifications will start after this event.", required = true)
   lastEventIdReceived: Long)
