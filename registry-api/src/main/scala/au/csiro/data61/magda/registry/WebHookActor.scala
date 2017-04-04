package au.csiro.data61.magda.registry

import akka.actor.{Actor, Props}
import akka.http.scaladsl.Http
import akka.http.scaladsl.marshalling.Marshal
import akka.http.scaladsl.model._
import akka.pattern.pipe
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.Source
import scalikejdbc._
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import spray.json.JsString

import scala.concurrent.Future

object WebHookActor {
  def props() = Props(new TheActor())

  case object Process
  private case class WebHookResult(successfulPosts: Int, failedPosts: Int)
  private case class DoneProcessing(result: Map[WebHook, WebHookResult])

  class TheActor extends Actor with Protocols {
    import context.dispatcher

    private implicit val materializer: ActorMaterializer = ActorMaterializer()(context)
    private val http = Http(context.system)

    private var isProcessing = false
    private var processAgain = false

    def receive = {
      case Process => {
        if (this.isProcessing) {
          this.processAgain = true
        } else {
          this.isProcessing = true
          println("WebHook Processing: STARTING")
          sendNotifications().pipeTo(this.self)
        }
      }
      case DoneProcessing(_) => {
        println("WebHook Processing: DONE")
        isProcessing = false
        if (this.processAgain) {
          this.processAgain = false
          this.self ! Process
        }
      }
    }

    private def sendNotifications(): Future[DoneProcessing] = {
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
            val relevantEvents: Set[EventType] = Set(EventType.CreateRecord, EventType.CreateRecordAspect, EventType.DeleteRecord, EventType.PatchRecord, EventType.PatchRecordAspect)
            val changeEvents = events.filter(event => relevantEvents.contains(event.eventType))

            val recordIds = changeEvents.map(event => event.eventType match {
              case EventType.CreateRecord | EventType.DeleteRecord | EventType.PatchRecord => event.data.fields("id").asInstanceOf[JsString].value
              case _ => event.data.fields("recordId").asInstanceOf[JsString].value
            }).toSet

            // If we're including records, get a complete record with aspects for each record ID
            val records = webHook.config.includeRecords match {
              case Some(true) | None => DB readOnly { implicit session =>
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
              case Some(false) => None
            }

            RecordsChangedWebHookPayload(
              action = "records.changed",
              lastEventId = events.last.id.get,
              events = if (webHook.config.includeEvents.getOrElse(true)) Some(changeEvents.toList) else None,
              records = records.map(_.toList)
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
          }).runFold(WebHookResult(0, 0))((results, postResult) => results match {
            // Count successful and failed payload deliveries
            case WebHookResult(successfulPosts, failedPosts) => if (postResult) WebHookResult(successfulPosts + 1, failedPosts) else WebHookResult(successfulPosts, failedPosts + 1)
          }).map(webHook -> _)
        }).runFold(Map[WebHook, WebHookResult]())((results, webHookResult) => results + webHookResult)
      }).map(DoneProcessing(_))
    }
  }
}
