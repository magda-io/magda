package au.csiro.data61.magda.indexer

import au.csiro.data61.magda.indexer.search.SearchIndexer
import au.csiro.data61.magda.api.BaseMagdaApi
import akka.event.LoggingAdapter
import akka.http.scaladsl.server.Directives._
import scala.util.Failure
import scala.util.Success
import akka.http.scaladsl.model.StatusCodes.{ Accepted, Conflict, OK, NotFound }
import akka.actor.ActorSystem
import scala.concurrent.Future
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import spray.json._
import au.csiro.data61.magda.model.Registry.RegistryConverters
import au.csiro.data61.magda.indexer.crawler.Crawler
import au.csiro.data61.magda.indexer.crawler.CrawlerApi
import com.typesafe.config.Config
import akka.stream.scaladsl.Source
import au.csiro.data61.magda.indexer.external.registry.WebhookApi

class IndexerApi(crawler: Crawler, indexer: SearchIndexer)(implicit system: ActorSystem, config: Config) extends BaseMagdaApi with RegistryConverters {
  implicit val ec = system.dispatcher
  override def getLogger = system.log

  val crawlerRoutes = new CrawlerApi(crawler, indexer).routes
  val hookRoutes = new WebhookApi(indexer).routes

  val routes =
    magdaRoute {
      pathPrefix("v0") {
        pathPrefix("reindex") {
          crawlerRoutes
        } ~ path("registry-hook") {
          hookRoutes
        }
      }
    }
}