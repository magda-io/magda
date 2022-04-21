package au.csiro.data61.magda.indexer

import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.{Directive0}
import au.csiro.data61.magda.client.{
  AuthApiClient,
  AuthDecisionReqConfig,
  RegistryExternalInterface
}
import akka.http.scaladsl.model.StatusCodes.{BadRequest, InternalServerError}
import au.csiro.data61.magda.directives.AuthDirectives.{
  requireUnconditionalAuthDecision
}
import spray.json.{JsObject}
import au.csiro.data61.magda.ServerError
import scala.util.{Failure, Success}

object Directives {

  def requireDatasetPermission(
      authApiClient: AuthApiClient,
      registryInterface: RegistryExternalInterface,
      operationUri: String,
      datasetId: String,
      onDatasetNotFound: Option[() => Directive0] = None
  ): Directive0 =
    (extractLog)
      .tflatMap { t =>
        val log = t._1
        onComplete(registryInterface.getRecordAuthContextData(datasetId))
          .tflatMap {
            case Tuple1(Success(recordContextData)) =>
              requireUnconditionalAuthDecision(
                authApiClient,
                AuthDecisionReqConfig(
                  operationUri = operationUri,
                  input = Some(
                    JsObject(
                      "object" -> JsObject("dataset" -> recordContextData)
                    )
                  )
                )
              ) & pass
            case Tuple1(Failure(e: ServerError)) if e.statusCode == 404 =>
              if (onDatasetNotFound.isDefined) {
                onDatasetNotFound.get()
              } else {
                complete(
                  BadRequest,
                  s"Failed to locate dataset for auth context data creation."
                )
              }
            case Tuple1(Failure(e)) =>
              log.error(
                "Failed to create dataset context data for auth decision. dataset ID: {}. Error: {}",
                datasetId,
                e
              )
              complete(
                InternalServerError,
                s"An error occurred while creating dataset context data for auth decision."
              )
          }
      }

}
