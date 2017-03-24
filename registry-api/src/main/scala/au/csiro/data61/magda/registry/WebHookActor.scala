package au.csiro.data61.magda.registry

import akka.actor.Actor
import akka.http.scaladsl.Http
import akka.http.scaladsl.marshalling.Marshal
import akka.http.scaladsl.model._
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.Source
import scalikejdbc._
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._

import scala.concurrent.Future

class WebHookActor extends Actor with Protocols {
  import context.dispatcher
  implicit val materializer: ActorMaterializer = ActorMaterializer()(context)

  private var sendNotificationsFuture: Option[Future[Map[WebHook, WebHookResult]]] = None
  private val http = Http(context.system)

  private case class WebHookResult(successfulPosts: Int, failedPosts: Int)

  def receive = {
    case "process" => sendNotifications()
  }

  private def sendNotifications(): Future[Map[WebHook, WebHookResult]] = this.sendNotificationsFuture match {
    case Some(future) => future
    case None => {
      println("WebHook Processing: STARTING")
      val future = Future[List[WebHook]] {
        DB readOnly { implicit session =>
          val latestEventId = sql"select eventId from Events order by eventId desc limit 1".map(rs => rs.long("eventId")).single.apply().getOrElse(0l)
          HookPersistence.getAll(session).filter(hook => hook.lastEvent.getOrElse(0l) < latestEventId)
        }
      }.flatMap(webHooksToProcess => {
        if (webHooksToProcess.length > 0) {
          doSend(webHooksToProcess)
        } else {
          Future(Map[WebHook, WebHookResult]())
        }
      }).map(result => {
        println("WebHook Processing: DONE")
        this.sendNotificationsFuture = None

        // If we actually did anything, immediately start processing again.
        if (result.nonEmpty) {
          result.foreach {
            case (webHook, WebHookResult(successes, failures)) => println(webHook.url + ": " + successes + " successful POSTs, " + failures + " failures")
          }
          this.self ! "process"
        } else {
          println("WebHook Processing: Did nothing on last pass; going to sleep.")
        }

        result
      })

      this.sendNotificationsFuture = Some(future)
      future
    }
  }

  private def doSend(webHooks: List[WebHook]): Future[Map[WebHook, WebHookResult]] = {
    val maxEvents = 100
    val simultaneousInvocations = 6

    Source(webHooks).mapAsync(simultaneousInvocations)(webHook => {
      val events = EventPersistence.streamEventsSince(webHook.lastEvent.get)
      events.grouped(maxEvents).map(events => {
        val relevantEvents: Set[EventType] = Set(EventType.CreateRecord, EventType.CreateRecordAspect, EventType.DeleteRecord, EventType.PatchRecord, EventType.PatchRecordAspect)
        val changeEvents = events.filter(event => relevantEvents.contains(event.eventType))
        val recordIds = changeEvents.map(event => event.eventType match {
          case EventType.CreateRecord | EventType.DeleteRecord | EventType.PatchRecord => event.data.fields("id").toString()
          case _ => event.data.fields("recordId").toString()
        }).toSet
        RecordsChangedWebHookPayload(
          action = "records.changed",
          lastEventId = events.last.id.get,
          events = changeEvents.toList,
          records = recordIds.map(id => Record(id, id, Map())).toList
        )
      }).mapAsync(1)(payload => {
        Marshal(payload).to[MessageEntity].flatMap(entity => {
          http.singleRequest(HttpRequest(
            uri = Uri(webHook.url),
            method = HttpMethods.POST,
            entity = entity
          )).map(response => {
            // TODO: if we don't get a 200 response, we should retry or something
            response.discardEntityBytes()
            DB localTx { session =>
              HookPersistence.setLastEvent(session, webHook.id.get, payload.lastEventId)
            }
            response.status.isSuccess()
          })
        })
      }).runFold(WebHookResult(0, 0))((results, postResult) => results match {
        case WebHookResult(successfulPosts, failedPosts) => if (postResult) WebHookResult(successfulPosts + 1, failedPosts) else WebHookResult(successfulPosts, failedPosts + 1)
      }).map(webHook -> _)
    }).runFold(Map[WebHook, WebHookResult]())((results, webHookResult) => results + webHookResult)
  }
}
