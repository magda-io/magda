package au.csiro.data61.magda.indexer

import akka.actor.ActorSystem
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.Directives._
import au.csiro.data61.magda.api.BaseMagdaApi
import au.csiro.data61.magda.indexer.crawler.{Crawler, CrawlerApi}
import au.csiro.data61.magda.indexer.external.registry.WebhookApi
import au.csiro.data61.magda.indexer.search.SearchIndexer
import com.typesafe.config.Config

class IndexerApi(crawler: Crawler, indexer: SearchIndexer)(
    implicit system: ActorSystem,
    config: Config
) extends BaseMagdaApi {
  implicit val ec = system.dispatcher
  override def getLogger = system.log

  val crawlerRoutes = new CrawlerApi(crawler, indexer).routes
  val hookRoutes = new WebhookApi(indexer).routes

  /**
    * @apiDefine GenericError
    * @apiError (Error 500) {String} ResponseBody Respone body will contain further information on the error in free text format.
    */

  val routes =
    magdaRoute {
      pathPrefix("v0") {
        pathPrefix("reindex") {
          crawlerRoutes
        } ~ path("registry-hook") {
          hookRoutes
        } ~ pathPrefix("status") {
          path("live") {
            get {
              complete(StatusCodes.OK, "ok")
            }
          } ~
            // indexer setup job including region indexing work that may take long time (30 mins) depends on config.
            // therefore, you might not want to use this endpoint as k8s readiness probe endpoint
            path("ready") {
              get {
                if (indexer.isReady) {
                  complete(StatusCodes.OK, "ready")
                } else {
                  complete(StatusCodes.ServiceUnavailable, "not ready")
                }
              }
            }
        }
      }
    }
}
