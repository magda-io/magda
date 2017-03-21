package au.csiro.data61.magda.crawler

import au.csiro.data61.magda.search.SearchIndexer

import au.csiro.data61.magda.api.BaseMagdaApi
import akka.event.LoggingAdapter
import akka.http.scaladsl.server.Directives._
import scala.util.Failure
import scala.util.Success
import akka.http.scaladsl.model.StatusCodes.{ Accepted, Conflict, OK }
import akka.actor.ActorSystem
import scala.concurrent.Future

class CrawlerApi(crawler: Crawler, indexer: SearchIndexer)(implicit system: ActorSystem) extends BaseMagdaApi {
  implicit val ec = system.dispatcher
  override def getLogger = system.log

  var lastCrawl: Option[Future[Unit]] = None

  def crawlInProgress: Boolean = lastCrawl.map(!_.isCompleted).getOrElse(false)

  val routes =
    magdaRoute {
      pathPrefix("reindex") {
        path("in-progress") {
          get {
            complete(OK, (!crawlInProgress).toString)
          }
        } ~
          post {
            if (!crawlInProgress) {
              lastCrawl = Some(crawler.crawl(indexer))
              val future = lastCrawl.get

              future.onComplete {
                case Success(_) =>
                  getLogger.info("Successfully completed crawl")
                case Failure(e) =>
                  getLogger.error(e, "Crawl failed")
              }

              complete(Accepted)
            } else {
              complete(Conflict, "Reindex in progress")
            }
          }
      }
    }
}