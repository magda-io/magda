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

object Directives {
  private def skipOpaQuery(implicit config: Config) =
    config.hasPath("authorization.skipOpaQuery") && config.getBoolean(
      "authorization.skipOpaQuery"
    )

  def withRecordOpaQuery(
      operationType: AuthOperations.OperationType,
      recordPersistence: RecordPersistence,
      authApiClient: RegistryAuthApiClient,
      recordId: Option[String] = None
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

        val recordFuture =
          authApiClient
            .queryForRecords(
              jwt,
              operationType,
              recordPolicyIds.toList,
              recordId
            )

        onSuccess(recordFuture).flatMap { queryResults =>
          if (queryResults.isEmpty) {
            complete(StatusCodes.NotFound)
          } else {
            provide(Some(queryResults))
          }
        }
      }
    }
  }

  def withRecordOpaQueryIncludingLinks(
      operationType: AuthOperations.OperationType,
      recordPersistence: RecordPersistence,
      authApiClient: RegistryAuthApiClient,
      recordId: Option[String] = None,
      aspectIds: Iterable[String] = List()
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

        println(recordPolicyIds)

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

        // println(linkedRecordPolicyIds)

        val allPolicyIds = recordPolicyIds.toSet ++ linkedRecordPolicyIds
        println(allPolicyIds)

        val recordFuture =
          authApiClient
            .queryForRecords(
              jwt,
              operationType,
              allPolicyIds.toList,
              recordId
            )

        onSuccess(recordFuture).flatMap { queryResults =>
          if (queryResults.isEmpty) {
            complete(StatusCodes.NotFound)
          } else {
            val queryResultLookup = queryResults.toMap
            val fullRecordPolicyIds = recordPolicyIds
              .map(policyId => (policyId, queryResultLookup(policyId)))
            val fullLinkedRecordPolicyIds = linkedRecordPolicyIds
              .map(policyId => (policyId, queryResultLookup(policyId)))

            println(fullLinkedRecordPolicyIds)

            provide(
              (Some(fullRecordPolicyIds), Some(fullLinkedRecordPolicyIds))
            )
          }
        }
      }
    }
  }
}
