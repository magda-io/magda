package au.csiro.data61.magda.registry

import io.swagger.annotations.{ApiModel, ApiModelProperty}

import scala.annotation.meta.field

@ApiModel(description = "Asynchronously acknowledges receipt of a web hook notification.")
case class WebHookAcknowledgement(
  @(ApiModelProperty @field)(value = "True if the web hook was received successfully and the listener is ready for further notifications.  False if the web hook was not received and the same notification should be repeated.", required = true)
  succeeded: Boolean,

  @(ApiModelProperty @field)(value = "The ID of the last event received by the listener.  This should be the value of the `lastEventId` property of the web hook payload that is being acknowledged.  This value is ignored if `succeeded` is false.", required = true)
  lastEventIdReceived: Long)
