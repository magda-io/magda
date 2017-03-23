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
      val future = Future[Boolean] {
        val webhooksToProcess = DB readOnly { implicit session =>
          val latestEventId = sql"select eventId from Events order by eventId desc limit 1".map(rs => rs.long("eventId")).single.apply().getOrElse(0l)
          HookPersistence.getAll(session).filter(hook => hook.lastEvent.getOrElse(0l) < latestEventId)
        }

        val processAgain = webhooksToProcess.length > 0 && doSend(webhooksToProcess)

        this.sendNotificationsFuture = None

        // If we actually did anything, immediately start processing again.
        if (processAgain) {
          this.self ! "process"
        }

        processAgain
      }
      this.sendNotificationsFuture = Some(future)
      future
    }
  }

  private def doSend(webHooks: List[WebHook]): Boolean = {
    val maxEvents = 100
    val simultaneousInvocations = 6

    DB readOnly { implicit session =>
      Source(webHooks).mapAsync(simultaneousInvocations)(webHook => {
        val events = EventPersistence.streamEventsSince(session, webHook.lastEvent.get)
        events.grouped(maxEvents).map(events => {
          val relevantEvents: Set[EventType] = Set(EventType.CreateRecord, EventType.CreateRecordAspect, EventType.DeleteRecord, EventType.PatchRecord, EventType.PatchRecordAspect)
          val changeEvents = events.filter(event => relevantEvents.contains(event.eventType))
          val recordIds = changeEvents.map(event => event.data.fields("recordId").toString()).toSet
          RecordsChangedWebHookPayload(
            action = "records.changed",
            events = changeEvents.toList,
            records = recordIds.map(id => Record(id, id, Map())).toList
          )
        }).runForeach(payload => {
          println(payload)
        })
      })
    }

    true
  }

  private def rowToEvent(rs: WrappedResultSet) = {
    (rs.long("eventId"), rs.int("eventTypeId"), JsonParser(rs.string("data")).asJsObject())
  }
}
