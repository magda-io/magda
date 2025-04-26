package au.csiro.data61.magda.indexer.external.registry

import java.time.ZoneOffset
import akka.actor.ActorSystem
import akka.event.LoggingAdapter
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.{
  Accepted,
  Created,
  InternalServerError
}
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.Route
import akka.stream.scaladsl.Source
import au.csiro.data61.magda.api.BaseMagdaApi
import au.csiro.data61.magda.indexer.search.SearchIndexer
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.model.TenantId.{SpecifiedTenantId}
import au.csiro.data61.magda.util.ErrorHandling.CausedBy
import com.typesafe.config.Config
import au.csiro.data61.magda.client.{Conversions, RegistryExternalInterface}
import au.csiro.data61.magda.util.Collections.mapCatching

import scala.util.{Failure, Success}
import scala.concurrent.{ExecutionContextExecutor, Future}
import spray.json.{JsFalse, JsObject, JsString, JsTrue}

class WebhookApi(
    indexer: SearchIndexer,
    registryInterface: RegistryExternalInterface
)(
    implicit system: ActorSystem,
    config: Config
) extends BaseMagdaApi {
  implicit val ec: ExecutionContextExecutor = system.dispatcher
  override def getLogger: LoggingAdapter = system.log

  implicit val defaultOffset: ZoneOffset =
    ZoneOffset.of(config.getString("time.defaultOffset"))

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
  val routes: Route =
    magdaRoute {
      post {
        // In the current implementation, the magda registry will post max of 100 events at a time
        // (au.csiro.data61.magda.registry.WebHookActor.SingleWebHookActor.MAX_EVENTS). It is
        // possible that the payload length exceeds the default max of 8388608 bytes, causing an
        // EntityStreamSizeException to occur. If that is the case, either uncomment the following
        // line or reduce the max number of post events.

//        withoutSizeLimit

        entity(as[WebHookPayload]) { payload =>
          val events = payload.events.getOrElse(List())
          val idsToDelete = events
            .filter(_.eventType == EventType.DeleteRecord)
            .map(
              event =>
                DataSet.uniqueEsDocumentId(
                  event.data.getFields("recordId").head.convertTo[String],
                  event.tenantId
                )
            )

          val deleteOp = () =>
            idsToDelete match {
              case Nil => Future.successful(Unit)
              case list =>
                indexer.delete(list)
            }

          val insertOp = () =>
            payload.records match {
              case None | Some(Nil) => Future.successful(Unit)
              case Some(list) =>
                val dataSets = mapCatching[Record, DataSet](
                  list,
                  record =>
                    Conversions
                      .convertRegistryDataSet(record, Some(system.log)), {
                    (e, item) =>
                      system.log
                        .error(e, "Could not parse item: {}", item.toString)
                  }
                )

                indexer.index(Source(dataSets))
            }

          val future = deleteOp().flatMap(_ => insertOp())

          // The registry should never pass us a deleted record, so we can insert and delete
          // concurrently without the risk of inserting something we just deleted.

          val webhookId = config.getString("registry.webhookId")
          val wantsAsync = config.getBoolean("indexer.asyncWebhook")
          val hasUrl = payload.deferredResponseUrl.nonEmpty

          if (wantsAsync && !hasUrl) {
            getLogger.warning(
              "No deferred response url provided – reverting to synchronous mode."
            )
          }

          if (wantsAsync && hasUrl) {
            future.onComplete {
              case Success(_) =>
                registryInterface.ackWebhook(
                  webhookId,
                  WebHookAcknowledgement(
                    succeeded = true,
                    lastEventIdReceived = Some(payload.lastEventId)
                  )
                )
              case Failure(e) =>
                registryInterface.ackWebhook(
                  webhookId,
                  WebHookAcknowledgement(
                    succeeded = false
                  )
                )
            }
            complete(
              Created,
              JsObject(
                "status" -> JsString("Working"),
                "deferResponse" -> JsTrue
              )
            )
          } else {
            onComplete(future) {
              case Success(_) =>
                complete(Accepted)

              case Failure(ex) =>
                complete(InternalServerError, "Indexing failed")
            }
          }
        }
      }
    }
}
