package au.csiro.data61.magda.indexer

import akka.actor.ActorSystem
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.Directives._
import au.csiro.data61.magda.api.BaseMagdaApi
import au.csiro.data61.magda.client.{AuthApiClient, RegistryExternalInterface}
import au.csiro.data61.magda.indexer.crawler.{Crawler, CrawlerApi}
import au.csiro.data61.magda.indexer.external.registry.WebhookApi
import au.csiro.data61.magda.indexer.external.registry.DatasetApi
import au.csiro.data61.magda.indexer.search.SearchIndexer
import com.typesafe.config.Config
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import spray.json.{JsFalse, JsObject, JsTrue}

class IndexerApi(
    crawler: Crawler,
    indexer: SearchIndexer,
    authApiClient: AuthApiClient,
    registryInterface: RegistryExternalInterface
)(
    implicit system: ActorSystem,
    config: Config
) extends BaseMagdaApi
    with Protocols {
  implicit val ec = system.dispatcher
  override def getLogger = system.log

  val crawlerRoutes = new CrawlerApi(crawler, indexer, authApiClient).routes
  val hookRoutes = new WebhookApi(indexer, registryInterface).routes

  val datasetRoutes =
    new DatasetApi(indexer, authApiClient, registryInterface).routes

  /**
    * @apiDefine GenericError
    * @apiError (Error 500) {String} ResponseBody Respone body will contain further information on the error in free text format.
    */

  val routes =
    magdaRoute {
      pathPrefix("v0") {
        pathPrefix("dataset") {
          datasetRoutes
        } ~
          pathPrefix("reindex") {
            crawlerRoutes
          } ~ path("registry-hook") {
          hookRoutes
        } ~ pathPrefix("status") {
          path("live") {
            get {
              complete(StatusCodes.OK, JsObject("live" -> JsTrue))
            }
          } ~
            // indexer setup job including region indexing work that may take long time (30 mins) depends on config.
            // therefore, you might not want to use this endpoint as k8s readiness probe endpoint
            path("ready") {
              get {
                if (indexer.isReady) {
                  complete(
                    StatusCodes.OK,
                    JsObject("ready" -> JsTrue)
                  )
                } else {
                  complete(StatusCodes.ServiceUnavailable, "not ready")
                }
              }
            }
        }
      }
    }
}
