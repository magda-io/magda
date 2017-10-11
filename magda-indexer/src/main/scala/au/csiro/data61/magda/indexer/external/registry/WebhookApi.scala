package au.csiro.data61.magda.indexer.external.registry

import au.csiro.data61.magda.indexer.search.SearchIndexer
import au.csiro.data61.magda.api.BaseMagdaApi
import au.csiro.data61.magda.model.Registry.WebHookPayload
import akka.event.LoggingAdapter
import akka.http.scaladsl.server.Directives._
import scala.util.Failure
import scala.util.Success
import akka.http.scaladsl.model.StatusCodes.{ Accepted, Conflict, OK, BadRequest }
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
import java.time.ZoneOffset

class WebhookApi(indexer: SearchIndexer)(implicit system: ActorSystem, config: Config) extends BaseMagdaApi with RegistryConverters {
  implicit val ec = system.dispatcher
  override def getLogger = system.log

  implicit val defaultOffset = ZoneOffset.of(config.getString("time.defaultOffset"))

  val routes =
    magdaRoute {
      post {
        entity(as[WebHookPayload]) { payload =>
          payload.records match {
            // TODO: Handle registry config not found
            case Some(records) =>
              val dataSets = records.map(record => convertRegistryDataSet(record))

              onSuccess(indexer.index(Source(dataSets))) { result =>
                complete(Accepted)
              }
            case None =>
              getLogger.error("Recieved webhook payload with no records")
              complete(BadRequest, "Needs records")
          }
        }
      }
    }
}