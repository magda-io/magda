package au.csiro.data61.magda.registry

import au.csiro.data61.magda.model.Registry._
import akka.stream.scaladsl.Source
import spray.json._
import gnieh.diffson.sprayJson._
import scalikejdbc._

object EventPersistence extends Protocols with DiffsonProtocol {
  val eventStreamPageSize = 1000

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

    val eventTypesFilter =
      SQLSyntax.joinWithOr(eventTypes.map(v => v.value).map(v => sqls"eventtypeid = $v").toArray: _*)

    //// HORROR STARTS HERE
    val linkAspects = RecordPersistence.buildDereferenceMap(session, aspectIds)
    val dereferenceSelectors: Set[SQLSyntax] = linkAspects.toSet[(String, PropertyWithLink)].map {
      case (aspectId, propertyWithLink) =>
        //        val x = sqls"""1=2"""
        val x = sqls"""EXISTS (select 1
                         from RecordAspects
                         where aspectId=$aspectId
                         and RecordAspects.data->>${propertyWithLink.propertyName} = Events.data->>'recordId')"""
        x
    }

    /// HORROR (mostly) ENDS HERE

    val aspectsSql = if (aspectIds.isEmpty) sqls"1=1" else SQLSyntax.joinWithOr((aspectIds.map(v => sqls"data->>'aspectId' = $v") + sqls"data->>'aspectId' IS NULL").toArray: _*)
    val dereferenceSelectorsSql = if (dereferenceSelectors.isEmpty) sqls"1=1" else SQLSyntax.joinWithOr(dereferenceSelectors.toArray: _*)
    //    val allAspectsSql = aspectsSql ++ dereferenceSelectors

    //    val aspectsFilter =
    //      if (aspectIds.isEmpty) SQLSyntax.empty
    //      else SQLSyntax.joinWithOr((allAspectsSql + nullAspectSql).toArray: _*)

    val whereClause = SQLSyntax.where(SQLSyntax.joinWithAnd((filters.map(_.get)): _*).and(aspectsSql.or(dereferenceSelectorsSql)))

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
          val x = rowToEvent(rs)
          x
        }).list.apply()

    println(events)

    EventsPage(totalCount, lastEventIdInPage.map(_.toString), events)
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
