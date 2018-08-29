package au.csiro.data61.magda.indexer.external.registry

import au.csiro.data61.magda.indexer.search.SearchIndexer
import au.csiro.data61.magda.api.BaseMagdaApi
import au.csiro.data61.magda.util.ErrorHandling.CausedBy
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
import au.csiro.data61.magda.model.Registry.EventType
import com.typesafe.config.Config
import akka.stream.scaladsl.Source
import java.time.ZoneOffset
import scala.util.Try
import au.csiro.data61.magda.model.misc.DataSet

class WebhookApi(indexer: SearchIndexer)(implicit system: ActorSystem, config: Config) extends BaseMagdaApi with RegistryConverters {
  implicit val ec = system.dispatcher
  override def getLogger = system.log

  implicit val defaultOffset = ZoneOffset.of(config.getString("time.defaultOffset"))

  /**
  * @apiGroup Indexer
  * @api {post} http://indexer/v0/registry-hook Hook endpoint (internal)
  * 
  * @apiDescription Registry webhook endpoint - accepts webhook payloads from the registry.
  *   This generally means datasets from the registry as they're updated. This shouldn't
  *   be called manually, it's purely for registry use.
  *
  * @apiSuccess (Success 202) {String} Response (blank)
  * @apiUse GenericError
  */
  val routes =
    magdaRoute {
      post {
        entity(as[WebHookPayload]) { payload =>
          val events = payload.events.getOrElse(List())

          val idsToDelete = events.filter(_.eventType == EventType.DeleteRecord)
            .map(event => event.data.getFields("recordId").head.convertTo[String])
            .map(DataSet.registryIdToIdentifier)

          val deleteOp = () => idsToDelete match {
            case Nil  => Future.successful(Unit)
            case list => indexer.delete(list)
          }

          val insertOp = () => payload.records match {
            case None | Some(Nil) => Future.successful(Unit)
            case Some(list) =>
              val dataSets = list.map(record => try {
                Some(convertRegistryDataSet(record))
              } catch {
                case CausedBy(e: spray.json.DeserializationException) =>
                  system.log.error(e, "When converting {}", record.id)
                  None
              })

              indexer.index(Source(dataSets.flatten))
          }

          val future = deleteOp().flatMap(_ => insertOp())

          // The registry should never pass us a deleted record, so we can insert and delete
          // concurrently without the risk of inserting something we just deleted.
          onSuccess(future) { x =>
            complete(Accepted)
          }
        }
      }
    }
}