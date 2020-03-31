package au.csiro.data61.magda.registry

import akka.actor.ActorSystem
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server._
import akka.stream.Materializer
import au.csiro.data61.magda.directives.AuthDirectives
import au.csiro.data61.magda.opa.OpaTypes._
import com.typesafe.config.Config
import scalikejdbc.DB
import au.csiro.data61.magda.client.AuthOperations

import scala.concurrent.{ExecutionContext, Future}
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.marshalling.ToResponseMarshallable

object Directives {
  private def skipOpaQuery(implicit config: Config) =
    config.hasPath("authorization.skipOpaQuery") && config.getBoolean(
      "authorization.skipOpaQuery"
    )

  /**
    * Determines OPA policies that apply, queries OPA and parses the policies for translation to SQL or some other query language.
    *
    * @param operationType The operation being performed (read, edit etc)
    * @param recordPersistence A RecordPersistence instance to look up record policies etc through
    * @param authApiClient An auth api client to query OPA through
    * @param recordId A record id - optional, will be used to narrow down the policies returned to only those that apply to this record.
    * @param noPoliciesResponse What to respond with if there are no valid policies to query for
    * @return - If no auth should be applied, None
    *         - If auth should be applied, Some, with a List of tuples - _1 in the tuple is the id of the policy, _2 is the parsed query
    *              that pertain to that policy. So a query can be made along the lines of
    *              (policyId = $policy1 AND (<policy1 details)) OR (policyId = $policy2 AND (<policy2 details>))
    */
  def withRecordOpaQuery(
      operationType: AuthOperations.OperationType,
      recordPersistence: RecordPersistence,
      authApiClient: RegistryAuthApiClient,
      recordId: Option[String] = None,
      noPoliciesResponse: => ToResponseMarshallable
  )(
      implicit config: Config,
      system: ActorSystem,
      materializer: Materializer,
      ec: ExecutionContext
  ): Directive1[Option[List[(String, List[List[OpaQuery]])]]] = {
    AuthDirectives.getJwt().flatMap { jwt =>
      if (skipOpaQuery) {
        provide(None)
      } else {
        val recordPolicyIds = DB readOnly { session =>
          recordPersistence
            .getPolicyIds(session, operationType, recordId.map(Set(_)))
        } get

        if (recordPolicyIds.isEmpty) {
          system.log.warning(
            s"""Could not find any policy for operation $operationType on 
            ${if (recordId.isDefined) s"record $recordId" else "records"}.
            This will result in the record being completely inaccessible - 
            if this isn't what you want, define a default policy in config,
            or set one for all records"""
          )
        }

        val recordFuture =
          authApiClient
            .queryRecord(
              jwt,
              operationType,
              recordPolicyIds.toList
            )

        onSuccess(recordFuture).flatMap { queryResults =>
          if (queryResults.isEmpty) {
            complete(noPoliciesResponse)
          } else {
            provide(Some(queryResults))
          }
        }
      }
    }
  }

  /**
    * Determines OPA policies that apply, queries OPA and parses the policies for translation to SQL or some other query language.
    * As opposed to withRecordOpaQuery, this also takes into account links within records.
    *
    * @param operationType The operation being performed (read, edit etc)
    * @param recordPersistence A RecordPersistence instance to look up record policies etc through
    * @param authApiClient An auth api client to query OPA through
    * @param recordId A record id - optional, will be used to narrow down the policies returned to only those that apply to this record.
    * @param aspectIds An optional iterable of the aspects being requested, to narrow down the total scope of potential policies to query
    * @return A tuple with two values, both matching the following structure:
    *         - If no auth should be applied, None
    *         - If auth should be applied, Some, with a List of tuples - _1 in the tuple is the id of the policy, _2 is the parsed query
    *           that pertain to that policy. So a query can be made along the lines of
    *           (policyId = $policy1 AND (<policy1 details)) OR (policyId = $policy2 AND (<policy2 details>))
    *
    *           The first value in the tuple is to be applied for outer records, the second value is to be supplied for records that the
    *           outer record links to.
    */
  def withRecordOpaQueryIncludingLinks(
      operationType: AuthOperations.OperationType,
      recordPersistence: RecordPersistence,
      authApiClient: RegistryAuthApiClient,
      recordId: Option[String] = None,
      aspectIds: Iterable[String] = List(),
      noPoliciesResponse: => ToResponseMarshallable
  )(
      implicit config: Config,
      system: ActorSystem,
      materializer: Materializer,
      ec: ExecutionContext
  ): Directive1[
    (
        Option[List[(String, List[List[OpaQuery]])]],
        Option[List[(String, List[List[OpaQuery]])]]
    )
  ] = {
    AuthDirectives.getJwt().flatMap { jwt =>
      if (skipOpaQuery) {
        provide((None, None))
      } else {
        val recordPolicyIds = DB readOnly { session =>
          recordPersistence
            .getPolicyIds(session, operationType, recordId.map(Set(_)))
        } get

        val linkedRecordIds = DB readOnly { session =>
          recordPersistence.getLinkedRecordIds(
            session,
            operationType,
            recordId,
            aspectIds
          )
        } get

        val linkedRecordPolicyIds =
          if (linkedRecordIds.isEmpty) List()
          else
            DB readOnly { session =>
              recordPersistence
                .getPolicyIds(
                  session,
                  operationType,
                  Some(linkedRecordIds.toSet)
                )
            } get

        val allPolicyIds = recordPolicyIds.toSet ++ linkedRecordPolicyIds

        val recordFuture =
          authApiClient
            .queryRecord(
              jwt,
              operationType,
              allPolicyIds.toList
            )

        onSuccess(recordFuture).flatMap { queryResults =>
          if (queryResults.isEmpty) {
            complete(noPoliciesResponse)
          } else {
            val queryResultLookup = queryResults.toMap
            val fullRecordPolicyIds = recordPolicyIds
              .map(policyId => (policyId, queryResultLookup(policyId)))
            val fullLinkedRecordPolicyIds = linkedRecordPolicyIds
              .map(policyId => (policyId, queryResultLookup(policyId)))

            provide(
              (Some(fullRecordPolicyIds), Some(fullLinkedRecordPolicyIds))
            )
          }
        }
      }
    }
  }
}
