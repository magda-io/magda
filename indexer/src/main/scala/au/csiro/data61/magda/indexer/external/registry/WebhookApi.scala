package au.csiro.data61.magda.indexer.external.registry

import au.csiro.data61.magda.indexer.search.SearchIndexer
import au.csiro.data61.magda.api.BaseMagdaApi
import au.csiro.data61.magda.model.Registry.RecordsChangedWebHookPayload
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
import au.csiro.data61.magda.model.Registry.{ Protocols => RegistryProtocols }
import au.csiro.data61.magda.indexer.crawler.Crawler
import au.csiro.data61.magda.indexer.crawler.CrawlerApi
import au.csiro.data61.magda.indexer.external.InterfaceConfig
import com.typesafe.config.Config
import au.csiro.data61.magda.indexer.external.registry.RegistryConverters
import akka.stream.scaladsl.Source

class WebhookApi(indexer: SearchIndexer)(implicit system: ActorSystem, config: Config) extends BaseMagdaApi with RegistryProtocols {
  implicit val ec = system.dispatcher
  override def getLogger = system.log

  val registryConfig = InterfaceConfig.all.get("registry")

  val routes =
    magdaRoute {
      post {
        entity(as[RecordsChangedWebHookPayload]) { payload =>
          payload.records match {
            // TODO: Handle registry config not found
            case Some(records) =>
              val dataSets = records.map(record => RegistryConverters.registryDataSetConv(registryConfig.get)(record))

              onSuccess(indexer.index(registryConfig.get, Source(dataSets))) { result =>
                complete(Accepted)
              }
            case None => complete(BadRequest, "Needs records")
          }
        }
      }
    }
}