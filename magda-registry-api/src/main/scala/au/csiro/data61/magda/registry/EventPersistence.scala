package au.csiro.data61.magda.registry

import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.model.TenantId._
import akka.stream.scaladsl.Source
import spray.json._
import gnieh.diffson.sprayJson._
import scalikejdbc._
import akka.NotUsed
import au.csiro.data61.magda.opa.OpaTypes.OpaQuery

trait EventPersistence {

  def streamEventsSince(
      sinceEventId: Long,
      recordId: Option[String] = None,
      aspectIds: Set[String] = Set(),
      tenantId: TenantId
  ): Source[RegistryEvent, NotUsed]

  def streamEventsUpTo(
      lastEventId: Long,
      recordId: Option[String] = None,
      aspectIds: Set[String] = Set(),
      tenantId: TenantId
  ): Source[RegistryEvent, NotUsed]

  def getLatestEventId(implicit session: DBSession): Option[Long]

  def getEvents(
      pageToken: Option[Long] = None,
      start: Option[Int] = None,
      limit: Option[Int] = None,
      lastEventId: Option[Long] = None,
      recordId: Option[String] = None,
      aspectIds: Set[String] = Set(),
      eventTypes: Set[EventType] = Set(),
      tenantId: TenantId
  )(implicit session: DBSession): EventsPage

  def getRecordReferencedIds(
      tenantId: TenantId,
      recordId: String,
      aspectIds: Seq[String] = Seq(),
      opaRecordQueries: Option[List[(String, List[List[OpaQuery]])]]
  )(implicit session: DBSession): Seq[String]

  def getEventsWithDereference(
      // without specify recordId, we don't need to `dereference` as we would be searching all records event anyway
      // thus, recordId is compulsory here
      recordId: String,
      pageToken: Option[Long] = None,
      start: Option[Int] = None,
      limit: Option[Int] = None,
      lastEventId: Option[Long] = None,
      aspectIds: Set[String] = Set(),
      eventTypes: Set[EventType] = Set(),
      tenantId: TenantId,
      opaRecordQueries: Option[List[(String, List[List[OpaQuery]])]]
  )(implicit session: DBSession): EventsPage
}

class DefaultEventPersistence(recordPersistence: RecordPersistence)
    extends Protocols
    with DiffsonProtocol
    with EventPersistence {
  val eventStreamPageSize = 1000

  def streamEventsSince(
      sinceEventId: Long,
      recordId: Option[String] = None,
      aspectIds: Set[String] = Set(),
      tenantId: TenantId
  ): Source[RegistryEvent, NotUsed] = {
    Source
      .unfold(sinceEventId)(offset => {
        val events = DB readOnly { implicit session =>
          getEvents(
            pageToken = Some(offset),
            start = None,
            limit = Some(eventStreamPageSize),
            recordId = recordId,
            aspectIds = aspectIds,
            tenantId = tenantId
          )
        }
        events.events.lastOption.map(last => (last.id.get, events))
      })
      .mapConcat(page => page.events)

  }

  def streamEventsUpTo(
      lastEventId: Long,
      recordId: Option[String] = None,
      aspectIds: Set[String] = Set(),
      tenantId: TenantId
  ) = {
    Source
      .unfold(0L)(offset => {
        val events = DB readOnly { implicit session =>
          getEvents(
            pageToken = Some(offset),
            start = None,
            limit = Some(eventStreamPageSize),
            lastEventId = Some(lastEventId),
            recordId = recordId,
            aspectIds = aspectIds,
            tenantId = tenantId
          )
        }
        events.events.lastOption.map(last => (last.id.get, events))
      })
      .mapConcat(page => page.events)
  }

  def getLatestEventId(implicit session: DBSession): Option[Long] = {
    sql"""select
          eventId,
          from Events
          order by eventId desc
          limit 1""".map(rs => rs.long("eventId")).headOption().apply()
  }

  /**
    * Find events that meet the given criteria. This is a fundamental api mainly used by the registry to find
    * and send events to their subscribers, such as an indexer.
    *
    * See [[au.csiro.data61.magda.registry.WebHookActor.SingleWebHookActor]] for the implementation that provides
    * event service for all web hooks, such as indexer and minions.
    *
    * @param session an implicit DB session
    * @param pageToken The ID of event must be greater than the specified value. Optional and default to None.
    * @param start Specify the number of initial events to be dropped. Optional and default to None.
    * @param limit Specify the max number of events to be returned. Optional and default to None.
    * @param lastEventId The ID of event must NOT be greater than the specified value. Optional and default to None.
    * @param recordId The data recordId field of event must equal to this value. Optional and default to None.
    * @param aspectIds The data aspectId field of event must equal to one of the specified values. Optional and default to empty Set.
    * @param eventTypes The type of event must equal to one of the specified values. Optional and default to empty Set.
    * @param tenantId The returned events will be filtered by this tenant ID.
    *                 If it is a system ID, events belonging to all tenants are included (no tenant filtering).
    * @return EventsPage containing events that meet the specified requirements
    */
  def getEvents(
      pageToken: Option[Long] = None,
      start: Option[Int] = None,
      limit: Option[Int] = None,
      lastEventId: Option[Long] = None,
      recordId: Option[String] = None,
      aspectIds: Set[String] = Set(),
      eventTypes: Set[EventType] = Set(),
      tenantId: TenantId
  )(implicit session: DBSession): EventsPage = {
    getEventsWithRecordSelector(
      pageToken = pageToken,
      start = start,
      limit = limit,
      lastEventId = lastEventId,
      recordId = recordId,
      aspectIds = aspectIds,
      eventTypes = eventTypes,
      tenantId = tenantId
    )
  }

  private def getEventsWithRecordSelector(
      pageToken: Option[Long] = None,
      start: Option[Int] = None,
      limit: Option[Int] = None,
      lastEventId: Option[Long] = None,
      recordId: Option[String] = None,
      aspectIds: Set[String] = Set(),
      eventTypes: Set[EventType] = Set(),
      tenantId: TenantId,
      recordSelector: Iterable[Option[SQLSyntax]] = Iterable()
  )(implicit session: DBSession): EventsPage = {

    val filters: Seq[Option[SQLSyntax]] = Seq(
      pageToken.map(v => sqls"eventId > $v"),
      lastEventId.map(v => sqls"eventId <= $v"),
      recordId.map(v => sqls"data->>'recordId' = $v")
    ) ++ recordSelector

    val tenantFilter = Some(SQLUtil.tenantIdToWhereClause(tenantId))
    val theFilters = (filters ++ List(tenantFilter)).filter(_.isDefined)

    val eventTypesFilter =
      if (eventTypes.isEmpty) sqls"1=1"
      else
        SQLSyntax.joinWithOr(
          eventTypes
            .map(v => v.value)
            .map(v => sqls"eventtypeid = $v")
            .toArray: _*
        )

    val linkAspects = recordPersistence.buildReferenceMap(aspectIds)

    /*
      TODO:
      The code block below doesn't seems achieve `dereference` (i.e. includes all events of linked records) and more likely redundant logic
      The actual dereference logic is currently done via method `getRecordReferencedIds` and passing ids & aspect filters through `recordSelector` of this method
      The code was left here because it was used by `web hook actor` which is the key part of the system.
      It currently has no functionality impact to the current `dereference` function (as we will skip it by filtering aspect via `recordSelector`).
      We probably should be look at it again once we got better understanding of its impact (or/and more test cases around it)
     */
    val dereferenceSelectors: Set[SQLSyntax] =
      linkAspects.toSet[(String, PropertyWithLink)].map {
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

    val aspectsSql =
      if (aspectIds.isEmpty) None
      else
        Some(
          SQLSyntax.joinWithOr(
            (aspectIds
              .map(v => sqls"data->>'aspectId' = $v") + sqls"data->>'aspectId' IS NULL").toArray: _*
          )
        )
    val dereferenceSelectorsSql =
      if (dereferenceSelectors.isEmpty) None
      else Some(SQLSyntax.joinWithOr(dereferenceSelectors.toArray: _*))

    val whereClause = SQLSyntax.where(
      SQLSyntax
        .joinWithAnd(theFilters.map(_.get): _*)
        .and((aspectsSql, dereferenceSelectorsSql) match {
          case (Some(aspectSql), Some(dereferenceSql)) =>
            aspectSql.or(dereferenceSql)
          case (Some(aspectSql), None)      => aspectSql
          case (None, Some(dereferenceSql)) => dereferenceSql
          case (None, None)                 => sqls"true"
        })
        .and(eventTypesFilter)
    )

    var lastEventIdInPage: Option[Long] = None
    val events =
      sql"""select
            eventId,
            eventTime,
            eventTypeId,
            userId,
            data,
            tenantId
          from Events
          $whereClause
      ${/* for some reason if you LIMIT 1 and ORDER BY eventId, postgres chooses a weird query plan, so use eventTime in that case*/ sqls""}
          order by ${if (limit != Some(1)) sqls"eventId" else sqls"eventTime"} asc
          offset ${start.getOrElse(0)}
          limit ${limit.getOrElse(1000)}"""
        .map(rs => {
          // Side-effectily track the sequence number of the very last result.
          lastEventIdInPage = Some(rs.long("eventId"))
          rowToEvent(rs)
        })
        .list
        .apply()

    EventsPage(
      lastEventIdInPage.isDefined,
      lastEventIdInPage.map(_.toString),
      events
    )
  }

  /**
    * get Ids of all records that are or were linked to the specified record
    *
    * @param tenantId TenantId
    * @param recordId the id of the record whose lined records should be queried for
    * @param aspectIds optional; if specified, only links are defined by specified aspects will be considered
    * @param opaRecordQueries opaRecordQueries
    * @param session DB session
    * @return Seq[String] A list record id
    */
  def getRecordReferencedIds(
      tenantId: TenantId,
      recordId: String,
      aspectIds: Seq[String] = Seq(),
      opaRecordQueries: Option[List[(String, List[List[OpaQuery]])]]
  )(implicit session: DBSession): Seq[String] = {
    val tenantFilter = SQLUtil.tenantIdToWhereClause(tenantId)

    // --- pick all aspects of the specified record mentioned in the events till now
    val mentionedAspects = if (aspectIds.size == 0) {
      sql"""SELECT DISTINCT data->>'aspectId' as aspectid
        FROM events
        WHERE data->>'recordId'=${recordId} AND data->>'aspectId' IS NOT NULL AND ${tenantFilter}"""
        .map(_.string(1))
        .list
        .apply()
    } else {
      aspectIds
    }

    // --- produce reference map of all possible links
    val refMap = recordPersistence.buildReferenceMap(mentionedAspects)

    if (refMap.size == 0) {
      Seq()
    } else {

      /*
      Here, we retrieve all relevant linked record ids by:
      - Filter events table by recordId and data->'aspectId' (only includes aspect contains links) first
      - It's a create event when event data -> aspect field exists. Thus, retrieve property value, either array (return as rows) or single value, as record ids
      - When event data -> patch field (array of patch operations) exists, it could be aspectPatch, aspectPatchDelete etc. event.
        We convert the `patch` array into rows and then use a sub-query to filter out rows:
          - `patch`->'value' is null
          - `patch`->'path' is one of `/[propertyName]`, `/[propertyName]/-`(add an item to array), `/[propertyName]/xx` (replace a item at index xx)
        Then return aggregated result as rows
       */
      val linkedRecordIds = sql"""SELECT DISTINCT ids FROM
      (SELECT CASE
        ${SQLSyntax.join(
        refMap.toSeq.map { ref =>
          val jsonAspectDataRef =
            sqls"data #> array['aspect', ${ref._2.propertyName}]"
          val jsonAspectTextDataRef =
            sqls"data #>> array['aspect', ${ref._2.propertyName}]"

          sqls"""
                WHEN data->>'aspectId'=${ref._1} AND ${jsonAspectDataRef} IS NOT NULL
                THEN ${if (ref._2.isArray) {
            sqls"jsonb_array_elements_text(${jsonAspectDataRef})"
          } else {
            sqls"${jsonAspectTextDataRef}"
          }}
                WHEN data->>'aspectId'=${ref._1} AND data->'patch' IS NOT NULL
                THEN jsonb_array_elements_text(
                  (select jsonb_agg(patches->'value')
                   from jsonb_array_elements(data->'patch') patches
                   WHERE patches->'value' IS NOT NULL AND
                      (
                        patches->>'path'=${s"/${ref._2.propertyName}"}
                        OR patches->>'path'=${s"/${ref._2.propertyName}/-"}
                        OR patches->>'path' ilike ${s"/${ref._2.propertyName}/%"}
                      )
                  ))
                """
        },
        SQLSyntax.createUnsafely("\n"),
        false
      )}
            END as ids
         FROM events
         WHERE data->>'recordId'=${recordId} AND ${SQLSyntax.in(
        SQLSyntax.createUnsafely("data->>'aspectId'"),
        refMap
          .map(_._1)
          .toSeq
      )}
       ) linksids
       WHERE ids IS NOT NULL AND trim(ids)!=''
       """.map(_.string(1)).list.apply()

      if (linkedRecordIds.size == 0) {
        Seq()
      } else {
        // We need to filter out any records that the current user has no access
        // We do this via `recordPersistence.getValidRecordIds`
        // when `opaRecordQueries` is None, `recordPersistence.getValidRecordIds` will simply return `linkedRecordIds` directly
        // as there is no need to check as user should have access to all records (likely an admin)
        recordPersistence.getValidRecordIds(
          tenantId,
          opaRecordQueries,
          linkedRecordIds
        )
      }
    }
  }

  /**
    * The dereference works in two steps approach:
    * - find out all records that are or have been linked to the specified record by searching & dereferencing with events history
    * - call `getEvents` to pull events of the specified record plus events of all records found in step 1
    *
    * @param recordId
    * @param pageToken
    * @param start
    * @param limit
    * @param lastEventId
    * @param aspectIds
    * @param eventTypes
    * @param tenantId
    * @param opaRecordQueries
    * @param session
    * @return
    */
  def getEventsWithDereference(
      recordId: String,
      pageToken: Option[Long] = None,
      start: Option[Int] = None,
      limit: Option[Int] = None,
      lastEventId: Option[Long] = None,
      aspectIds: Set[String] = Set(),
      eventTypes: Set[EventType] = Set(),
      tenantId: TenantId,
      opaRecordQueries: Option[List[(String, List[List[OpaQuery]])]]
  )(implicit session: DBSession): EventsPage = {

    val recordIds =
      getRecordReferencedIds(
        tenantId,
        recordId,
        aspectIds.toSeq,
        opaRecordQueries
      ) :+ recordId

    val aspectIdSql =
      SQLSyntax.createUnsafely("data->>'aspectId'")

    val aspectFilters = if (aspectIds.size == 0) {
      Seq()
    } else {
      Seq(
        Some(
          SQLSyntax.join(
            aspectIds.toSeq.map { aspectId: String =>
              SQLSyntax.eq(aspectIdSql, aspectId)
            } :+ (SQLSyntax
              .isNull(aspectIdSql)),
            SQLSyntax.or
          )
        )
      )
    }

    getEventsWithRecordSelector(
      aspectIds = Set(),
      recordId = None,
      pageToken = pageToken,
      start = start,
      limit = limit,
      tenantId = tenantId,
      recordSelector = Seq(
        Some(
          SQLSyntax.in(
            SQLSyntax.createUnsafely("data->>'recordId'"),
            recordIds
          )
        )
      ) ++ aspectFilters
    )
  }

  private def rowToEvent(rs: WrappedResultSet): RegistryEvent = {
    RegistryEvent(
      id = rs.longOpt("eventId"),
      eventTime = rs.offsetDateTimeOpt("eventTime"),
      eventType = EventType.withValue(rs.int("eventTypeId")),
      userId = rs.stringOpt("userId"),
      data = JsonParser(rs.string("data")).asJsObject,
      tenantId = rs
        .bigIntOpt("tenantid")
        .map(BigInt.apply)
        .getOrElse(MAGDA_ADMIN_PORTAL_ID)
    )
  }
}
