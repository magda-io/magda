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
        getEventsSince(session, Some(offset), None, Some(eventStreamPageSize), recordId, aspectId)
      }
      events.events.lastOption.map(last => (last.id.get, events))
    }).mapConcat(page => page.events)
  }

  def getEventsSince(implicit session: DBSession,
                     lastEventId: Option[Long] = None,
                     start: Option[Int] = None,
                     limit: Option[Int] = None,
                     recordId: Option[String] = None,
                     aspectId: Option[String] = None): EventsPage = {
    val filters = Seq(
      lastEventId.map(v => sqls"eventId > $v"),
      recordId.map(v => sqls"data->>'recordId' = $v"),
      aspectId.map(v => sqls"data->>'aspectId' = $v")
    ).filter(_.isDefined)

    val whereClause = SQLSyntax.where(SQLSyntax.joinWithAnd(filters.map(_.get):_*))

    val totalCount = sql"select count(*) from Events $whereClause".map(_.int(1)).single.apply().getOrElse(0)

    var lastEventIdInPage: Option[Long] = None
    val events =
      sql"""select
            eventId,
            eventTime,
            eventTypeId,
            userId,
            data
          from Events
          $whereClause
          order by eventId asc
          offset ${start.getOrElse(0)}
          limit ${limit.getOrElse(1000)}"""
      .map(rs => {
        // Side-effectily track the sequence number of the very last result.
        lastEventIdInPage = Some(rs.long("eventId"))
        rowToEvent(rs)
      }).list.apply()

    EventsPage(totalCount, lastEventIdInPage.map(_.toString), events)
  }

  private def rowToEvent(rs: WrappedResultSet): RegistryEvent = RegistryEvent(
    id = rs.longOpt("eventId"),
    eventTime = rs.offsetDateTimeOpt("eventTime"),
    eventType = EventType.withValue(rs.int("eventTypeId")),
    userId = rs.int("userId"),
    data = JsonParser(rs.string("data")).asJsObject
  )
}
