package au.csiro.data61.magda.registry

import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.marshalling.Marshal
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.{HttpMethods, HttpRequest, MessageEntity, Uri}
import akka.stream.{ActorMaterializer}
import scalikejdbc._
import spray.json.JsString
import au.csiro.data61.magda.model.Registry._

import scala.concurrent.{ExecutionContext, Future}

class WebHookProcessor(actorSystem: ActorSystem, implicit val executionContext: ExecutionContext) extends Protocols {
  private val http = Http(actorSystem)
  private implicit val materializer: ActorMaterializer = ActorMaterializer()(actorSystem)

  def sendSomeNotificationsForOneWebHook(id: String): Future[WebHookProcessingResult] = {
    val maxEvents = 100 // TODO: this should be configurable

    val (webHook, eventPage) = DB readOnly { implicit session =>
      HookPersistence.getById(session, id) match {
        case None => throw new RuntimeException(s"No WebHook with ID ${id} was found.")
        case Some(webHook) => (webHook, EventPersistence.getEvents(session, webHook.lastEvent, None, Some(maxEvents), None, None, None))
      }
    }

    val events = eventPage.events
    val relevantEventTypes = webHook.eventTypes

    val changeEvents = events.filter(event => relevantEventTypes.contains(event.eventType))
    val recordChangeEvents = events.filter(event => event.eventType.isRecordEvent || event.eventType.isRecordAspectEvent)
    val aspectDefinitionChangeEvents = events.filter(event => event.eventType.isAspectDefinitionEvent)

    val recordIds = recordChangeEvents.map(_.data.fields("recordId").asInstanceOf[JsString].value).toSet
    val aspectDefinitionIds = aspectDefinitionChangeEvents.map(_.data.fields("aspectId").asInstanceOf[JsString].value)

    // If we're including records, get a complete record with aspects for each record ID
    val records = webHook.config.includeRecords match {
      case Some(false) | None => None
      case Some(true) => DB readOnly { implicit session =>
        // Get records directly modified by these events.
        val directRecords = if (recordIds.isEmpty) RecordsPage(0, None, List()) else RecordPersistence.getByIdsWithAspects(
          session,
          recordIds,
          webHook.config.aspects.getOrElse(List()),
          webHook.config.optionalAspects.getOrElse(List()),
          webHook.config.dereference)

        // If we're dereferencing, we also need to include any records that link to
        // changed records from aspects that we're including.
        val recordsFromDereference = webHook.config.dereference match {
          case Some(false) | None => List[Record]()
          case Some(true) => if (recordIds.isEmpty) List() else RecordPersistence.getRecordsLinkingToRecordIds(
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

    val payload = WebHookPayload(
      action = "records.changed",
      lastEventId = if (events.isEmpty) webHook.lastEvent.get else events.last.id.get,
      events = if (webHook.config.includeEvents.getOrElse(true)) Some(changeEvents.toList) else None,
      records = records.map(_.toList),
      aspectDefinitions = aspectDefinitions.map(_.toList)
    )

    if (payload.events.getOrElse(List()).nonEmpty || payload.records.getOrElse(List()).nonEmpty || aspectDefinitions.getOrElse(List()).nonEmpty) {
      Marshal(payload).to[MessageEntity].flatMap(entity => {
        http.singleRequest(HttpRequest(
          uri = Uri(webHook.url),
          method = HttpMethods.POST,
          entity = entity
        )).map(response => {
          // If we get an async response, we're done with this webhook for now, but add
          // it back to the list of webhooks to process.
          // If we get any other 2xx, this webhook moves on to the next set of events.
          // On 4xx or 5xx, we retry a few times and eventually give up (for now).

          // TODO: if we don't get a 200 response, we should retry or something
          response.discardEntityBytes()

          // Update this WebHook to indicate these events have been processed.
          DB localTx { session =>
            HookPersistence.setLastEvent(session, webHook.id.get, payload.lastEventId)
          }

          WebHookProcessingResult(webHook.lastEvent.get, payload.lastEventId, Some(response.status))
        })
      })
    } else {
      // Update this WebHook to indicate these events (if any) have been processed.
      if (payload.lastEventId != webHook.lastEvent.get) {
        DB localTx { session =>
          HookPersistence.setLastEvent(session, webHook.id.get, payload.lastEventId)
        }
      }

      Future.successful(WebHookProcessingResult(webHook.lastEvent.get, payload.lastEventId, None))
    }
  }
}
