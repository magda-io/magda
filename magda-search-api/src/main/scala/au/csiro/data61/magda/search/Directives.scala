package au.csiro.data61.magda.search

import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.Directive1
import au.csiro.data61.magda.client.{AuthApiClient, AuthDecisionReqConfig}
import akka.http.scaladsl.model.StatusCodes.{BadRequest}
import au.csiro.data61.magda.directives.AuthDirectives.{withAuthDecision}
import au.csiro.data61.magda.model.Auth.{AuthDecision}

object Directives {

  def withDatasetReadAuthDecision(
      authApiClient: AuthApiClient,
      publishingStatus: Option[String]
  ): Directive1[AuthDecision] = {
    val datasetType = publishingStatus.getOrElse("*")
    if (!datasetType.matches("^[\\w\\d-_]+$")) {
      complete(BadRequest, s"Invalid publishing status: ${datasetType}")
    } else {
      val operationUrl = s"object/dataset/${datasetType}/read"
      withAuthDecision(authApiClient, AuthDecisionReqConfig(operationUrl))
    }
  }

}
