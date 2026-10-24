package au.csiro.data61.magda.registry

import au.csiro.data61.magda.ServerError
import au.csiro.data61.magda.client.{AuthApiClient, AuthDecisionReqConfig}
import au.csiro.data61.magda.model.Auth
import au.csiro.data61.magda.model.Auth.AuthDecision
import au.csiro.data61.magda.model.TenantId.SpecifiedTenantId
import org.slf4j.LoggerFactory
import scalikejdbc._
import spray.json.{JsNumber, JsObject, JsString, JsValue, JsonParser}

import scala.concurrent.{Await, Future}
import scala.concurrent.duration._
import scala.util.{Failure, Success, Try}

/**
  * Authorization for routes that mutate records: a single record (e.g. update a record's aspect)
  * or a list of records in one request (e.g. bulk aspect update).
  *
  * A user must have permission to perform the operation on every record, both before (current state) and after
  * (proposed state) the mutation. Both states are checked within the mutation transaction:
  * 1. load and lock the records and their aspects;
  * 2. check the current state;
  * 3. run the mutation;
  * 4. read the records back and check the proposed state, i.e. exactly what will be committed;
  * 5. throw on any denial or failure, so the transaction rolls back.
  * So the records can't be changed by others between the checks and the mutation, and the proposed state checked
  * doesn't need to be reconstructed from the request.
  *
  * Every decision is a full evaluation on the complete record, rather than a partial evaluation turned into a SQL filter:
  * - A partial evaluation can't check the proposed state.
  * - Some policies (e.g. Agent Skill identity rules) use built-in functions on record fields that can't be translated into SQL.
  */
object RecordMutationAuthorization {

  private val logger = LoggerFactory.getLogger(getClass)

  val noPermissionErrorMessage =
    "You don't have permission to all records requested"

  val decisionTimeout: FiniteDuration = 60.seconds

  /**
    * Thrown when a record that didn't exist when the mutation started has been created by another transaction since.
    * The mutation can be retried, as an update of the record (see `runInMutationTransaction`).
    */
  final case class RecordCreatedConcurrentlyException(recordId: String)
      extends Exception(
        s"Record ${recordId} has been created by another request in the meantime."
      )

  /**
    * The mutation itself failed (e.g. invalid data, or a JSON patch that can't be applied), as opposed to other failures
    * within the mutation transaction (e.g. failing to load the record for the auth decision).
    * Routes respond with the mutation's error, and treat any other failure as an internal error.
    */
  final case class MutationFailure(cause: Throwable)
      extends Exception(cause.getMessage, cause)

  /**
    * Get the mutation result, or throw its failure as a `MutationFailure`.
    */
  def mutationResult[T](mutation: Try[T]): T = mutation match {
    case Success(result) => result
    case Failure(e)      => throw MutationFailure(e)
  }

  /**
    * Run a mutation on a list of records within the current transaction, when the user has permission to perform
    * `operationUri` on all records' current and proposed state.
    *
    * - The records and their existing aspects are locked (`SELECT ... FOR UPDATE`) until the transaction ends,
    *   so other transactions can't change, add or delete them in between. (Adding an aspect checks the
    *   `recordaspects` -> `records` foreign key, which needs a lock on the record row that conflicts with ours.)
    * - The proposed state is read back from the DB after the mutation, so it's exactly what will be committed.
    * - This method throws when the mutation fails or the user has no permission, so the transaction rolls back.
    * - The decisions for all records' states are made in a single batch decision request per state.
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

  /**
    * Run a mutation on a single record within the current transaction, when the user has permission to perform
    * `operationUri` on the record's current and proposed state.
    * It works the same way as `authorizeRecordsMutation` (lock, check the current state, mutate, read back and check
    * the proposed state, throw on denial or failure), except:
    * - Each decision is a single full evaluation request (no `unknowns`), the same as the `requirePermission` directive's.
    * - When the record doesn't exist (in the tenant), `onRecordNotFound` runs instead, within the same transaction.
    *   e.g. to check a permission that doesn't depend on the record, or to create the record (see `authorizeRecordCreation`).
    * - A failure of the mutation is thrown as a `MutationFailure`.
    *
    * @param authApiClient
    * @param jwt current user's session JWT
    * @param tenantId
    * @param recordId
    * @param operationUri
    * @param checkProposedState false for mutations that leave no proposed state to check (i.e. deleting the record)
    * @param onRecordNotFound runs when the record doesn't exist. It should throw (e.g. a `ServerError`) to deny the request,
    *                         and use `mutationResult` to get the result of any mutation it runs.
    * @param mutation
    * @param session must be a transaction session (e.g. `DB localTx`)
    * @return the mutation (or `onRecordNotFound`) result
    */
  def authorizeRecordMutation[T](
      authApiClient: AuthApiClient,
      jwt: Option[String],
      tenantId: SpecifiedTenantId,
      recordId: String,
      operationUri: String = "object/record/update",
      checkProposedState: Boolean = true,
      onRecordNotFound: () => T
  )(mutation: => Try[T])(implicit session: DBSession): T =
    loadRecordContextData(tenantId, recordId, true) match {
      case None => onRecordNotFound()
      case Some(currentRecord) =>
        requirePermission(authApiClient, jwt, operationUri, currentRecord)
        val result = mutationResult(mutation)
        if (checkProposedState) {
          requirePermission(
            authApiClient,
            jwt,
            operationUri,
            loadRecordContextData(tenantId, recordId, false).getOrElse(
              throw new Exception(
                s"Record ${recordId} doesn't exist after the mutation."
              )
            )
          )
        }
        result
    }

  /**
    * Create a record within the current transaction, when the user has `object/record/create` permission on the
    * record as written to the DB. The created record is locked until the transaction ends.
    *
    * It's for creating a record that doesn't exist yet, e.g. as `onRecordNotFound` of `authorizeRecordMutation`.
    * As there is no record row to lock, another transaction may create the same record in the meantime.
    * When so (i.e. the creation fails and the record exists), it throws `RecordCreatedConcurrentlyException`
    * rather than changing the other transaction's record, so the request can be retried as an update of that record,
    * which requires `object/record/update` permission on the record. Any other failure of the creation is thrown as a
    * `MutationFailure`.
    *
    * @param authApiClient
    * @param jwt current user's session JWT
    * @param tenantId
    * @param recordId
    * @param recordPersistence
    * @param creation creates the record. It runs within a savepoint, so the transaction can continue when it fails.
    * @param session must be a transaction session (e.g. `DB localTx`)
    * @return the creation result
    */
  def authorizeRecordCreation[T](
      authApiClient: AuthApiClient,
      jwt: Option[String],
      tenantId: SpecifiedTenantId,
      recordId: String,
      recordPersistence: RecordPersistence
  )(creation: DBSession => Try[T])(implicit session: DBSession): T = {
    val result = recordPersistence.withinSavepoint(creation) match {
      case Success(result) => result
      case Failure(e) =>
        if (loadRecordContextData(tenantId, recordId, false).isDefined) {
          throw RecordCreatedConcurrentlyException(recordId)
        }
        throw MutationFailure(e)
    }
    requirePermission(
      authApiClient,
      jwt,
      "object/record/create",
      loadRecordContextData(tenantId, recordId, true).getOrElse(
        throw new Exception(
          s"Record ${recordId} doesn't exist after the creation."
        )
      )
    )
    result
  }

  /**
    * Run a single record mutation (see `authorizeRecordMutation`) in a new transaction.
    * The transaction is rolled back when `f` throws.
    * When the record has been created by another transaction in the meantime (`RecordCreatedConcurrentlyException`),
    * `f` is retried once in a new transaction, where the record exists.
    *
    * @param queryTimeout query timeout in seconds
    * @param f
    * @return
    */
  def runInMutationTransaction[T](queryTimeout: Int)(
      f: DBSession => T
  ): Try[T] = {
    def run() = Try {
      DB localTx { session =>
        session.queryTimeout(queryTimeout)
        f(session)
      }
    }
    run() match {
      case Failure(_: RecordCreatedConcurrentlyException) => run()
      case result                                         => result
    }
  }

  /**
    * Require the user to have unconditional permission to perform `operationUri`, regardless of any object's attributes.
    * Same as the `requireUnconditionalAuthDecision` directive, for use within a mutation transaction.
    * e.g. when the record to delete doesn't exist, only users with unconditional permission get a result, so other users
    * can't learn whether the record exists.
    * Throws a `ServerError` when not permitted.
    */
  def requireUnconditionalPermission(
      authApiClient: AuthApiClient,
      jwt: Option[String],
      operationUri: String
  ): Unit = {
    val authDecision = awaitDecision(
      authApiClient.getAuthDecision(jwt, AuthDecisionReqConfig(operationUri))
    )
    if (authDecision.hasResidualRules || !authDecision.result.exists(
          Auth.isTrueEquivalent
        )) {
      throw ServerError(
        s"you are not permitted to perform `${operationUri}` on required resources.",
        403
      )
    }
  }

  /**
    * Require the user to have permission to perform `operationUri` on the record (a full evaluation).
    * Same as the `requirePermission` directive, for use within a mutation transaction.
    * Throws a `ServerError` when not permitted.
    */
  private def requirePermission(
      authApiClient: AuthApiClient,
      jwt: Option[String],
      operationUri: String,
      record: JsObject
  ): Unit = {
    val authDecision = awaitDecision(
      authApiClient.getAuthDecision(
        jwt,
        AuthDecisionReqConfig(
          operationUri,
          unknowns = Some(Nil),
          input = Some(JsObject("object" -> JsObject("record" -> record)))
        )
      )
    )
    if (authDecision.hasResidualRules) {
      throw ServerError(
        s"you are not permitted to perform `${operationUri}`: no unconditional decision can be made.",
        403
      )
    }
    if (!authDecision.result.exists(Auth.isTrueEquivalent)) {
      throw ServerError(
        s"you are not permitted to perform `${operationUri}`.",
        403
      )
    }
  }

  private def awaitDecision(decision: => Future[AuthDecision]): AuthDecision =
    Try(Await.result(decision, decisionTimeout)) match {
      case Success(authDecision) => authDecision
      case Failure(e) =>
        logger.error("Failed to get auth decision", e)
        throw ServerError(
          "An error occurred while retrieving auth decision for the request.",
          500
        )
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

  private def loadRecordContextData(
      tenantId: SpecifiedTenantId,
      recordId: String,
      lockRecord: Boolean
  )(implicit session: DBSession): Option[JsObject] =
    loadRecordsContextData(tenantId, List(recordId), lockRecord).get(recordId)

  /**
    * Load records (with all their aspects) as policy engine context data.
    * The context data format is the same as the read routes' (see `Directives.createRecordContextData`).
    *
    * @param tenantId
    * @param recordIds
    * @param lockRecords whether to lock the record rows and their aspect rows (`FOR UPDATE`) until the current transaction ends.
    *                    Rows are locked in a deterministic order (by record ID, then aspect ID), so that concurrent
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
