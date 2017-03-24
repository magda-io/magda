package au.csiro.data61.magda.registry

import akka.Done
import akka.actor.Actor
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.Source
import scalikejdbc._
import spray.json.JsonParser

import scala.concurrent.Future

class WebHookActor extends Actor {
  import context.dispatcher
  implicit val materializer: ActorMaterializer = ActorMaterializer()(context)

  var sendNotificationsFuture: Option[Future[Boolean]] = None

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
            case EventType.CreateRecord => event.data.fields("id").toString()
            case EventType.CreateRecordAspect => event.data.fields("recordId").toString()
            case EventType.DeleteRecord => event.data.fields("id").toString()
            case EventType.PatchRecord => event.data.fields("id").toString()
            case EventType.PatchRecordAspect => event.data.fields("recordId").toString()
          }).toSet
          RecordsChangedWebHookPayload(
            action = "records.changed",
            events = changeEvents.toList,
            records = recordIds.map(id => Record(id, id, Map())).toList
          )
        }).runForeach(payload => {
          println(payload)
        })
      }
    }).runForeach(done => {}).map(done => true)
  }
}
