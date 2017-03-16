package au.csiro.data61.magda.crawler

import au.csiro.data61.magda.search.SearchIndexer

import au.csiro.data61.magda.api.BaseMagdaApi
import akka.event.LoggingAdapter
import akka.http.scaladsl.server.Directives._
import scala.util.Failure
import scala.util.Success
import akka.http.scaladsl.model.StatusCodes.Accepted
import akka.actor.ActorSystem

class CrawlerApi(crawler: Crawler, indexer: SearchIndexer)(implicit system: ActorSystem) extends BaseMagdaApi {
  implicit val ec = system.dispatcher
  override def getLogger = system.log

  val routes =
    magdaRoute {
      path("/reindex") {
        post {
          val future = crawler.crawl(indexer)

          future.onComplete {
            case Success(_) =>
              getLogger.info("Successfully completed crawl")
            case Failure(e) =>
              getLogger.error(e, "Crawl failed")
          }

          complete(Accepted)
        }
      }
    }
}