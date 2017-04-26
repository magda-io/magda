package au.csiro.data61.magda.registry

import au.csiro.data61.magda.model.Registry._
import akka.stream.scaladsl.Source
import spray.json._
import gnieh.diffson.sprayJson._
import scalikejdbc._

object EventPersistence extends Protocols with DiffsonProtocol {
  val eventStreamPageSize = 1000

  def streamEventsSince(lastEventId: Long, recordId: Option[String] = None, aspectId: Option[String] = None) = {
    Source.unfold(lastEventId)(offset => {
      val events = DB readOnly { implicit session =>
        getEventsSince(session, Some(offset), Some(eventStreamPageSize), recordId, aspectId)
      }
      events.lastOption.map(last => (last.id.get, events))
    }).mapConcat(page => page)
  }

  def getEventsSince(implicit session: DBSession,
                     lastEventId: Option[Long] = None,
                     limit: Option[Number] = None,
                     recordId: Option[String] = None,
                     aspectId: Option[String] = None): List[RegistryEvent] = {
    val filters = Seq(
      lastEventId.map(v => sqls"eventId > $v"),
      recordId.map(v => sqls"data->>'recordId' = $v"),
      aspectId.map(v => sqls"data->>'aspectId' = $v")
    ).filter(_.isDefined)

    val whereClause = SQLSyntax.where(SQLSyntax.joinWithAnd(filters.map(_.get):_*))

    sql"""select
            eventId,
            eventTime,
            eventTypeId,
            userId,
            data
          from Events
          $whereClause
          order by eventId asc
          limit ${limit.getOrElse(1000)}"""
      .map(rowToEvent).list.apply()
  }

  private def rowToEvent(rs: WrappedResultSet): RegistryEvent = RegistryEvent(
    id = rs.longOpt("eventId"),
    eventTime = rs.offsetDateTimeOpt("eventTime"),
    eventType = EventType.withValue(rs.int("eventTypeId")),
    userId = rs.int("userId"),
    data = JsonParser(rs.string("data")).asJsObject
  )
}
