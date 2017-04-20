package au.csiro.data61.magda.registry

import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.marshalling.Marshal
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.{HttpMethods, HttpRequest, MessageEntity, Uri}
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.Source
import scalikejdbc._
import spray.json.JsString
import au.csiro.data61.magda.model.Registry._

import scala.concurrent.{ExecutionContext, Future}

class WebHookProcessor(actorSystem: ActorSystem, implicit val executionContext: ExecutionContext) extends Protocols {
  private val http = Http(actorSystem)
  private implicit val materializer: ActorMaterializer = ActorMaterializer()(actorSystem)

  def sendNotifications(): Future[Map[WebHook, WebHookProcessingResult]] = {
    val maxEvents = 100 // TODO: these should be configurable
    val simultaneousInvocations = 6

    Future[List[WebHook]] {
      // Find all WebHooks that need any processing
      DB readOnly { implicit session =>
        val latestEventId = sql"select eventId from Events order by eventId desc limit 1".map(rs => rs.long("eventId")).single.apply().getOrElse(0l)
        HookPersistence.getAll(session).filter(hook => hook.lastEvent.getOrElse(0l) < latestEventId)
      }
    }.flatMap(webHooksToProcess => {
      // Process up to 'webHooksToProcess' in parallel
      Source(webHooksToProcess).mapAsync(simultaneousInvocations)(webHook => {
        // Create a stream of all events this WebHook hasn't seen yet
        val events = EventPersistence.streamEventsSince(webHook.lastEvent.get)

        // Process 'maxEvents' at a time into a payload
        events.grouped(maxEvents).map(events => {
          val relevantEventTypes = webHook.eventTypes

          var changeEvents = events.filter(event => relevantEventTypes.contains(event.eventType))
          val recordChangeEvents = events.filter(event => event.eventType.isRecordEvent || event.eventType.isRecordAspectEvent)
          val aspectDefinitionChangeEvents = events.filter(event => event.eventType.isAspectDefinitionEvent)

          val recordIds = recordChangeEvents.map(_.data.fields("recordId").asInstanceOf[JsString].value).toSet
          val aspectDefinitionIds = aspectDefinitionChangeEvents.map(_.data.fields("aspectId").asInstanceOf[JsString].value)

          // If we're including records, get a complete record with aspects for each record ID
          val records = webHook.config.includeRecords match {
            case Some(false) | None => None
            case Some(true) => DB readOnly { implicit session =>
              // Get records directly modified by these events.
              val directRecords = RecordPersistence.getByIdsWithAspects(
                session,
                recordIds,
                webHook.config.aspects.getOrElse(List()),
                webHook.config.optionalAspects.getOrElse(List()),
                webHook.config.dereference)

              // If we're dereferencing, we also need to include any records that link to
              // changed records from aspects that we're including.
              val recordsFromDereference = webHook.config.dereference match {
                case Some(false) | None => List[Record]()
                case Some(true) => RecordPersistence.getRecordsLinkingToRecordIds(
                  session,
                  recordIds,
                  directRecords.records.map(_.id),
                  webHook.config.aspects.getOrElse(List()),
                  webHook.config.optionalAspects.getOrElse(List()),
                  webHook.config.dereference).records
              }

              Some(directRecords.records ++ recordsFromDereference)
            }
          }

          val aspectDefinitions = webHook.config.includeAspectDefinitions match {
            case Some(false) | None => None
            case Some(true) => DB readOnly { implicit session => Some(AspectPersistence.getByIds(session, aspectDefinitionIds)) }
          }

          WebHookPayload(
            action = "records.changed",
            lastEventId = events.last.id.get,
            events = if (webHook.config.includeEvents.getOrElse(true)) Some(changeEvents.toList) else None,
            records = records.map(_.toList),
            aspectDefinitions = aspectDefinitions.map(_.toList)
          )
        }).mapAsync(1)(payload => {
          // Send one payload at a time
          Marshal(payload).to[MessageEntity].flatMap(entity => {
            http.singleRequest(HttpRequest(
              uri = Uri(webHook.url),
              method = HttpMethods.POST,
              entity = entity
            )).map(response => {
              // TODO: if we don't get a 200 response, we should retry or something
              response.discardEntityBytes()

              // Update this WebHook to indicate these events have been processed.
              DB localTx { session =>
                HookPersistence.setLastEvent(session, webHook.id.get, payload.lastEventId)
              }

              response.status.isSuccess()
            })
          })
        }).runFold(WebHookProcessingResult(0, 0))((results, postResult) => results match {
          // Count successful and failed payload deliveries
          case WebHookProcessingResult(successfulPosts, failedPosts) => if (postResult) WebHookProcessingResult(successfulPosts + 1, failedPosts) else WebHookProcessingResult(successfulPosts, failedPosts + 1)
        }).map(webHook -> _)
      }).runFold(Map[WebHook, WebHookProcessingResult]())((results, webHookResult) => results + webHookResult)
    })
  }
}
