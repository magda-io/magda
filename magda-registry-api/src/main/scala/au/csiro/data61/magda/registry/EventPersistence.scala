package au.csiro.data61.magda.registry

import au.csiro.data61.magda.model.Registry._
import akka.stream.scaladsl.Source
import spray.json._
import gnieh.diffson.sprayJson._
import scalikejdbc._

object EventPersistence extends Protocols with DiffsonProtocol {
  val eventStreamPageSize = 1000
  val recordPersistence = DefaultRecordPersistence

  def streamEventsSince(sinceEventId: Long, recordId: Option[String] = None, aspectIds: Set[String] = Set()) = {
    Source.unfold(sinceEventId)(offset => {
      val events = DB readOnly { implicit session =>
        getEvents(
          session = session,
          pageToken = Some(offset),
          start = None,
          limit = Some(eventStreamPageSize),
          recordId = recordId,
          aspectIds = aspectIds)
      }
      events.events.lastOption.map(last => (last.id.get, events))
    }).mapConcat(page => page.events)
  }

  def streamEventsUpTo(lastEventId: Long, recordId: Option[String] = None, aspectIds: Set[String] = Set()) = {
    Source.unfold(0L)(offset => {
      val events = DB readOnly { implicit session =>
        getEvents(
          session = session,
          pageToken = Some(offset),
          start = None,
          limit = Some(eventStreamPageSize),
          lastEventId = Some(lastEventId),
          recordId = recordId,
          aspectIds = aspectIds)
      }
      events.events.lastOption.map(last => (last.id.get, events))
    }).mapConcat(page => page.events)
  }

  def getLatestEventId(implicit session: DBSession): Option[Long] = {
    sql"""select
          eventId,            
          from Events
          order by eventId desc
          limit 1""".map(rs => rs.long("eventId")).headOption().apply()
  }

  def getEvents(implicit session: DBSession,
                pageToken: Option[Long] = None,
                start: Option[Int] = None,
                limit: Option[Int] = None,
                lastEventId: Option[Long] = None,
                recordId: Option[String] = None,
                aspectIds: Set[String] = Set(),
                eventTypes: Set[EventType] = Set()): EventsPage = {
    val filters = Seq(
      pageToken.map(v => sqls"eventId > $v"),
      lastEventId.map(v => sqls"eventId <= $v"),
      recordId.map(v => sqls"data->>'recordId' = $v")).filter(_.isDefined)

    val eventTypesFilter = if (eventTypes.isEmpty) sqls"1=1" else
      SQLSyntax.joinWithOr(eventTypes.map(v => v.value).map(v => sqls"eventtypeid = $v").toArray: _*)

    val linkAspects = recordPersistence.buildDereferenceMap(session, aspectIds)
    val dereferenceSelectors: Set[SQLSyntax] = linkAspects.toSet[(String, PropertyWithLink)].map {
      case (aspectId, propertyWithLink) =>
        if (propertyWithLink.isArray) {
          sqls"""$aspectId IN (select aspectId
                         from RecordAspects
                         where RecordAspects.data->${propertyWithLink.propertyName} @> (Events.data->'recordId')::jsonb)"""
        } else {
          sqls"""$aspectId IN (select aspectId
                         from RecordAspects
                         where RecordAspects.data->>${propertyWithLink.propertyName} = Events.data->>'recordId')"""
        }
    }

    val aspectsSql = if (aspectIds.isEmpty) None else Some(SQLSyntax.joinWithOr((aspectIds.map(v => sqls"data->>'aspectId' = $v") + sqls"data->>'aspectId' IS NULL").toArray: _*))
    val dereferenceSelectorsSql = if (dereferenceSelectors.isEmpty) None else Some(SQLSyntax.joinWithOr(dereferenceSelectors.toArray: _*))

    val whereClause = SQLSyntax.where((SQLSyntax.joinWithAnd((filters.map(_.get)): _*)).and((aspectsSql, dereferenceSelectorsSql) match {
      case (Some(aspectSql), Some(dereferenceSql)) => aspectSql.or(dereferenceSql)
      case (Some(aspectSql), None)                 => aspectSql
      case (None, Some(dereferenceSql))            => dereferenceSql
      case (None, None)                            => sqls"1=1"
    }).and(eventTypesFilter))

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

    EventsPage(lastEventIdInPage.isDefined, lastEventIdInPage.map(_.toString), events)
  }

  private def rowToEvent(rs: WrappedResultSet): RegistryEvent = {
    RegistryEvent(
      id = rs.longOpt("eventId"),
      eventTime = rs.offsetDateTimeOpt("eventTime"),
      eventType = EventType.withValue(rs.int("eventTypeId")),
      userId = rs.int("userId"),
      data = JsonParser(rs.string("data")).asJsObject)
  }
}
