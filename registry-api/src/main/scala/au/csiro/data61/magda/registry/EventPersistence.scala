package au.csiro.data61.magda.registry

import java.time.OffsetDateTime
import au.csiro.data61.magda.model.Registry._

import akka.stream.scaladsl.Source
import spray.json._
import gnieh.diffson.sprayJson._
import scalikejdbc._

object EventPersistence extends Protocols with DiffsonProtocol {
  val eventPageSize = 1000

  def streamEventsSince(lastEventId: Long) = {
    Source.unfold(lastEventId)(offset => {
      val events = DB readOnly { implicit session =>
        sql"""select
                eventId,
                eventTime,
                eventTypeId,
                userId,
                data
              from Events
              where eventId > ${offset}
              order by eventId asc
              limit ${eventPageSize}"""
          .map(rowToEvent).list.apply()
      }
      events.lastOption.map(last => (last.id.get, events))
    }).mapConcat(page => page)
  }

  private def rowToEvent(rs: WrappedResultSet): RegistryEvent = RegistryEvent(
    id = rs.longOpt("eventId"),
    eventTime = rs.offsetDateTimeOpt("eventTime"),
    eventType = EventType.withValue(rs.int("eventTypeId")),
    userId = rs.int("userId"),
    data = JsonParser(rs.string("data")).asJsObject
  )
}
