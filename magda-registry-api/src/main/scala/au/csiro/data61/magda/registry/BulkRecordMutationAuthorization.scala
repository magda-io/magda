package au.csiro.data61.magda.registry

import au.csiro.data61.magda.ServerError
import au.csiro.data61.magda.client.AuthApiClient
import au.csiro.data61.magda.model.Auth
import au.csiro.data61.magda.model.TenantId.SpecifiedTenantId
import scalikejdbc._
import spray.json.{JsNumber, JsObject, JsString, JsValue, JsonParser}

import scala.concurrent.Await
import scala.concurrent.duration._
import scala.util.Try

/**
  * Authorization for routes that mutate a list of records in one request (e.g. bulk aspect update).
  *
  * Like the single record routes, a user must have permission to perform the operation on every record,
  * both before (current state) and after (proposed state) the mutation.
  * Every decision is a full evaluation on the complete record, made in a single batch request per state,
  * rather than a partial evaluation turned into a SQL filter:
  * - A partial evaluation can't check the proposed state.
  * - Some policies (e.g. Agent Skill identity rules) use built-in functions on record fields that can't be translated into SQL.
  */
object BulkRecordMutationAuthorization {

  val noPermissionErrorMessage =
    "You don't have permission to all records requested"

  val decisionTimeout: FiniteDuration = 60.seconds

  /**
    * Run a mutation on a list of records within the current transaction, when the user has permission to perform
    * `operationUri` on all records' current and proposed state.
    *
    * - The records and their existing aspects are locked (`SELECT ... FOR UPDATE`) until the transaction ends,
    *   so other transactions can't change, add or delete them in between. (Adding an aspect checks the
    *   `recordaspects` -> `records` foreign key, which needs a lock on the record row that conflicts with ours.)
    * - The proposed state is read back from the DB after the mutation, so it's exactly what will be committed.
    * - This method throws when the mutation fails or the user has no permission, so the transaction rolls back.
    *
    * @param authApiClient
    * @param jwt current user's session JWT
    * @param tenantId
    * @param recordIds
    * @param operationUri
    * @param mutation
    * @param session must be a transaction session (e.g. `DB localTx`)
    * @return the mutation result
    */
  def authorizeRecordsMutation[T](
      authApiClient: AuthApiClient,
      jwt: Option[String],
      tenantId: SpecifiedTenantId,
      recordIds: Seq[String],
      operationUri: String = "object/record/update"
  )(mutation: => Try[T])(implicit session: DBSession): T = {
    val ids = recordIds.filter(!_.trim.isEmpty).distinct
    if (ids.isEmpty) {
      throw ServerError(
        "there is no non-empty ids supplied via `recordIds` parameter.",
        400
      )
    }

    val currentRecords = loadRecordsContextData(tenantId, ids, true)
    if (currentRecords.size != ids.size) {
      // same as no permission, so users can't learn whether a record exists
      throw ServerError(noPermissionErrorMessage, 403)
    }
    requirePermissionForAll(
      authApiClient,
      jwt,
      operationUri,
      currentRecords.values.toSeq
    )

    val result = mutation.get

    requirePermissionForAll(
      authApiClient,
      jwt,
      operationUri,
      loadRecordsContextData(tenantId, ids, false).values.toSeq
    )
    result
  }

  private def requirePermissionForAll(
      authApiClient: AuthApiClient,
      jwt: Option[String],
      operationUri: String,
      records: Seq[JsObject]
  ): Unit = {
    val results = Await.result(
      authApiClient.getAuthDecisions(
        jwt,
        operationUri,
        records.map(
          record => JsObject("object" -> JsObject("record" -> record))
        )
      ),
      decisionTimeout
    )
    if (results.exists(result => !Auth.isTrueEquivalent(result))) {
      throw ServerError(noPermissionErrorMessage, 403)
    }
  }

  /**
    * Load records (with all their aspects) as policy engine context data.
    * The context data format is the same as the single record routes' (see `Directives.createRecordContextData`).
    *
    * @param tenantId
    * @param recordIds
    * @param lockRecords whether to lock the record rows and their aspect rows (`FOR UPDATE`) until the current transaction ends.
    *                    Rows are locked in a deterministic order (by record ID, then aspect ID), so that concurrent bulk
    *                    mutations on overlapping records wait for each other rather than deadlock.
    * @param session
    * @return a map from record ID to its context data. Records that don't exist are not included.
    */
  def loadRecordsContextData(
      tenantId: SpecifiedTenantId,
      recordIds: Seq[String],
      lockRecords: Boolean
  )(implicit session: DBSession): Map[String, JsObject] = {
    if (recordIds.isEmpty) {
      return Map()
    }

    var records: Map[String, Map[String, JsValue]] = Map()

    sql"""SELECT recordid, name, lastupdate, sourcetag, tenantid FROM records
          WHERE tenantid=${tenantId.tenantId} AND recordid IN (${recordIds})
          ORDER BY recordid
          ${if (lockRecords) sqls"FOR UPDATE" else SQLSyntax.empty}"""
      .foreach { rs =>
        val recordId = rs.string("recordid")
        var fields: Map[String, JsValue] = Map(
          "id" -> JsString(recordId),
          "name" -> JsString(rs.string("name")),
          "lastUpdate" -> JsNumber(rs.bigInt("lastupdate"))
        )
        rs.stringOpt("sourcetag")
          .foreach(item => fields += ("sourceTag" -> JsString(item)))
        rs.stringOpt("tenantid")
          .foreach(item => fields += ("tenantId" -> JsNumber(item)))
        records += (recordId -> fields)
      }

    // only aspects of the selected records in the current tenant
    sql"""SELECT recordid, aspectid, data FROM recordaspects
          WHERE tenantid=${tenantId.tenantId} AND recordid IN (${recordIds})
          ORDER BY recordid, aspectid
          ${if (lockRecords) sqls"FOR UPDATE" else SQLSyntax.empty}"""
      .foreach { rs =>
        val recordId = rs.string("recordid")
        records.get(recordId).foreach { fields =>
          records += (recordId -> (fields + (rs
            .string("aspectid") -> JsonParser(
            rs.string("data")
          ).asJsObject)))
        }
      }

    records.map {
      case (recordId, fields) => recordId -> JsObject(fields)
    }
  }
}
