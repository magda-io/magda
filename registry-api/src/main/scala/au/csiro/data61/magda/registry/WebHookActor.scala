package au.csiro.data61.magda.registry

import akka.actor.Actor
import akka.http.scaladsl.Http
import akka.http.scaladsl.marshalling.Marshal
import akka.http.scaladsl.model.{HttpMethods, HttpRequest, MessageEntity, Uri}
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.Source
import scalikejdbc._
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._

import scala.concurrent.Future

class WebHookActor extends Actor with Protocols {
  import context.dispatcher
  implicit val materializer: ActorMaterializer = ActorMaterializer()(context)

  private var sendNotificationsFuture: Option[Future[Boolean]] = None
  private val http = Http(context.system)

  def receive = {
    case "process" => sendNotifications()
  }

  private def sendNotifications(): Future[Boolean] = this.sendNotificationsFuture match {
    case Some(future) => future
    case None => {
      println("Sending Notifications")
      val future = Future[List[WebHook]] {
        DB readOnly { implicit session =>
          val latestEventId = sql"select eventId from Events order by eventId desc limit 1".map(rs => rs.long("eventId")).single.apply().getOrElse(0l)
          HookPersistence.getAll(session).filter(hook => hook.lastEvent.getOrElse(0l) < latestEventId)
        }
      }.flatMap(webhooksToProcess => {
        if (webhooksToProcess.length > 0) {
          doSend(webhooksToProcess)
        } else {
          Future(false)
        }
      }).map(result => {
        this.sendNotificationsFuture = None

        // If we actually did anything, immediately start processing again.
        if (result) {
          this.self ! "process"
        } else {
          println("Nothing to do")
        }

        result
      })

      this.sendNotificationsFuture = Some(future)
      future
    }
  }

  private def doSend(webHooks: List[WebHook]): Future[Boolean] = {
    val maxEvents = 100
    val simultaneousInvocations = 6

    Source(webHooks).mapAsync(simultaneousInvocations)(webHook => {
      DB futureLocalTx { implicit session =>
        val events = EventPersistence.streamEventsSince(session, webHook.lastEvent.get)
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
            println("Posting to " + webHook.url)
            http.singleRequest(HttpRequest(
              uri = Uri(webHook.url),
              method = HttpMethods.POST,
              entity = entity
            )).map(response => {
              response.discardEntityBytes()
              DB localTx { localSession =>
                HookPersistence.setLastEvent(localSession, webHook.id.get, payload.lastEventId)
              }
              true
            })
          })
        }).runForeach(done => { println("Done with webhook")})

      }
    }).runForeach(done => {println("Done Notifying")}).map(done => true)
  }
}
