package au.csiro.data61.magda.indexer.external.registry

import java.time.ZoneOffset
import akka.actor.ActorSystem
import akka.event.LoggingAdapter
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.Route
import akka.stream.scaladsl.Source
import au.csiro.data61.magda.api.BaseMagdaApi
import au.csiro.data61.magda.indexer.search.SearchIndexer
import com.typesafe.config.Config
import au.csiro.data61.magda.client.{
  AuthApiClient,
  Conversions,
  RegistryExternalInterface
}
import au.csiro.data61.magda.indexer.Directives.requireDatasetPermission
import akka.http.scaladsl.model.StatusCodes
import spray.json.{JsFalse, JsObject, JsTrue}

import scala.concurrent.{ExecutionContextExecutor}
import scala.util.{Failure, Success}
import au.csiro.data61.magda.indexer.Protocols
import au.csiro.data61.magda.search.elasticsearch.Indices

class DatasetApi(
    indexer: SearchIndexer,
    authApiClient: AuthApiClient,
    registryInterface: RegistryExternalInterface
)(
    implicit system: ActorSystem,
    config: Config
) extends BaseMagdaApi
    with Protocols {
  implicit val ec: ExecutionContextExecutor = system.dispatcher
  override def getLogger: LoggingAdapter = system.log

  implicit val defaultOffset: ZoneOffset =
    ZoneOffset.of(config.getString("time.defaultOffset"))

  /**
    * @apiGroup Indexer
    * @api {delete} http://indexer/v0/dataset/{datasetId} delete a dataset from the index
    *
    * @apiDescription Delete a dataset from the search engine index.
    * This API will also refresh the dataset index to make sure the changes available for search.
    *
    * @apiSuccess (Success 200) {json} A Json object indicate the deletion result
    * @apiSuccessExample {json} Response:
    * {
    *   "deleted": true
    * }
    * @apiUse GenericError
    */
  def deleteById: Route =
    magdaRoute {
      delete {
        path(Segment) { datasetId: String =>
          requireDatasetPermission(
            authApiClient,
            registryInterface,
            "object/dataset/delete",
            datasetId,
            // when the record doesn't not exist, we respond 200 with isDeleted = false
            onDatasetNotFound = Some(
              () =>
                complete(StatusCodes.OK, JsObject(Map("deleted" -> JsFalse)))
            )
          ) {
            onComplete(indexer.delete(List(datasetId)).flatMap { result =>
              indexer.refreshIndex(Indices.DataSetsIndex).map(_ => result)
            }) {
              case Success(_) =>
                complete(StatusCodes.OK, JsObject(Map("deleted" -> JsTrue)))
              case Failure(e) =>
                complete(
                  StatusCodes.InternalServerError,
                  s"Failed to delete dataset ${datasetId} from index: ${e}"
                )
            }
          }

        }
      }
    }

  /**
    * @apiGroup Indexer
    * @api {put} http://indexer/v0/dataset/{datasetId} reindex a dataset by ID
    *
    * @apiDescription Ask indexer to re-pull dataset data from registry and index into search engine index.
    * You only need to call this API when you want the changes of the datasets to go into search engine index immediately
    * without any delay of webhook system.
    * This API will also refresh the dataset index to make sure the changes available for search.
    *
    * @apiSuccess (Success 200) {json} A Json object indicate the deletion result
    * @apiSuccessExample {json} Response:
    * {
    *   "successes": 1,
    *   "failures": 0,
    *   "warns": 0,
    *   "failureReasons": [],
    *   "warnReasons": []
    * }
    * @apiUse GenericError
    */
  def indexById: Route =
    magdaRoute {
      put {
        path(Segment) { datasetId: String =>
          requireDatasetPermission(
            authApiClient,
            registryInterface,
            "object/dataset/update",
            datasetId,
            // when the record doesn't not exist, we respond 404 to indicate the dataset can't be found
            onDatasetNotFound = Some(
              () =>
                complete(
                  StatusCodes.NotFound,
                  JsObject(Map("deleted" -> JsFalse))
                )
            )
          ) {
            onComplete(
              registryInterface
                .getRecordById(datasetId)
                .flatMap { record =>
                  val dataSet = Conversions
                    .convertRegistryDataSet(record, Some(getLogger))
                  indexer.index(Source(List(dataSet)))
                }
                .flatMap { result =>
                  indexer.refreshIndex(Indices.DataSetsIndex).map(_ => result)
                }
            ) {
              case Success(indexResult) =>
                complete(StatusCodes.OK, indexResult)
              case Failure(e) =>
                complete(
                  StatusCodes.InternalServerError,
                  s"Failed to index dataset ${datasetId}: ${e}"
                )
            }
          }

        }
      }
    }

  val routes = deleteById ~ indexById
}
