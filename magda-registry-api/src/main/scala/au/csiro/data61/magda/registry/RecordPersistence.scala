package au.csiro.data61.magda.registry

import java.sql.SQLException
import akka.NotUsed
import akka.event.LoggingAdapter
import akka.stream.scaladsl.Source
import au.csiro.data61.magda.ServerError
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.model.TenantId._
import gnieh.diffson._
import gnieh.diffson.sprayJson._
import scalikejdbc._
import spray.json._
import spray.json.lenses.JsonLenses._
import org.everit.json.schema.ValidationException
import au.csiro.data61.magda.client.AuthOperations
import au.csiro.data61.magda.model.Auth.{
  AuthDecision,
  UnconditionalTrueDecision
}
import au.csiro.data61.magda.model.{
  AspectQuery,
  AspectQueryExists,
  AspectQueryGroup,
  AspectQueryToSqlConfig
}

import scala.util.{Failure, Success, Try}
import com.typesafe.config.Config
import scalikejdbc.interpolation.SQLSyntax
import au.csiro.data61.magda.util.{JsonUtils, SQLUtils}
import au.csiro.data61.magda.util.JsonPatchUtils.processRecordPatchOperationsOnAspects

trait RecordPersistence {

  def getValidRecordIds(
      tenantId: TenantId,
      authDecision: AuthDecision,
      recordIds: Seq[String]
  )(implicit session: DBSession): Seq[String]

  def getAll(
      tenantId: TenantId,
      authDecision: AuthDecision,
      pageToken: Option[String],
      start: Option[Int],
      limit: Option[Int],
      reversePageTokenOrder: Option[Boolean] = None
  )(implicit session: DBSession): RecordsPage[RecordSummary]

  def getAllWithAspects(
      tenantId: TenantId,
      authDecision: AuthDecision,
      aspectIds: Iterable[String],
      optionalAspectIds: Iterable[String],
      pageToken: Option[Long] = None,
      start: Option[Int] = None,
      limit: Option[Int] = None,
      dereference: Option[Boolean] = None,
      aspectQueries: Iterable[AspectQuery] = Nil,
      aspectOrQueries: Iterable[AspectQuery] = Nil,
      orderBy: Option[OrderByDef] = None,
      reversePageTokenOrder: Option[Boolean] = None
  )(implicit session: DBSession): RecordsPage[Record]

  def getCount(
      tenantId: TenantId,
      authDecision: AuthDecision,
      aspectIds: Iterable[String],
      aspectQueries: Iterable[AspectQuery] = Nil,
      aspectOrQueries: Iterable[AspectQuery] = Nil
  )(implicit session: DBSession): Long

  def getById(
      tenantId: TenantId,
      authDecision: AuthDecision,
      id: String
  )(implicit session: DBSession): Option[RecordSummary]

  def getByIdWithAspects(
      tenantId: TenantId,
      authDecision: AuthDecision,
      id: String,
      aspectIds: Iterable[String] = Seq(),
      optionalAspectIds: Iterable[String] = Seq(),
      dereference: Option[Boolean] = None
  )(implicit session: DBSession): Option[Record]

  def getCompleteRecordById(
      tenantId: TenantId,
      authDecision: AuthDecision,
      id: String
  )(implicit session: DBSession): Option[Record]

  def getByIdsWithAspects(
      tenantId: TenantId,
      authDecision: AuthDecision,
      ids: Iterable[String],
      aspectIds: Iterable[String] = Seq(),
      optionalAspectIds: Iterable[String] = Seq(),
      dereference: Option[Boolean] = None
  )(implicit session: DBSession): RecordsPage[Record]

  def getRecordsLinkingToRecordIds(
      tenantId: TenantId,
      authDecision: AuthDecision,
      ids: Iterable[String],
      idsToExclude: Iterable[String] = Seq(),
      aspectIds: Iterable[String] = Seq(),
      optionalAspectIds: Iterable[String] = Seq(),
      dereference: Option[Boolean] = None
  )(implicit session: DBSession): RecordsPage[Record]

  def getRecordAspectById(
      tenantId: TenantId,
      authDecision: AuthDecision,
      recordId: String,
      aspectId: String
  )(implicit session: DBSession): Option[JsObject]

  def getRecordAspects(
      tenantId: TenantId,
      authDecision: AuthDecision,
      recordId: String,
      keyword: Option[String] = None,
      aspectIdOnly: Option[Boolean] = None,
      start: Option[Int] = None,
      limit: Option[Int] = None
  )(implicit session: DBSession): List[JsValue]

  def getRecordAspectsCount(
      tenantId: TenantId,
      authDecision: AuthDecision,
      recordId: String,
      keyword: Option[String] = None
  )(implicit session: DBSession): Long

  def getPageTokens(
      tenantId: TenantId,
      authDecision: AuthDecision,
      aspectIds: Iterable[String],
      limit: Option[Int] = None,
      recordSelector: Iterable[Option[SQLSyntax]] = Iterable()
  )(implicit session: DBSession): List[String]

  def putRecordById(
      tenantId: SpecifiedTenantId,
      id: String,
      newRecord: Record,
      userId: String,
      forceSkipAspectValidation: Boolean = false,
      merge: Boolean = false
  )(implicit session: DBSession): Try[(Record, Long)]

  def patchRecordById(
      tenantId: SpecifiedTenantId,
      id: String,
      recordPatch: JsonPatch,
      userId: String,
      forceSkipAspectValidation: Boolean = false
  )(implicit session: DBSession): Try[(Record, Long)]

  def patchRecords(
      tenantId: SpecifiedTenantId,
      authDecision: AuthDecision,
      recordIds: Seq[String],
      recordPatch: JsonPatch,
      userId: String,
      forceSkipAspectValidation: Boolean = false
  )(implicit session: DBSession): Try[Seq[Long]]

  def patchRecordAspectById(
      tenantId: SpecifiedTenantId,
      recordId: String,
      aspectId: String,
      aspectPatch: JsonPatch,
      userId: String,
      forceSkipAspectValidation: Boolean = false
  )(implicit session: DBSession): Try[(JsObject, Long)]

  def putRecordsAspectById(
      tenantId: SpecifiedTenantId,
      authDecision: AuthDecision,
      recordIds: Seq[String],
      aspectId: String,
      newAspect: JsObject,
      userId: String,
      forceSkipAspectValidation: Boolean = false,
      merge: Boolean = false
  )(implicit session: DBSession): Try[Seq[Long]]

  def putRecordAspectById(
      tenantId: SpecifiedTenantId,
      recordId: String,
      aspectId: String,
      newAspect: JsObject,
      userId: String,
      forceSkipAspectValidation: Boolean = false,
      merge: Boolean = false
  )(implicit session: DBSession): Try[(JsObject, Long)]

  def createRecord(
      tenantId: SpecifiedTenantId,
      record: Record,
      userId: String,
      forceSkipAspectValidation: Boolean = false
  )(implicit session: DBSession): Try[(Record, Long)]

  def deleteRecord(
      tenantId: SpecifiedTenantId,
      recordId: String,
      userId: String
  )(implicit session: DBSession): Try[(Boolean, Long)]

  def deleteRecordAspectArrayItems(
      tenantId: SpecifiedTenantId,
      recordId: String,
      aspectId: String,
      jsonPath: String,
      jsonItems: Seq[JsValue],
      userId: String,
      forceSkipAspectValidation: Boolean = false
  )(implicit session: DBSession): Try[(Boolean, Long)]

  def deleteRecordsAspectArrayItems(
      tenantId: SpecifiedTenantId,
      authDecision: AuthDecision,
      recordIds: Seq[String],
      aspectId: String,
      jsonPath: String,
      jsonItems: Seq[JsValue],
      userId: String,
      forceSkipAspectValidation: Boolean = false
  )(implicit session: DBSession): Try[Seq[Long]]

  def trimRecordsBySource(
      tenantId: SpecifiedTenantId,
      sourceTagToPreserve: String,
      sourceId: String,
      userId: String,
      logger: Option[LoggingAdapter] = None
  )(implicit session: DBSession): Try[Long]

  def createRecordAspect(
      tenantId: SpecifiedTenantId,
      recordId: String,
      aspectId: String,
      aspect: JsObject,
      userId: String,
      forceSkipAspectValidation: Boolean = false
  )(implicit session: DBSession): Try[(JsObject, Long)]

  def deleteRecordAspect(
      tenantId: SpecifiedTenantId,
      recordId: String,
      aspectId: String,
      userId: String
  )(implicit session: DBSession): Try[(Boolean, Long)]

  def reconstructRecordFromEvents(
      id: String,
      events: Source[RegistryEvent, NotUsed],
      aspects: Iterable[String],
      optionalAspects: Iterable[String]
  ): Source[Option[Record], NotUsed]

  /** Given a record and aspects being requested, returns the ids of all records that the record/aspect id combinations link to */
  def getLinkedRecordIds(
      recordId: String,
      aspectIds: Iterable[String] = List()
  )(implicit session: DBSession): Try[Iterable[String]]

  /**
    * Given a list of aspect ids, queries each of them to see if the aspects link to other aspects.
    *
    * Note that currently, links can only be at the first level of an aspect, and only one is supported
    * per aspect.
    *
    * @return a Map of aspect ids to the first field inside that aspect that links to another aspect.
    */
  def buildReferenceMap(
      aspectIds: Iterable[String]
  )(implicit session: DBSession): Map[String, PropertyWithLink]
}

class DefaultRecordPersistence(config: Config)
    extends Protocols
    with DiffsonProtocol
    with RecordPersistence {
  val aspectValidator = new AspectValidator(config, this)
  val maxResultCount = 1000
  val defaultResultCount = 100

  /**
    * Given a list of recordIds, filter out any record that the current user has not access and return the rest of ids
    * @param tenantId
    * @param authDecision
    * @param recordIds
    * @param session
    * @return Seq[String]
    */
  def getValidRecordIds(
      tenantId: TenantId,
      authDecision: AuthDecision,
      recordIds: Seq[String]
  )(implicit session: DBSession): Seq[String] =
    this
      .getRecords(
        tenantId = tenantId,
        authDecision,
        aspectIds = Seq(),
        optionalAspectIds = Seq(),
        pageToken = None,
        start = None,
        Some(recordIds.size),
        dereference = Some(false),
        orderBy = None,
        maxLimit = Some(recordIds.size),
        recordSelector = Seq(
          Some(
            SQLSyntax.in(SQLSyntax.createUnsafely("recordId"), recordIds)
          )
        )
      )
      .records
      .map(_.id)

  def getAll(
      tenantId: TenantId,
      authDecision: AuthDecision,
      pageToken: Option[String],
      start: Option[Int],
      limit: Option[Int],
      reversePageTokenOrder: Option[Boolean] = None
  )(implicit session: DBSession): RecordsPage[RecordSummary] = {
    this.getSummaries(
      tenantId,
      authDecision,
      pageToken,
      start,
      limit,
      reversePageTokenOrder = reversePageTokenOrder
    )
  }

  private def getSqlFromAspectQueries(
      aspectQueries: Seq[AspectQuery],
      aspectOrQueries: Seq[AspectQuery],
      recordIdSqlRef: String = "records.recordid",
      tenantIdSqlRef: String = "records.tenantid"
  ): Option[SQLSyntax] = {
    val config = AspectQueryToSqlConfig(
      recordIdSqlRef = recordIdSqlRef,
      tenantIdSqlRef = tenantIdSqlRef
    )
    val andConditions =
      AspectQueryGroup(aspectQueries, joinWithAnd = true)
        .toSql(config)
        // SQLSyntax.toAndConditionOpt fails to check the statement with and / or & newlines
        // thus we manually add roundBracket here
        .map(SQLSyntax.roundBracket(_))
    val orConditions =
      AspectQueryGroup(aspectOrQueries, joinWithAnd = false)
        .toSql(config)
        .map(SQLSyntax.roundBracket(_))

    SQLSyntax
      .toAndConditionOpt(andConditions, orConditions)
      .map(SQLSyntax.roundBracket(_))
  }

  def getAllWithAspects(
      tenantId: TenantId,
      authDecision: AuthDecision,
      aspectIds: Iterable[String],
      optionalAspectIds: Iterable[String],
      pageToken: Option[Long] = None,
      start: Option[Int] = None,
      limit: Option[Int] = None,
      dereference: Option[Boolean] = None,
      aspectQueries: Iterable[AspectQuery] = Nil,
      aspectOrQueries: Iterable[AspectQuery] = Nil,
      orderBy: Option[OrderByDef] = None,
      reversePageTokenOrder: Option[Boolean] = None
  )(implicit session: DBSession): RecordsPage[Record] = {

    // --- make sure if orderBy is used, the involved aspectId is, at least, included in optionalAspectIds
    val notIncludedAspectIds = (orderBy
      .map(_.aspectName)
      .toList)
      .filter(!(aspectIds ++ optionalAspectIds).toList.contains(_))

    val selectors = Seq(
      getSqlFromAspectQueries(aspectQueries.toSeq, aspectOrQueries.toSeq)
    )

    this.getRecords(
      tenantId,
      authDecision,
      aspectIds,
      optionalAspectIds ++ notIncludedAspectIds,
      pageToken,
      start,
      limit,
      dereference,
      selectors,
      orderBy,
      None,
      reversePageTokenOrder = reversePageTokenOrder
    )
  }

  def getCount(
      tenantId: TenantId,
      authDecision: AuthDecision,
      aspectIds: Iterable[String],
      aspectQueries: Iterable[AspectQuery] = Nil,
      aspectOrQueries: Iterable[AspectQuery] = Nil
  )(implicit session: DBSession): Long = {

    this.getCountInner(
      tenantId,
      authDecision,
      aspectIds,
      aspectQueries,
      aspectOrQueries
    )
  }

  def getById(
      tenantId: TenantId,
      authDecision: AuthDecision,
      id: String
  )(implicit session: DBSession): Option[RecordSummary] = {
    this
      .getSummaries(tenantId, authDecision, None, None, None, Some(id))
      .records
      .headOption
  }

  def getCompleteRecordById(
      tenantId: TenantId,
      authDecision: AuthDecision,
      id: String
  )(implicit session: DBSession): Option[Record] = {
    val idWhereClause = Some(sqls"Records.recordId=$id")
    val authDecisionCondition = authDecision.toSql()

    val whereClauseParts = Seq(idWhereClause) :+ authDecisionCondition :+ SQLUtils
      .tenantIdToWhereClause(tenantId)

    sql"SELECT * FROM records ${SQLSyntax.where(SQLSyntax.toAndConditionOpt(whereClauseParts: _*))} LIMIT 1"
      .map { rs =>
        val aspects =
          sql"""SELECT aspectid,data FROM recordaspects WHERE recordid=${id}"""
            .map { rs =>
              val aspectId = rs.string("aspectid")
              (aspectId, JsonParser(rs.string("data")).asJsObject)
            }
            .list
            .apply()
        Record(
          id = rs.string("recordId"),
          name = rs.string("name"),
          sourceTag = rs.stringOpt("sourceTag"),
          tenantId = rs.bigIntOpt("tenantId").map(BigInt.apply),
          aspects = aspects.toMap
        )
      }
      .single()
      .apply()
  }

  def getByIdWithAspects(
      tenantId: TenantId,
      authDecision: AuthDecision,
      id: String,
      aspectIds: Iterable[String] = Seq(),
      optionalAspectIds: Iterable[String] = Seq(),
      dereference: Option[Boolean] = None
  )(implicit session: DBSession): Option[Record] = {
    this
      .getRecords(
        tenantId,
        authDecision,
        aspectIds,
        optionalAspectIds,
        None,
        None,
        Some(1),
        dereference,
        List(Some(sqls"recordId=$id"))
      )
      .records
      .headOption
  }

  def getByIdsWithAspects(
      tenantId: TenantId,
      authDecision: AuthDecision,
      ids: Iterable[String],
      aspectIds: Iterable[String] = Seq(),
      optionalAspectIds: Iterable[String] = Seq(),
      dereference: Option[Boolean] = None
  )(implicit session: DBSession): RecordsPage[Record] = {
    if (ids.isEmpty)
      RecordsPage(hasMore = false, Some("0"), List())
    else
      this.getRecords(
        tenantId,
        authDecision,
        aspectIds,
        optionalAspectIds,
        None,
        None,
        None,
        dereference,
        List(Some(sqls"recordId in ($ids)"))
      )
  }

  /**
    * Given a list of record ids (`ids`) return any records that have an aspect (e.g. `dataset-distributions`) references any of the record ids (`ids`).
    * The aspect that we found a matched record id must be one of aspect supplied in either `aspectIds` or `optionalAspectIds`.
    * Before return the records as the result, we should also filter out any records whose id matches one of id in `idsToExclude` parameter (if supplied)
    *
    * @param tenantId
    * @param authDecision
    * @param ids
    * @param idsToExclude
    * @param aspectIds
    * @param optionalAspectIds
    * @param dereference
    * @param session
    * @return
    */
  def getRecordsLinkingToRecordIds(
      tenantId: TenantId,
      authDecision: AuthDecision,
      ids: Iterable[String],
      idsToExclude: Iterable[String] = Seq(),
      aspectIds: Iterable[String] = Seq(),
      optionalAspectIds: Iterable[String] = Seq(),
      dereference: Option[Boolean] = None
  )(implicit session: DBSession): RecordsPage[Record] = {
    val linkAspects =
      buildReferenceMap(List.concat(aspectIds, optionalAspectIds))
    if (linkAspects.isEmpty) {
      // There are no linking aspects, so there cannot be any records linking to these IDs.
      RecordsPage(hasMore = false, None, List())
    } else {
      val dereferenceSelectors = linkAspects.map {
        case (aspectId, propertyWithLink) =>
          if (propertyWithLink.isArray) {
            SQLSyntax
              .exists(
                sqls"select 1 from RecordAspects".where(
                  SQLSyntax.toAndConditionOpt(
                    Some(sqls"RecordAspects.recordId=Records.recordId"),
                    Some(sqls"aspectId=$aspectId"),
                    SQLUtils
                      .tenantIdToWhereClause(
                        tenantId,
                        "recordaspects.tenantid"
                      ),
                    Some(
                      sqls"((data->${propertyWithLink.propertyName})::jsonb ${sqls"??|"} ARRAY[$ids])"
                    )
                  )
                )
              )
          } else {
            SQLSyntax
              .exists(
                sqls"select 1 from RecordAspects".where(
                  SQLSyntax.toAndConditionOpt(
                    Some(sqls"RecordAspects.recordId=Records.recordId"),
                    Some(sqls"aspectId=$aspectId"),
                    SQLUtils
                      .tenantIdToWhereClause(
                        tenantId,
                        "recordaspects.tenantid"
                      ),
                    Some(
                      sqls"(data->>${propertyWithLink.propertyName} IN ($ids))"
                    )
                  )
                )
              )
          }

      }

      val excludeSelector =
        if (idsToExclude.isEmpty) None
        else Some(sqls"recordId not in ($idsToExclude)")

      val selectors = Seq(
        Some(SQLSyntax.join(dereferenceSelectors.toSeq, SQLSyntax.or)),
        excludeSelector
      )

      this.getRecords(
        tenantId,
        authDecision,
        aspectIds,
        optionalAspectIds,
        None,
        None,
        None,
        dereference,
        selectors
      )
    }
  }

  def getRecordAspectById(
      tenantId: TenantId,
      authDecision: AuthDecision,
      recordId: String,
      aspectId: String
  )(implicit session: DBSession): Option[JsObject] = {
    val config = AspectQueryToSqlConfig(
      recordIdSqlRef = "ras.recordid",
      tenantIdSqlRef = "ras.tenantid"
    )
    val authDecisionWhereClause = authDecision.toSql(config)

    sql"""select ras.aspectId as aspectId, Aspects.name as aspectName, data, ras.tenantId
          from RecordAspects AS ras
          inner join Aspects using (aspectId, tenantId)
          inner join Records using (recordId, tenantId)
          ${SQLSyntax.where(
      SQLSyntax.toAndConditionOpt(
        Some(
          sqls"(ras.recordId, ras.aspectId)=($recordId, $aspectId)"
        ),
        SQLUtils.tenantIdToWhereClause(tenantId, "ras.tenantid"),
        authDecisionWhereClause
      )
    )}"""
      .map(rowToAspect)
      .single
      .apply()
  }

  def getRecordAspects(
      tenantId: TenantId,
      authDecision: AuthDecision,
      recordId: String,
      keyword: Option[String] = None,
      aspectIdOnly: Option[Boolean] = None,
      start: Option[Int] = None,
      limit: Option[Int] = None
  )(implicit session: DBSession): List[JsValue] = {
    val config = AspectQueryToSqlConfig(
      recordIdSqlRef = "recordid",
      tenantIdSqlRef = "tenantid"
    )
    val authDecisionWhereClause = authDecision.toSql(config)
    val selectFields =
      if (aspectIdOnly.getOrElse(false)) sqls"aspectid"
      else sqls"aspectid, data"

    sql"""SELECT ${selectFields}
         FROM RecordAspects
         ${SQLSyntax.where(
      SQLSyntax.toAndConditionOpt(
        Some(
          sqls"recordId = $recordId"
        ),
        keyword.map { item =>
          sqls"(aspectid ILIKE ${s"%${item}%"} OR data::TEXT ILIKE ${s"%${item}%"})"
        },
        SQLUtils.tenantIdToWhereClause(tenantId, "tenantid"),
        authDecisionWhereClause
      )
    )}
    ORDER BY aspectid ASC, lastupdate DESC
    ${limit.map(v => sqls"LIMIT ${v}").getOrElse(SQLSyntax.empty)}
    ${start.map(v => sqls"OFFSET ${v}").getOrElse(SQLSyntax.empty)}
    """
      .map(rs => {
        if (aspectIdOnly.getOrElse(false)) {
          JsString(rs.string("aspectid"))
        } else {
          JsObject(
            "id" -> JsString(rs.string("aspectid")),
            "data" -> Try(JsonParser(rs.string("data")).asJsObject)
              .getOrElse(JsObject())
          )
        }
      })
      .list()
      .apply()
  }

  def getRecordAspectsCount(
      tenantId: TenantId,
      authDecision: AuthDecision,
      recordId: String,
      keyword: Option[String] = None
  )(implicit session: DBSession): Long = {
    val config = AspectQueryToSqlConfig(
      recordIdSqlRef = "recordid",
      tenantIdSqlRef = "tenantid"
    )
    val authDecisionWhereClause = authDecision.toSql(config)

    sql"""SELECT COUNT(*) as count
         FROM RecordAspects
         ${SQLSyntax.where(
      SQLSyntax.toAndConditionOpt(
        Some(
          sqls"recordId = $recordId"
        ),
        keyword.map { item =>
          sqls"(aspectid ILIKE ${s"%${item}%"} OR data::text ILIKE ${s"%${item}%"})"
        },
        SQLUtils.tenantIdToWhereClause(tenantId, "tenantid"),
        authDecisionWhereClause
      )
    )}"""
      .map(_.long("count"))
      .single()
      .apply()
      .getOrElse(0)
  }

  def getPageTokens(
      tenantId: TenantId,
      authDecision: AuthDecision,
      aspectIds: Iterable[String],
      limit: Option[Int] = None,
      recordSelector: Iterable[Option[SQLSyntax]] = Iterable()
  )(implicit session: DBSession): List[String] = {
    val recordsFilteredByTenantClause = SQLUtils.tenantIdToWhereClause(tenantId)

    val authQueryConditions = authDecision.toSql()

    val aspectWhereClauses = aspectIdsToWhereClause(
      aspectIds
    )

    val whereClause = SQLSyntax.where(
      SQLSyntax.toAndConditionOpt(
        (recordSelector.toSeq :+ aspectWhereClauses :+ authQueryConditions :+ recordsFilteredByTenantClause): _*
      )
    )

    sql"""SELECT sequence
        FROM
        (
            SELECT sequence, ROW_NUMBER() OVER (ORDER BY sequence) AS rownum
            FROM records
            ${whereClause}
        ) AS t
        WHERE t.rownum % ${limit
      .map(l => Math.min(l, maxResultCount))
      .getOrElse(defaultResultCount)} = 0
        ORDER BY t.sequence;"""
      .map(rs => {
        rs.string("sequence")
      })
      .list
      .apply()
  }

  def putRecordById(
      tenantId: SpecifiedTenantId,
      id: String,
      newRecord: Record,
      userId: String,
      forceSkipAspectValidation: Boolean = false,
      merge: Boolean = false
  )(implicit session: DBSession): Try[(Record, Long)] = {
    val newRecordWithoutAspects = newRecord.copy(aspects = Map())

    for {
      _ <- if (id == newRecord.id) Success(newRecord)
      else
        Failure(
          new ValidationException(
            "The provided ID does not match the record's ID."
          )
        )

      // --- validate aspects data against json schema
      _ <- Try {
        if (!forceSkipAspectValidation)
          aspectValidator.validateAspects(newRecord.aspects, tenantId)(
            session
          )
      }

      (oldRecordWithoutAspects, eventId) <- this.getByIdWithAspects(
        tenantId,
        UnconditionalTrueDecision,
        id,
        None,
        None
      ) match {
        case Some(record) => Success((record, None))
        // Possibility of a race condition here. The record doesn't exist, so we try to create it.
        // But someone else could have created it in the meantime. So if our create fails, try one
        // more time to get an existing one. We use a nested transaction so that, if the create fails,
        // we don't end up with an extraneous record creation event in the database.
        case None =>
          DB.localTx { nested =>
            // --- we never need to validate here (thus, set `forceSkipAspectValidation` = true)
            // --- as the aspect data has been validated (unless not required) in the beginning of current method
            createRecord(tenantId, newRecord, userId, true)(nested).map {
              result =>
                // --- result._1: record result._2: eventId
                (result._1.copy(aspects = Map()), Some(result._2))
            }
          } match {
            case Success(result) => Success(result)
            case Failure(e) =>
              this.getByIdWithAspects(
                tenantId,
                UnconditionalTrueDecision,
                id,
                None,
                None
              ) match {
                case Some(record) => Success((record, None))
                case None         => Failure(e)
              }
          }
      }
      recordPatch <- Try {
        // Diff the old record and the new one, ignoring aspects
        val oldRecordJson = oldRecordWithoutAspects.toJson
        val newRecordJson = newRecordWithoutAspects.toJson

        val diff = JsonDiff.diff(oldRecordJson, newRecordJson, remember = false)

        diff
      }

      // --- we never need to validate here (thus, set `forceSkipAspectValidation` = true)
      // --- as the aspect data has been validated (unless not required) in the beginning of current method
      result <- patchRecordById(
        tenantId,
        id,
        recordPatch,
        userId,
        true
      ) match {
        case Failure(e) => Failure(e)
        case Success((record, currentEventId)) =>
          if (eventId.isDefined) {
            Success((record, Math.max(currentEventId, eventId.get)))
          } else {
            Success((record, currentEventId))
          }
      }

      (patchedAspects, latestEventId) <- newRecord.aspects
        .map {
          case (aspectId, data) =>
            // --- we never need to validate here (thus, set `forceSkipAspectValidation` = true)
            // --- as the aspect data has been validated (unless not required) in the beginning of current method
            this
              .putRecordAspectById(
                tenantId,
                id,
                aspectId,
                data,
                userId,
                forceSkipAspectValidation = true,
                merge
              )
              .map(result => ((aspectId, result._1), result._2))
        }
        .foldLeft(Try((List[(String, JsObject)](), result._2)))((res, item) => {
          res match {
            case Failure(e) => Failure(e)
            case Success((aspects, lastestEventId)) =>
              item match {
                case Failure(e) => Failure(e)
                case Success(((aspectId, aspectData), currentEventId)) =>
                  Success(
                    (
                      (aspectId, aspectData) :: aspects,
                      Math.max(currentEventId, lastestEventId)
                    )
                  )
              }
          }
        })
    } yield
      (
        result._1.copy(
          aspects = patchedAspects.toMap,
          sourceTag = newRecord.sourceTag
        ),
        latestEventId
      )
  }

  def patchRecordById(
      tenantId: SpecifiedTenantId,
      id: String,
      recordPatch: JsonPatch,
      userId: String,
      forceSkipAspectValidation: Boolean = false
  )(implicit session: DBSession): Try[(Record, Long)] = {
    for {
      record <- this.getByIdWithAspects(
        tenantId,
        UnconditionalTrueDecision,
        id,
        None,
        None
      ) match {
        case Some(record) => Success(record)
        case None =>
          Failure(new RuntimeException("No record exists with that ID."))
      }

      // --- validate Aspect data against JSON schema
      // --- Check at the beginning to make sure no data is saved unless everything is valid
      _ <- Try {
        if (!forceSkipAspectValidation)
          aspectValidator.validateWithRecordPatch(recordPatch, id, tenantId)(
            session
          )
      }

      recordOnlyPatch <- Success(
        recordPatch.filter(
          op =>
            op.path match {
              case "aspects" / _ => false
              case _             => true
            }
        )
      )
      patchedRecord <- Try {
        recordOnlyPatch(record)
      }

      _ <- if (id == patchedRecord.id) Success(patchedRecord)
      else
        Failure(
          new RuntimeException("The patch must not change the record's ID.")
        )
      _ <- Try {
        // Sourcetag should not generate an event so updating it is done separately
        if (record.sourceTag != patchedRecord.sourceTag) {
          sql"""update Records set sourcetag = ${patchedRecord.sourceTag} where (recordId, tenantId) = ($id, ${tenantId.tenantId})""".update
            .apply()
        }
      }
      eventId <- Try {
        // only update / generate event if name have changed. Id can't change, aspect changes are handled separately
        if (record.name != patchedRecord.name) {
          val event =
            PatchRecordEvent(id, tenantId.tenantId, recordOnlyPatch).toJson.compactPrint
          val eventId =
            sql"insert into Events (eventTypeId, userId, tenantId, data) values (${PatchRecordEvent.Id}, ${userId}::uuid, ${tenantId.tenantId}, $event::json)"
              .updateAndReturnGeneratedKey()
              .apply()
          sql"""update Records set name = ${patchedRecord.name}, lastUpdate = $eventId
                  where (recordId, tenantId) = ($id, ${tenantId.tenantId})""".update
            .apply()

          Some(eventId)
        } else {
          None
        }
      }

      // --- We have validate the Json Patch in the beginning. Thus, any aspect operations below should skip the validation
      (aspectResults, latestEventId) <- processRecordPatchOperationsOnAspects(
        recordPatch,
        (aspectId: String, aspectData: JsObject) =>
          putRecordAspectById(
            tenantId,
            id,
            aspectId,
            aspectData,
            userId,
            true
          ).map(value => ((aspectId, value._1), value._2)),
        (aspectId: String, aspectPatch: JsonPatch) =>
          patchRecordAspectById(
            tenantId,
            id,
            aspectId,
            aspectPatch,
            userId,
            true
          ).map(value => ((aspectId, value._1), value._2)),
        (aspectId: String) =>
          deleteRecordAspect(tenantId, id, aspectId, userId)
            .map(value => ((aspectId, JsNull), value._2))
      ).foldLeft(Try((List[(String, JsValue)](), Option.empty[Long])))(
          (res, item) => {
            res match {
              case Failure(e) => Failure(e)
              case Success(resValue) =>
                item match {
                  case Failure(e) => Failure(e)
                  case Success((aspect, itemEventId)) =>
                    Success((aspect :: resValue._1, resValue._2 match {
                      case Some(eventId) => Some(Math.max(itemEventId, eventId))
                      case _             => Some(itemEventId)
                    }))
                }
            }
          }
        )
        // -- all eventId could be none: update record doesn't always generate events
        .map(value => (value._1, value._2.getOrElse(eventId.getOrElse(0L))))

    } yield
      (
        Record(
          patchedRecord.id,
          patchedRecord.name,
          aspectResults
            .filter({
              case (_, JsNull) => false // aspect was deleted
              case _           => true
            })
            .map(aspect => (aspect._1, aspect._2.asJsObject))
            .toMap,
          sourceTag = patchedRecord.sourceTag,
          tenantId = Some(tenantId.tenantId)
        ),
        latestEventId
      )
  }

  /**
    * Apply record json patch to a list of records (specified by recordIds) and return a list event id (for each of records)
    * @param tenantId
    * @param authDecision
    * @param recordIds
    * @param recordPatch
    * @param userId
    * @param forceSkipAspectValidation
    * @param session
    * @return
    */
  def patchRecords(
      tenantId: SpecifiedTenantId,
      authDecision: AuthDecision,
      recordIds: Seq[String],
      recordPatch: JsonPatch,
      userId: String,
      forceSkipAspectValidation: Boolean = false
  )(implicit session: DBSession): Try[Seq[Long]] = {
    Try {
      val noEmptyIds = recordIds.filter(!_.trim.isEmpty)
      if (noEmptyIds.isEmpty) {
        throw ServerError(
          "there is no non-empty ids supplied via `recordIds` parameter.",
          400
        )
      }
      val result = getRecords(
        tenantId,
        authDecision,
        Seq(),
        Seq(),
        None,
        None,
        Some(noEmptyIds.length),
        Some(false),
        List(Some(sqls"recordId in ($noEmptyIds)")),
        None,
        Some(noEmptyIds.length)
      )
      if (result.records.length != noEmptyIds.length) {
        throw ServerError(
          "You don't have permission to all records requested",
          403
        )
      }
    }.flatMap { _ =>
      recordIds
        .map(
          id =>
            patchRecordById(
              tenantId,
              id,
              recordPatch,
              userId,
              forceSkipAspectValidation
            ).map(_._2)
        )
        .foldLeft(Try(Seq[Long]())) {
          case (Success(result), Success(newItem)) => Success(result :+ newItem)
          case (_, Failure(ex))                    => Failure(ex)
          case (Failure(ex), _)                    => Failure(ex)
        }
    }

  }

  def patchRecordAspectById(
      tenantId: SpecifiedTenantId,
      recordId: String,
      aspectId: String,
      aspectPatch: JsonPatch,
      userId: String,
      forceSkipAspectValidation: Boolean = false
  )(implicit session: DBSession): Try[(JsObject, Long)] = {
    for {
      aspect <- (this.getRecordAspectById(
        tenantId,
        UnconditionalTrueDecision,
        recordId,
        aspectId
      ) match {
        case Some(aspect) => Success(aspect)
        // --- should not create a default empty aspect: empty aspect will likely be invalid if schema requires certain fields
        case None => Success(JsObject())
      })

      patchedAspect <- Try {
        aspectPatch(aspect).asJsObject
      }

      // --- validate Aspect data against JSON schema
      _ <- Try {
        if (!forceSkipAspectValidation)
          aspectValidator.validate(aspectId, patchedAspect, tenantId)(
            session
          )
      }

      testRecordAspectPatch <- Try {

        // Diff the old record aspect and the patched one to see whether an event should be created
        val oldAspectJson = aspect.toJson
        val newAspectJson = patchedAspect.toJson

        JsonDiff.diff(oldAspectJson, newAspectJson, remember = false)
      }

      eventId <- Try {
        if (testRecordAspectPatch.ops.nonEmpty) {
          val event = PatchRecordAspectEvent(
            recordId,
            tenantId.tenantId,
            aspectId,
            aspectPatch
          ).toJson.compactPrint
          sql"insert into Events (eventTypeId, userId, tenantId, data) values (${PatchRecordAspectEvent.Id}, ${userId}::uuid, ${tenantId.tenantId}, $event::json)"
            .updateAndReturnGeneratedKey()
            .apply()
        } else {
          0
        }
      }

      _ <- Try {
        if (testRecordAspectPatch.ops.nonEmpty) {
          val jsonString = patchedAspect.compactPrint
          sql"""insert into RecordAspects (recordId, tenantId, aspectId, lastUpdate, data)
              values ($recordId, ${tenantId.tenantId}, $aspectId, $eventId, $jsonString::json)
              on conflict (aspectId, recordId, tenantId) do update
              set lastUpdate = $eventId, data = $jsonString::json
          """.update.apply()
        } else {
          0
        }
      }
    } yield (patchedAspect, eventId)
  }

  def putRecordsAspectById(
      tenantId: SpecifiedTenantId,
      authDecision: AuthDecision,
      recordIds: Seq[String],
      aspectId: String,
      newAspect: JsObject,
      userId: String,
      forceSkipAspectValidation: Boolean = false,
      merge: Boolean = false
  )(implicit session: DBSession): Try[Seq[Long]] = {
    Try {
      val noEmptyIds = recordIds.filter(!_.trim.isEmpty)
      if (noEmptyIds.isEmpty) {
        throw ServerError(
          "there is no non-empty ids supplied via `recordIds` parameter.",
          400
        )
      }
      val result = getRecords(
        tenantId,
        authDecision,
        Seq(),
        Seq(),
        None,
        None,
        Some(noEmptyIds.length),
        Some(false),
        List(Some(sqls"recordId in ($noEmptyIds)")),
        None,
        Some(noEmptyIds.length)
      )
      if (result.records.length != noEmptyIds.length) {
        throw ServerError(
          "You don't have permission to all records requested",
          403
        )
      }
    }.flatMap { _ =>
      recordIds
        .map(
          id =>
            putRecordAspectById(
              tenantId,
              id,
              aspectId,
              newAspect,
              userId,
              forceSkipAspectValidation,
              merge
            ).map(_._2)
        )
        .foldLeft(Try(Seq[Long]())) {
          case (Success(result), Success(newItem)) => Success(result :+ newItem)
          case (_, Failure(ex))                    => Failure(ex)
          case (Failure(ex), _)                    => Failure(ex)
        }
    }

  }

  def putRecordAspectById(
      tenantId: SpecifiedTenantId,
      recordId: String,
      aspectId: String,
      newAspect: JsObject,
      userId: String,
      forceSkipAspectValidation: Boolean = false,
      merge: Boolean = false
  )(implicit session: DBSession): Try[(JsObject, Long)] = {

    (getRecordAspectById(
      tenantId,
      UnconditionalTrueDecision,
      recordId,
      aspectId
    ) match {
      case Some(aspect) => Success((aspect, None))
      // Possibility of a race condition here. The aspect doesn't exist, so we try to create it.
      // But someone else could have created it in the meantime. So if our create fails, try one
      // more time to get an existing one. We use a nested transaction so that, if the create fails,
      // we don't end up with an extraneous record creation event in the database.
      case None =>
        DB.localTx { nested =>
          createRecordAspect(
            tenantId,
            recordId,
            aspectId,
            newAspect,
            userId,
            forceSkipAspectValidation
          )(nested)
        } match {
          case Success((aspect, eventId)) => Success((aspect, Some(eventId)))
          case Failure(e) =>
            getRecordAspectById(
              tenantId,
              UnconditionalTrueDecision,
              recordId,
              aspectId
            ) match {
              case Some(aspect) => Success((aspect, None))
              case None         => Failure(e)
            }
        }
    }).flatMap { result =>
      val oldAspect = result._1
      val eventId = result._2
      val finalAspectData = if (merge) {
        JsonUtils.merge(oldAspect, newAspect)
      } else {
        newAspect
      }

      if (!forceSkipAspectValidation) {
        // --- validate Aspect data against JSON schema
        aspectValidator.validate(aspectId, finalAspectData, tenantId)(
          session
        )
      }

      // Diff the old record aspect and the new one
      val oldAspectJson = oldAspect.toJson
      val finalAspectDataJson = finalAspectData.toJson

      val recordAspectPatch =
        JsonDiff.diff(oldAspectJson, finalAspectDataJson, remember = false)

      // --- we never need to validate here (thus, set `forceSkipAspectValidation` = true)
      // --- as the aspect data has been validated (unless not required)
      patchRecordAspectById(
        tenantId,
        recordId,
        aspectId,
        recordAspectPatch,
        userId,
        true
      ) match {
        case Failure(e) => Failure(e)
        case Success((aspectData, patchEventId)) =>
          if (eventId.isDefined) {
            Success(aspectData, Math.max(patchEventId, eventId.get))
          } else {
            Success(aspectData, patchEventId)
          }
      }
    }
  }

  def createRecord(
      tenantId: SpecifiedTenantId,
      record: Record,
      userId: String,
      forceSkipAspectValidation: Boolean = false
  )(implicit session: DBSession): Try[(Record, Long)] = {
    for {

      // --- validate aspects data against json schema
      _ <- Try {
        if (!forceSkipAspectValidation)
          aspectValidator.validateAspects(record.aspects, tenantId)(
            session
          )
      }

      eventId <- Try {
        val eventJson =
          CreateRecordEvent(
            record.id,
            tenantId.tenantId,
            record.name
          ).toJson.compactPrint
        sql"insert into Events (eventTypeId, userId, tenantId, data) values (${CreateRecordEvent.Id}, ${userId}::uuid, ${tenantId.tenantId}, $eventJson::json)".updateAndReturnGeneratedKey
          .apply()
      }
      _ <- Try {
        sql"""insert into Records (recordId, tenantId, name, lastUpdate, sourcetag) values (${record.id}, ${tenantId.tenantId}, ${record.name}, $eventId, ${record.sourceTag})""".update
          .apply()
      } match {
        case Failure(e: SQLException)
            if e.getSQLState.substring(0, 2) == "23" =>
          Failure(
            new RuntimeException(
              s"Cannot create record '${record.id}' because a record with that ID already exists."
            )
          )
        case anythingElse => anythingElse
      }

      // --- we never need to validate here (thus, set `forceSkipAspectValidation` = true)
      // --- as the aspect data has been validated (unless not required) in the beginning of current method
      lastestEventId <- record.aspects
        .map(
          aspect =>
            createRecordAspect(
              tenantId,
              record.id,
              aspect._1,
              aspect._2,
              userId,
              true
            )(session)
        )
        .foldLeft(Try(eventId))((finalResult, result) => {
          if (finalResult.isFailure) {
            finalResult
          } else {
            result match {
              case Failure(e) => Failure(e)
              case Success((_, aspectEventId)) =>
                Success(Math.max(finalResult.get, aspectEventId))
            }
          }
        })

    } yield (record.copy(tenantId = Some(tenantId.tenantId)), lastestEventId)
  }

  def deleteRecord(
      tenantId: SpecifiedTenantId,
      recordId: String,
      userId: String
  )(implicit session: DBSession): Try[(Boolean, Long)] = {
    for {
      aspects <- Try {
        sql"select aspectId from RecordAspects where (recordId, tenantId)=($recordId, ${tenantId.tenantId})"
          .map(rs => rs.string("aspectId"))
          .list
          .apply()
      }
      _ <- aspects
        .map(
          aspectId => deleteRecordAspect(tenantId, recordId, aspectId, userId)
        )
        .find(_.isFailure) match {
        case Some(Failure(e)) => Failure(e)
        case _                => Success(aspects)
      }
      rowsDeleted <- Try {
        sql"""delete from Records where (recordId, tenantId)=($recordId, ${tenantId.tenantId})""".update
          .apply()
      }
      eventId <- Try {
        if (rowsDeleted > 0) {
          // --- only generate event when the record did removed
          val eventJson =
            DeleteRecordEvent(recordId, tenantId.tenantId).toJson.compactPrint
          sql"insert into Events (eventTypeId, userId, tenantId, data) values (${DeleteRecordEvent.Id}, ${userId}::uuid, ${tenantId.tenantId}, $eventJson::json)".updateAndReturnGeneratedKey
            .apply()
        } else {
          // --- No record has been deleted, return - as event ID
          0L
        }

      }
    } yield (rowsDeleted > 0, eventId)
  }

  def deleteRecordAspectArrayItems(
      tenantId: SpecifiedTenantId,
      recordId: String,
      aspectId: String,
      jsonPath: String,
      jsonItems: Seq[JsValue],
      userId: String,
      forceSkipAspectValidation: Boolean = false
  )(implicit session: DBSession): Try[(Boolean, Long)] = {
    getRecordAspectById(
      tenantId,
      UnconditionalTrueDecision,
      recordId,
      aspectId
    ).map { aspectData =>
      val newAspectData = JsonUtils.deleteJsonArrayItemsByJsonPath(
        aspectData,
        jsonPath,
        jsonItems
      )
      putRecordAspectById(
        tenantId,
        recordId,
        aspectId,
        newAspectData.asJsObject,
        userId,
        forceSkipAspectValidation,
        false
      ).map { v =>
        (true, v._2) // true and eventId
      }
    } match {
      case Some(v) => v
      case None    => Try(false, 0)
    }
  }

  def deleteRecordsAspectArrayItems(
      tenantId: SpecifiedTenantId,
      authDecision: AuthDecision,
      recordIds: Seq[String],
      aspectId: String,
      jsonPath: String,
      jsonItems: Seq[JsValue],
      userId: String,
      forceSkipAspectValidation: Boolean = false
  )(implicit session: DBSession): Try[Seq[Long]] = {
    Try {
      val noEmptyIds = recordIds.filter(!_.trim.isEmpty)
      if (noEmptyIds.isEmpty) {
        throw ServerError(
          "there is no non-empty ids supplied via `recordIds` parameter.",
          400
        )
      }
      val result = getRecords(
        tenantId,
        authDecision,
        Seq(),
        Seq(),
        None,
        None,
        Some(noEmptyIds.length),
        Some(false),
        List(Some(sqls"recordId in ($noEmptyIds)")),
        None,
        Some(noEmptyIds.length)
      )
      if (result.records.length != noEmptyIds.length) {
        throw ServerError(
          "You don't have permission to all records requested",
          403
        )
      }
    }.flatMap { _ =>
      recordIds
        .map(
          id =>
            deleteRecordAspectArrayItems(
              tenantId,
              id,
              aspectId,
              jsonPath,
              jsonItems,
              userId,
              forceSkipAspectValidation
            ).map(_._2)
        )
        .foldLeft(Try(Seq[Long]())) {
          case (Success(result), Success(newItem)) => Success(result :+ newItem)
          case (_, Failure(ex))                    => Failure(ex)
          case (Failure(ex), _)                    => Failure(ex)
        }
    }
  }

  def trimRecordsBySource(
      tenantId: SpecifiedTenantId,
      sourceTagToPreserve: String,
      sourceId: String,
      userId: String,
      logger: Option[LoggingAdapter] = None
  )(implicit session: DBSession): Try[Long] = {
    val recordIds = Try {
      sql"select distinct records.recordId, sourcetag from Records INNER JOIN recordaspects ON (records.recordid, records.tenantId) = (recordaspects.recordid, recordaspects.tenantId) where (sourcetag != $sourceTagToPreserve OR sourcetag IS NULL) and recordaspects.aspectid = 'source' and recordaspects.data->>'id' = $sourceId and Records.tenantId = ${tenantId.tenantId}"
        .map(rs => rs.string("recordId"))
        .list
        .apply()
    }

    val result = recordIds match {
      case Success(Nil) => Success(0L)
      case Success(ids) =>
        ids
          .map(recordId => deleteRecord(tenantId, recordId, userId))
          .foldLeft[Try[Long]](Success(0L))(
            (trySoFar: Try[Long], thisTry: Try[(Boolean, Long)]) =>
              (trySoFar, thisTry) match {
                case (Success(countSoFar), Success((bool, eventId))) =>
                  Success(countSoFar + (if (bool) 1 else 0))
                case (Failure(err), _) => Failure(err)
                case (_, Failure(err)) => Failure(err)
              }
          )
      case Failure(err) => Failure(err)
    }

    result match {
      case Success(count: Long) =>
        if (logger.isDefined) {
          logger.get.info(s"Trimmed $count records.")
        }
        Success(count)
      case Failure(err) =>
        if (logger.isDefined) {
          logger.get.error(err, "Error happened when trimming records.")
        }
        Failure(err)
    }

  }

  def createRecordAspect(
      tenantId: SpecifiedTenantId,
      recordId: String,
      aspectId: String,
      aspect: JsObject,
      userId: String,
      forceSkipAspectValidation: Boolean = false
  )(implicit session: DBSession): Try[(JsObject, Long)] = {
    for {

      _ <- Try {
        if (!forceSkipAspectValidation)
          aspectValidator.validate(aspectId, aspect, tenantId)(session)
      }

      eventId <- Try {
        val eventJson = CreateRecordAspectEvent(
          recordId,
          tenantId.tenantId,
          aspectId,
          aspect
        ).toJson.compactPrint
        sql"insert into Events (eventTypeId, userId, tenantId, data) values (${CreateRecordAspectEvent.Id}, ${userId}::uuid, ${tenantId.tenantId}, $eventJson::json)".updateAndReturnGeneratedKey
          .apply()
      }
      insertResult <- Try {
        val jsonData = aspect.compactPrint
        sql"""insert into RecordAspects (recordId, tenantId, aspectId, lastUpdate, data) values ($recordId, ${tenantId.tenantId}, $aspectId, $eventId, $jsonData::json)""".update
          .apply()
        aspect
      } match {
        case Failure(e: SQLException)
            if e.getSQLState.substring(0, 2) == "23" =>
          Failure(
            new RuntimeException(
              s"Cannot create aspect '$aspectId' for record '$recordId' because the record or aspect does not exist, or because data already exists for that combination of record and aspect."
            )
          )
        case anythingElse => anythingElse
      }
    } yield (insertResult, eventId)
  }

  def deleteRecordAspect(
      tenantId: SpecifiedTenantId,
      recordId: String,
      aspectId: String,
      userId: String
  )(implicit session: DBSession): Try[(Boolean, Long)] = {
    for {
      eventId <- Try {
        val eventJson =
          DeleteRecordAspectEvent(recordId, tenantId.tenantId, aspectId).toJson.compactPrint
        sql"insert into Events (eventTypeId, userId, tenantId, data) values (${DeleteRecordAspectEvent.Id}, ${userId}::uuid, ${tenantId.tenantId}, $eventJson::json)".updateAndReturnGeneratedKey
          .apply()
      }
      rowsDeleted <- Try {
        sql"""delete from RecordAspects where (aspectId, recordId, tenantId)=($aspectId, $recordId, ${tenantId.tenantId})""".update
          .apply()
      }
    } yield (rowsDeleted > 0, eventId)
  }

  def reconstructRecordFromEvents(
      id: String,
      events: Source[RegistryEvent, NotUsed],
      aspects: Iterable[String],
      optionalAspects: Iterable[String]
  ): Source[Option[Record], NotUsed] = {
    // TODO: can probably simplify some of this with lenses or whatever
    events
      .fold[JsValue](JsNull)(
        (recordValue, event) =>
          event.eventType match {
            case EventType.CreateRecord =>
              JsObject(
                "id" -> event.data.fields("recordId"),
                "name" -> event.data.fields("name"),
                "tenantId" -> JsNumber(event.tenantId),
                "sourceTag" -> JsNull,
                "aspects" -> JsObject()
              )
            case EventType.PatchRecord =>
              event.data.fields("patch").convertTo[JsonPatch].apply(recordValue)
            case EventType.DeleteRecord => JsNull
            case EventType.CreateRecordAspect =>
              val createAspectEvent = (JsObject(
                event.data.fields + ("tenantId" -> JsNumber(event.tenantId))
              )).convertTo[CreateRecordAspectEvent]
              val record = recordValue.asJsObject
              val existingFields = record.fields
              val existingAspects = record.fields("aspects").asJsObject.fields
              val newAspects = existingAspects + (createAspectEvent.aspectId -> createAspectEvent.aspect)
              val newFields = existingFields + ("aspects" -> JsObject(
                newAspects
              ))
              JsObject(newFields)
            case EventType.PatchRecordAspect =>
              val patchRecordAspectEvent = (JsObject(
                event.data.fields + ("tenantId" -> JsNumber(event.tenantId))
              )).convertTo[PatchRecordAspectEvent]
              val record = recordValue.asJsObject
              val existingFields = record.fields
              val existingAspects = record.fields("aspects").asJsObject.fields
              val existingAspect =
                existingAspects(patchRecordAspectEvent.aspectId)
              val newAspects = existingAspects + (patchRecordAspectEvent.aspectId -> patchRecordAspectEvent.patch
                .apply(existingAspect))
              val newFields = existingFields + ("aspects" -> JsObject(
                newAspects
              ))
              JsObject(newFields)
            case EventType.DeleteRecordAspect =>
              val deleteRecordAspectEvent =
                (JsObject(
                  event.data.fields + ("tenantId" -> JsNumber(event.tenantId))
                )).convertTo[DeleteRecordAspectEvent]
              val record = recordValue.asJsObject
              val existingFields = record.fields
              val existingAspects = record.fields("aspects").asJsObject.fields
              val newAspects = existingAspects - deleteRecordAspectEvent.aspectId
              val newFields = existingFields + ("aspects" -> JsObject(
                newAspects
              ))
              JsObject(newFields)
            case _ => recordValue
          }
      )
      .map {
        case obj: JsObject => Some(obj.convertTo[Record])
        case _             => None
      }
  }

  def getLinkedRecordIds(
      recordId: String,
      aspectIds: Iterable[String] = List()
  )(implicit session: DBSession): Try[Iterable[String]] = {

    /** For aspects that have links to other aspects, a map of the ids of those aspects to the location (first-level, not path) in their JSON where the link is  */
    val referenceMap = this.buildReferenceMap(aspectIds)

    Try {
      (referenceMap
        .map {
          case (aspectId, property) =>
            val selectClause =
              if (property.isArray)
                sqls"jsonb_array_elements_text(data->${property.propertyName})"
              else sqls"data->>${property.propertyName}"

            sql"""SELECT DISTINCT $selectClause AS recordId
              FROM recordaspects
              WHERE aspectId = ${aspectId} AND recordId = ${recordId}"""
              .map(
                rs => rs.stringOpt("recordId").toList
              )
              .list()
              .apply()
        })
        .flatten
        .flatten
    }
  }

  // The current implementation assumes this API is not used by the system tenant.
  // Is this what we want?
  // See ticket https://github.com/magda-io/magda/issues/2359
  private def getSummaries(
      tenantId: TenantId,
      authDecision: AuthDecision,
      pageToken: Option[String],
      start: Option[Int],
      rawLimit: Option[Int],
      recordId: Option[String] = None,
      reversePageTokenOrder: Option[Boolean] = None
  )(implicit session: DBSession): RecordsPage[RecordSummary] = {
    val idWhereClause = recordId.map(id => sqls"Records.recordId=$id")
    val authDecisionCondition = authDecision.toSql()

    val whereClauseParts = Seq(idWhereClause) :+ authDecisionCondition :+ SQLUtils
      .tenantIdToWhereClause(tenantId) :+ pageToken
      .map(
        token =>
          if (reversePageTokenOrder.getOrElse(false))
            sqls"Records.sequence < ${token.toLong}"
          else sqls"Records.sequence > ${token.toLong}"
      )
    val limit = rawLimit.getOrElse(defaultResultCount)

    val orderBy =
      if (reversePageTokenOrder.getOrElse(false))
        sqls"order by sequence DESC"
      else sqls"order by sequence"

    val result =
      sql"""select Records.sequence as sequence,
                   Records.recordId as recordId,
                   Records.name as recordName,
                   (select array_agg(aspectId) from RecordAspects ${SQLSyntax
        .where(
          SQLSyntax.toAndConditionOpt(
            Some(sqls"recordId = Records.recordId"),
            SQLUtils
              .tenantIdToWhereClause(tenantId, "tenantid")
          )
        )}) as aspects,
                   Records.tenantId as tenantId
            from Records
            ${SQLSyntax.where(SQLSyntax.toAndConditionOpt(whereClauseParts: _*))}
            ${orderBy}
            offset ${start.getOrElse(0)}
            limit ${limit + 1}"""
        .map(rs => {
          (rs.long("sequence"), rowToRecordSummary(rs))
        })
        .list
        .apply()

    val hasMore = result.length > limit
    val trimmed = result.take(limit)
    val lastSequence = if (hasMore) Some(trimmed.last._1) else None
    val pageResults = trimmed.map(_._2)

    RecordsPage[RecordSummary](
      lastSequence.isDefined,
      lastSequence.map(_.toString),
      pageResults
    )
  }

  private def getRecords(
      tenantId: TenantId,
      authDecision: AuthDecision,
      aspectIds: Iterable[String],
      optionalAspectIds: Iterable[String],
      pageToken: Option[Long] = None,
      start: Option[Int] = None,
      rawLimit: Option[Int] = None,
      dereference: Option[Boolean] = None,
      recordSelector: Iterable[Option[SQLSyntax]] = Iterable(),
      orderBy: Option[OrderByDef] = None,
      maxLimit: Option[Int] = None,
      reversePageTokenOrder: Option[Boolean] = None
  )(implicit session: DBSession): RecordsPage[Record] = {

    if (orderBy.isDefined && pageToken.isDefined) {
      throw new Error(
        "`orderBy` and `pageToken` parameters cannot be both specified."
      )
    }

    val recordsFilteredByTenantClause = SQLUtils.tenantIdToWhereClause(
      tenantId
    )

    val authQueryConditions = authDecision.toSql()

    val theRecordSelector = recordSelector ++ Iterable(
      recordsFilteredByTenantClause
    )

    val aspectWhereClauses = aspectIdsToWhereClause(
      aspectIds
    )

    val whereClauseParts: Seq[Option[SQLSyntax]] =
      theRecordSelector.toSeq :+ aspectWhereClauses :+ authQueryConditions :+ pageToken
        .map(
          token =>
            if (reversePageTokenOrder.getOrElse(false))
              sqls"Records.sequence < $token"
            else sqls"Records.sequence > $token"
        )

    val aspectSelectors = aspectIdsToSelectClauses(
      tenantId,
      authDecision,
      List.concat(aspectIds, optionalAspectIds), // aspectIds must come before optionalAspectIds.
      dereference.getOrElse(false)
    )

    val limit = rawLimit
      .map(l => Math.min(l, maxLimit.getOrElse(maxResultCount)))
      .getOrElse(defaultResultCount)

    val rawTempName = ColumnNamePrefixType.PREFIX_TEMP.toString
    // Create unsafely so that column names will look like temp.aspect0 and temp.sequence.
    // Otherwise it will look like 'temp'.aspect0 and 'temp'.sequence.
    val tempName = SQLSyntax.createUnsafely(rawTempName)

    val orderBySql = orderBy match {
      case None =>
        if (reversePageTokenOrder.getOrElse(false))
          SQLSyntax.orderBy(sqls"${tempName}.sequence").desc
        else
          SQLSyntax.orderBy(sqls"${tempName}.sequence")
      case Some(orderBy) =>
        orderBy.getSql(
          List.concat(aspectIds, optionalAspectIds),
          Some(rawTempName)
        )
    }

    val nonNullAspectsWhereClause =
      SQLSyntax.where(SQLSyntax.joinWithAnd(aspectIds.zipWithIndex.map {
        case (_, index) =>
          val name = getAspectColumnName(
            index,
            prefix = ColumnNamePrefixType.PREFIX_TEMP
          )
          sqls"$name is not null"
      }.toSeq: _*))

    val rawResult: SQL[Nothing, NoExtractor] =
      sql"""select * from (
              select Records.sequence as sequence,
                     Records.recordId as recordId,
                     Records.name as recordName,
                     Records.tenantId as tenantId
                     ${if (aspectSelectors.nonEmpty) sqls", $aspectSelectors"
      else SQLSyntax.empty},
                     Records.sourcetag as sourceTag
              from Records
              ${SQLSyntax.where(
        SQLSyntax.toAndConditionOpt(whereClauseParts: _*)
      )}
            ) as $tempName
            ${if (aspectIds.nonEmpty) sqls"$nonNullAspectsWhereClause"
      else SQLSyntax.empty}
            ${orderBySql}
            offset ${start.getOrElse(0)}
            limit ${limit + 1}
        """

    val result = rawResult
      .map(rs => {
        (
          rs.long("sequence"),
          rowToRecord(List.concat(aspectIds, optionalAspectIds))(rs)
        )
      })
      .list
      .apply()

    val hasMore = result.length > limit
    val trimmed = result.take(limit)
    val lastSequence = if (hasMore) Some(trimmed.last._1) else None
    val pageResults = trimmed.map(_._2)

    RecordsPage(hasMore, lastSequence.map(_.toString), pageResults)
  }

  private def getCountInner(
      tenantId: TenantId,
      authDecision: AuthDecision,
      aspectIds: Iterable[String],
      aspectQueries: Iterable[AspectQuery] = Nil,
      aspectOrQueries: Iterable[AspectQuery] = Nil
  )(implicit session: DBSession): Long = {

    val statement = if (aspectIds.size == 1) {
      // If there's only one aspect id, it's much much more efficient to query the recordaspects table rather than records.
      // Because a record cannot have more than one aspect for each type, counting the number of recordaspects with a certain aspect type
      // is equivalent to counting the records with that type
      val aspectIdsWhereClause = Some(
        sqls"ras_tbl.aspectId=${aspectIds.head}"
      )

      val aspectQueriesClause =
        getSqlFromAspectQueries(
          aspectQueries.toSeq,
          aspectOrQueries.toSeq,
          "ras_tbl.recordid",
          "ras_tbl.tenantid"
        )

      val config = AspectQueryToSqlConfig(
        recordIdSqlRef = "ras_tbl.recordid",
        tenantIdSqlRef = "ras_tbl.tenantid"
      )
      val whereClauses = SQLSyntax.where(
        SQLSyntax.toAndConditionOpt(
          aspectIdsWhereClause,
          SQLUtils.tenantIdToWhereClause(tenantId, "ras_tbl.tenantid"),
          authDecision.toSql(config),
          aspectQueriesClause
        )
      )
      sql"select count(*) from RecordAspects as ras_tbl ${whereClauses}"
    } else {
      // If there's zero or > 1 aspect ids involved then there's no advantage to querying record aspects instead.
      val aspectIdsWhereClause = aspectIdsToWhereClause(aspectIds)

      val aspectQueriesClause =
        getSqlFromAspectQueries(aspectQueries.toSeq, aspectOrQueries.toSeq)

      val whereClauses = SQLSyntax.where(
        SQLSyntax.toAndConditionOpt(
          aspectIdsWhereClause,
          SQLUtils.tenantIdToWhereClause(tenantId),
          authDecision.toSql(),
          aspectQueriesClause
        )
      )
      sql"select count(*) from Records ${whereClauses}"
    }

    statement.map(_.long(1)).single.apply().getOrElse(0L)
  }

  private def rowToRecordSummary(rs: WrappedResultSet): RecordSummary = {
    RecordSummary(
      rs.string("recordId"),
      rs.string("recordName"),
      rs.arrayOpt("aspects")
        .map(_.getArray().asInstanceOf[Array[String]].toList)
        .getOrElse(List()),
      rs.bigIntOpt("tenantId").map(BigInt.apply)
    )
  }

  private def rowToRecord(
      aspectIds: Iterable[String]
  )(rs: WrappedResultSet): Record = {
    Record(
      rs.string("recordId"),
      rs.string("recordName"),
      aspectIds.zipWithIndex
        .filter {
          case (_, index) => rs.stringOpt(s"aspect$index").isDefined
        }
        .map {
          case (aspectId, index) =>
            (aspectId, JsonParser(rs.string(s"aspect$index")).asJsObject)
        }
        .toMap,
      rs.stringOpt("sourceTag"),
      rs.bigIntOpt("tenantId").map(BigInt.apply)
    )
  }

  private def rowToAspect(rs: WrappedResultSet): JsObject = {
    JsonParser(rs.string("data")).asJsObject
  }

  def buildReferenceMap(
      aspectIds: Iterable[String]
  )(implicit session: DBSession): Map[String, PropertyWithLink] = {
    if (aspectIds.isEmpty) {
      Map()
    } else {
      val aspects: List[(String, Option[JsObject])] =
        sql"""select aspectId, jsonSchema
            from Aspects
            where aspectId in ($aspectIds)
          """
          .map(rs => {
            if (rs.stringOpt("jsonSchema").isDefined)
              (
                rs.string("aspectId"),
                Some(JsonParser(rs.string("jsonSchema")).asJsObject)
              )
            else
              (rs.string("aspectId"), None)
          })
          .list
          .apply()

      aspects
        .map {
          case (aspectId, jsonSchema) =>
            // This aspect can only have links if it uses hyper-schema
            if (jsonSchema.isDefined && jsonSchema.get.fields
                  .getOrElse("$schema", JsString(""))
                  .toString()
                  .contains("hyper-schema")) {
              // TODO: support multiple linked properties in an aspect.

              val properties = jsonSchema.get.fields
                .get("properties")
                .flatMap {
                  case JsObject(theProperties) => Some(theProperties)
                  case _                       => None
                }
                .getOrElse(Map())

              val propertyWithLinks = properties
                .map {
                  case (propertyName, property) =>
                    val linksInProperties =
                      property.extract[JsValue]('links.? / filter { value =>
                        val relPredicate = 'rel.is[String](_ == "item")
                        val hrefPredicate =
                          'href.is[String](_ == "/api/v0/registry/records/{$}")
                        relPredicate(value) && hrefPredicate(value)
                      })

                    val linksInItems = property.extract[JsValue](
                      'items.? / 'links.? / filter { value =>
                        val relPredicate = 'rel.is[String](_ == "item")
                        val hrefPredicate =
                          'href.is[String](_ == "/api/v0/registry/records/{$}")
                        relPredicate(value) && hrefPredicate(value)
                      }
                    )

                    if (linksInProperties.nonEmpty) {
                      Some(PropertyWithLink(propertyName, isArray = false))
                    } else if (linksInItems.nonEmpty) {
                      Some(PropertyWithLink(propertyName, isArray = true))
                    } else {
                      None
                    }
                }
                .filter(_.isDefined)
                .map(_.get)

              propertyWithLinks.map(property => (aspectId, property)).headOption
            } else {
              None
            }
        }
        .filter(_.isDefined)
        .map(_.get)
        .toMap
    }
  }

  private def getAspectColumnName(
      index: Int,
      prefix: ColumnNamePrefixType.Value = ColumnNamePrefixType.PREFIX_EMPTY
  ): SQLSyntax = {
    val prefixStr =
      if (prefix == ColumnNamePrefixType.PREFIX_TEMP) prefix.toString + "."
      else prefix.toString
    // Use a simple numbered column name rather than trying to make the aspect name safe.
    SQLSyntax.createUnsafely(prefixStr + s"aspect$index")
  }

  private def aspectIdsToSelectClauses(
      tenantId: TenantId,
      authDecision: AuthDecision,
      aspectIds: Iterable[String],
      dereference: Boolean = false
  )(implicit session: DBSession): Iterable[scalikejdbc.SQLSyntax] = {
    val tenantFilterCondition = SQLUtils.tenantIdToWhereClause(tenantId)
    val authDecisionCondition = authDecision.toSql()

    val accessControlConditions =
      SQLSyntax.toAndConditionOpt(authDecisionCondition, tenantFilterCondition)
    val accessControlConditionsWhere = SQLSyntax.where(accessControlConditions)

    val referenceDetails =
      buildReferenceMap(aspectIds.toSeq)

    val result: Iterable[SQLSyntax] = aspectIds.zipWithIndex.map {
      case (aspectId, index) =>
        val aspectColumnName = getAspectColumnName(index)

        val selection = referenceDetails
          .get(aspectId)
          .map {
            case PropertyWithLink(propertyName, true) =>
              // The property is an array
              val linkedAspectsClause =
                if (dereference)
                  sqls"""
                    -- If a link exists in this aspect, then get every aspect from the linked record and bung it in
                    -- to the aspect data
                    CASE WHEN EXISTS (SELECT FROM jsonb_array_elements_text(RecordAspects.data->$propertyName)) THEN (
                      SELECT jsonb_set(
                        RecordAspects.data,
                        ${"{\"" + propertyName + "\"}"}::text[],
                        jsonb_agg(
                          jsonb_strip_nulls(
                            jsonb_build_object(
                              'id',
                              Records.recordId,
                              'name',
                              Records.name,
                              'aspects',
                              (
                                SELECT jsonb_object_agg(aspectId, data)
                                FROM RecordAspects
                                WHERE tenantId=Records.tenantId AND recordId=Records.recordId
                              )
                            )
                          )
                          order by ordinality
                        )
                      )
                      FROM Records
                      INNER JOIN jsonb_array_elements_text(RecordAspects.data->$propertyName)
                        WITH ordinality AS aggregatedId
                        ON aggregatedId.value=Records.recordId AND RecordAspects.tenantId=Records.tenantId
                      ${accessControlConditionsWhere}
                    )
                    -- If there's no link in this aspect, just get the raw aspect data
                    ELSE (
                      select data from RecordAspects
                      where (aspectId, recordid, tenantId) = ($aspectId, Records.recordId, Records.tenantId)
                    )
                    END
                  """
                else
                  sqls"""
                    -- If the linked value exists, set the property to the id of the record it links to
                    CASE WHEN EXISTS (SELECT FROM jsonb_array_elements_text(RecordAspects.data->$propertyName)) THEN (
                      select jsonb_set(
                        RecordAspects.data,
                        ${"{\"" + propertyName + "\"}"}::text[],
                        jsonb_agg(Records.recordId)
                      )
                      from Records
                      inner join jsonb_array_elements_text(RecordAspects.data->$propertyName) as aggregatedId
                      on aggregatedId=Records.recordId and RecordAspects.tenantId=Records.tenantId
                      ${accessControlConditionsWhere}
                    )
                    -- If there's no linked value, just return the raw aspect data
                    ELSE (
                      select data from RecordAspects
                      where (aspectId, recordid, tenantId) = ($aspectId, Records.recordId, Records.tenantId)
                    )
                    END
                  """

              // Return the linked aspects if there are any, otherwise just return an empty array.
              sqls"""(
                SELECT COALESCE(
                  (SELECT ($linkedAspectsClause)),
                  (SELECT jsonb_set(RecordAspects.data, ${"{\"" + propertyName + "\"}"}::text[], '[]'::jsonb))
                )
              )"""
            case PropertyWithLink(propertyName, false) =>
              // The property is an object

              val linkedAspectsClause =
                if (dereference)
                  sqls"""
                    jsonb_set(
                      RecordAspects.data,
                      ${"{\"" + propertyName + "\"}"}::text[],
                      jsonb_strip_nulls(
                        jsonb_build_object(
                          'id', Records.recordId,
                          'name', Records.name,
                          'aspects', (
                            SELECT jsonb_object_agg(aspectId, data)
                            FROM RecordAspects
                            WHERE tenantId=Records.tenantId AND recordId=Records.recordId
                          )
                        )
                      )
                    )
                """
                else
                  sqls"""data"""

              val defaultClause =
                sqls"""SELECT jsonb_set(RecordAspects.data, ${"{\"" + propertyName + "\"}"}::text[], 'null'::jsonb)"""

              val recordWhereClause = SQLSyntax.where(
                SQLSyntax.toAndConditionOpt(
                  authDecisionCondition,
                  tenantFilterCondition,
                  Some(sqls"Records.tenantId=RecordAspects.tenantId"),
                  Some(
                    sqls"Records.recordId=RecordAspects.data->>$propertyName"
                  )
                )
              )

              sqls"""(
                SELECT coalesce (
                  (
                    SELECT ($linkedAspectsClause)
                    FROM Records
                    ${recordWhereClause}
                  ),
                  (
                    ${defaultClause}
                  )
                )
              )"""
          }
          .getOrElse(sqls"data")

        sqls"""(select $selection from RecordAspects
              where (aspectId, recordid, tenantId)=($aspectId, Records.recordId, Records.tenantId)) as $aspectColumnName
          """
    }

    result
  }

  private def aspectIdsToWhereClause(
      aspectIds: Iterable[String],
      recordIdSqlRef: String = "records.recordid",
      tenantIdSqlRef: String = "records.tenantid"
  ): Option[SQLSyntax] = {
    val config = AspectQueryToSqlConfig(
      recordIdSqlRef = recordIdSqlRef,
      tenantIdSqlRef = tenantIdSqlRef
    )
    SQLSyntax.toAndConditionOpt(
      aspectIds.toSeq
        .map(
          aspectId =>
            AspectQueryExists(aspectId, path = Nil)
              .toSql(config)
        ): _*
    )
  }

}
