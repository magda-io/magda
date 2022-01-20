package au.csiro.data61.magda.registry

import akka.actor.TypedActor.context
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.Directive0
import au.csiro.data61.magda.client.AuthApiClient
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.model.StatusCodes.InternalServerError
import scalikejdbc.{DBSession, ReadOnlyAutoSession}
import spray.json.{JsNumber, JsObject, JsString, JsValue, JsonParser}

import scala.util.{Failure, Success, Try}
import scalikejdbc._

import scala.collection.mutable.ListBuffer
import scala.concurrent.{ExecutionContext, Future, blocking}
import au.csiro.data61.magda.directives.AuthDirectives.requirePermission
import au.csiro.data61.magda.model.Registry.Record

object Directives extends Protocols with SprayJsonSupport {

  final case class NoRecordFoundException(
      recordId: String
  ) extends Exception(s"Cannot locate record by id: ${recordId}")

  private def createRecordContextData(
      recordId: String
  )(implicit ec: ExecutionContext, session: DBSession): Future[JsObject] = {
    Future {
      blocking {
        val recordJsFields: ListBuffer[(String, JsValue)] = ListBuffer()
        sql"""SELECT * FROM records WHERE recordid=${recordId} LIMIT 1"""
          .foreach { rs =>
            recordJsFields += ("id" -> JsString(rs.string("recordId")))
            recordJsFields += ("name" -> JsString(rs.string("recordName")))
            recordJsFields += ("lastUpdate" -> JsNumber(
              rs.bigInt("lastupdate")
            ))
            recordJsFields.appendAll(
              rs.stringOpt("sourceTag").map(("sourceTag" -> JsString(_)))
            )
            recordJsFields.appendAll(
              rs.bigIntOpt("tenantId").map(("tenantId" -> JsNumber(_)))
            )
          }

        if (recordJsFields.length == 0) {
          throw NoRecordFoundException(recordId)
        }

        sql"""SELECT aspectid,data FROM recordaspects WHERE recordid=${recordId}"""
          .foreach { rs =>
            val aspectId = rs.string("aspectid")
            Try(JsonParser(rs.string("data")).asJsObject).foreach { data =>
              recordJsFields += (aspectId -> data)
            }
          }

        JsObject(recordJsFields.toMap)
      }
    }
  }

  def requireRecordPermission(
      authApiClient: AuthApiClient,
      operationUri: String,
      recordId: String,
      session: DBSession = ReadOnlyAutoSession
  ): Directive0 = (extractLog & extractExecutionContext).tflatMap {
    case (log, akkaExeCtx) =>
      implicit val blockingExeCtx =
        context.system.dispatchers.lookup("blocking-io-dispatcher")

      (withExecutionContext(blockingExeCtx) & onComplete(
        createRecordContextData(recordId)(blockingExeCtx, session)
      )).tflatMap {
        case Tuple1(Success(recordData)) =>
          requirePermission(
            authApiClient,
            operationUri,
            input = Some(JsObject("object" -> JsObject("record" -> recordData)))
          ) & withExecutionContext(akkaExeCtx) & pass // switch back to akka dispatcher
        case Tuple1(Failure(e)) =>
          log.error(
            "Failed to create record context data for auth decision. record ID: {}. Error: {}",
            recordId,
            e
          )
          complete(
            InternalServerError,
            s"An error occurred while creating record context data for auth decision."
          )
      }
  }

  def requireRecordUpdateWithNonExistCreatePermission(
      authApiClient: AuthApiClient,
      newRecord: Record,
      session: DBSession = ReadOnlyAutoSession
  ): Directive0 = (extractLog & extractExecutionContext).tflatMap { t =>
    val akkaExeCtx = t._2
    val log = t._1

    implicit val blockingExeCtx =
      context.system.dispatchers.lookup("blocking-io-dispatcher")
    onComplete(
      createRecordContextData(newRecord.id)(blockingExeCtx, session)
    ).flatMap {
      case Success(recordData) =>
        requirePermission(
          authApiClient,
          "object/record/update",
          input = Some(JsObject("object" -> JsObject("record" -> recordData)))
        ) & withExecutionContext(akkaExeCtx) & pass
      case Failure(exception: NoRecordFoundException) =>
        requirePermission(
          authApiClient,
          "object/record/create",
          input =
            Some(JsObject("object" -> JsObject("record" -> newRecord.toJson)))
        ) & withExecutionContext(akkaExeCtx) & pass
      case Failure(e: Throwable) =>
        log.error(
          "Failed to create record context data for auth decision. record ID: {}. Error: {}",
          newRecord.id,
          e
        )
        complete(
          InternalServerError,
          s"An error occurred while creating record context data for auth decision."
        )
    }
  }

//  /**
//    * Returns true if the configuration says to skip the opa query.
//    */
//  private def skipOpaQuery(implicit system: ActorSystem, config: Config) = {
//    val skip = config.hasPath("authorization.skipOpaQuery") && config
//      .getBoolean(
//        "authorization.skipOpaQuery"
//      )
//
//    if (skip) {
//      system.log.warning(
//        "WARNING: Skip OPA querying is turned on! This is fine for testing or playing around, but this should NOT BE TURNED ON FOR PRODUCTION!"
//      )
//    }
//
//    skip
//  }
//
//  /**
//    * Determines OPA policies that apply, queries OPA and parses the policies for translation to SQL or some other query language.
//    *
//    * @param operationType The operation being performed (read, edit etc)
//    * @param recordPersistence A RecordPersistence instance to look up record policies etc through
//    * @param authApiClient An auth api client to query OPA through
//    * @param recordId A record id - optional, will be used to narrow down the policies returned to only those that apply to this record.
//    * @param noPoliciesResponse What to respond with if there are no valid policies to query for
//    * @return - If no auth should be applied, None
//    *         - If auth should be applied, Some, with a List of tuples - _1 in the tuple is the id of the policy, _2 is the parsed query
//    *              that pertain to that policy. So a query can be made along the lines of
//    *              (policyId = $policy1 AND (<policy1 details)) OR (policyId = $policy2 AND (<policy2 details>))
//    */
//  def withRecordOpaQuery(
//      operationType: AuthOperations.OperationType,
//      recordPersistence: RecordPersistence,
//      authApiClient: RegistryAuthApiClient,
//      recordId: Option[String] = None,
//      noPoliciesResponse: => ToResponseMarshallable
//  )(
//      implicit config: Config,
//      system: ActorSystem,
//      materializer: Materializer,
//      ec: ExecutionContext
//  ): Directive1[Option[List[(String, List[List[OpaQuery]])]]] = {
//    if (skipOpaQuery) {
//      provide(None)
//    } else {
//      getJwt().flatMap { jwt =>
//        val recordPolicyIds = DB readOnly { implicit session =>
//          recordPersistence
//            .getPolicyIds(operationType, recordId.map(Set(_)))
//        } get
//
//        if (recordPolicyIds.isEmpty) {
//          system.log.warning(
//            s"""Could not find any policy for operation $operationType on
//            ${if (recordId.isDefined) s"record $recordId" else "records"}.
//            This will result in the record being completely inaccessible -
//            if this isn't what you want, define a default policy in config,
//            or set one for all records"""
//          )
//        }
//
//        val recordFuture =
//          authApiClient
//            .queryRecord(
//              jwt,
//              operationType,
//              recordPolicyIds.toList
//            )
//
//        onSuccess(recordFuture).flatMap { queryResults =>
//          if (queryResults.isEmpty) {
//            complete(noPoliciesResponse)
//          } else {
//            provide(Some(queryResults))
//          }
//        }
//      }
//    }
//  }
//
//  /**
//    * Determines OPA policies that apply, queries OPA and parses the policies for translation to SQL or some other query language.
//    * As opposed to withRecordOpaQuery, this also takes into account links within records.
//    *
//    * @param operationType The operation being performed (read, edit etc)
//    * @param recordPersistence A RecordPersistence instance to look up record policies etc through
//    * @param authApiClient An auth api client to query OPA through
//    * @param recordId A record id - optional, will be used to narrow down the policies returned to only those that apply to this record.
//    * @param aspectIds An optional iterable of the aspects being requested, to narrow down the total scope of potential policies to query
//    * @return A tuple with two values, both matching the following structure:
//    *         - If no auth should be applied, None
//    *         - If auth should be applied, Some, with a List of tuples - _1 in the tuple is the id of the policy, _2 is the parsed query
//    *           that pertain to that policy. So a query can be made along the lines of
//    *           (policyId = $policy1 AND (<policy1 details)) OR (policyId = $policy2 AND (<policy2 details>))
//    *
//    *           The first value in the tuple is to be applied for outer records, the second value is to be supplied for records that the
//    *           outer record links to.
//    */
//  def withRecordOpaQueryIncludingLinks(
//      operationType: AuthOperations.OperationType,
//      recordPersistence: RecordPersistence,
//      authApiClient: RegistryAuthApiClient,
//      recordId: Option[String] = None,
//      aspectIds: Iterable[String] = List(),
//      noPoliciesResponse: => ToResponseMarshallable
//  )(
//      implicit config: Config,
//      system: ActorSystem,
//      materializer: Materializer,
//      ec: ExecutionContext
//  ): Directive1[
//    (
//        Option[List[(String, List[List[OpaQuery]])]],
//        Option[List[(String, List[List[OpaQuery]])]]
//    )
//  ] = {
//    if (skipOpaQuery) {
//      provide((None, None))
//    } else {
//      getJwt().flatMap { jwt =>
//        val recordPolicyIds = DB readOnly { implicit session =>
//          recordPersistence
//            .getPolicyIds(operationType, recordId.map(Set(_)))
//        } get
//
//        val linkedRecordIds = recordId.map(
//          innerRecordId =>
//            DB readOnly { implicit session =>
//              recordPersistence.getLinkedRecordIds(
//                innerRecordId,
//                aspectIds
//              )
//            } get
//        )
//
//        val linkedRecordPolicyIds =
//          DB readOnly { implicit session =>
//            recordPersistence
//              .getPolicyIds(
//                operationType,
//                linkedRecordIds.map(_.toSet)
//              )
//          } get
//
//        val allPolicyIds = recordPolicyIds.toSet ++ linkedRecordPolicyIds
//
//        val recordFuture =
//          authApiClient
//            .queryRecord(
//              jwt,
//              operationType,
//              allPolicyIds.toList
//            )
//
//        onSuccess(recordFuture).flatMap { queryResults =>
//          if (queryResults.isEmpty) {
//            complete(noPoliciesResponse)
//          } else {
//            val queryResultLookup = queryResults.toMap
//            val fullRecordPolicyIds = recordPolicyIds
//              .map(policyId => (policyId, queryResultLookup(policyId)))
//            val fullLinkedRecordPolicyIds = linkedRecordPolicyIds
//              .map(policyId => (policyId, queryResultLookup(policyId)))
//
//            provide(
//              (Some(fullRecordPolicyIds), Some(fullLinkedRecordPolicyIds))
//            )
//          }
//        }
//      }
//    }
//  }
//
//  /**
//    * Checks whether the user making this call can access events for the provided record id.
//    *
//    * This will complete with 404 if:
//    *   - The record never existed OR
//    *   - The record existed and has been deleted, and the user is NOT an admin
//    *
//    * This will complete with 200 if:
//    *   - The record exists and the user is allowed to access it in its current form OR
//    *   - The record existed in the past and has been deleted, but the user is an admin
//    *
//    * @param recordPersistence A RecordPersistence instance to look up record policies etc through
//    * @param authApiClient An auth api client to query OPA through
//    * @param recordId The id of the record in question
//    * @param tenantId tenantId
//    * @param notFoundResponse What to respond with if there are no valid policies to query for (defaults to 404)
//    * @return If the record exists and the user is allowed to access it, will pass through, otherwise will complete with 404.
//    */
//  def checkUserCanAccessRecordEvents(
//      recordPersistence: RecordPersistence,
//      authApiClient: RegistryAuthApiClient,
//      recordId: String,
//      tenantId: au.csiro.data61.magda.model.TenantId.TenantId,
//      notFoundResponse: => ToResponseMarshallable
//  )(
//      implicit config: Config,
//      system: ActorSystem,
//      materializer: Materializer,
//      ec: ExecutionContext
//  ): Directive1[Option[List[(String, List[List[OpaQuery]])]]] = {
//    provideUser(authApiClient) flatMap {
//      // If the user is an admin, we should allow this even if they can't access the record
//      case Some(User(_, true)) => provide(None)
//      case _ =>
//        withRecordOpaQuery(
//          AuthOperations.read,
//          recordPersistence,
//          authApiClient,
//          Some(recordId),
//          notFoundResponse
//        ) flatMap { recordQueries =>
//          DB readOnly { implicit session =>
//            recordPersistence
//              .getById(tenantId, recordQueries, recordId) match {
//              case Some(record) => provide(recordQueries)
//              case None         => complete(notFoundResponse)
//            }
//          }
//        }
//    }
//  }
}
