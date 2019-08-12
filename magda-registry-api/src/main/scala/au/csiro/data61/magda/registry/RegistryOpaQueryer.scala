package au.csiro.data61.magda.registry

import akka.actor.ActorSystem
import akka.stream.Materializer
import au.csiro.data61.magda.opa.OpaQueryer
import au.csiro.data61.magda.opa.OpaTypes._
import com.typesafe.config.Config
import scalikejdbc.DB

import scala.concurrent.{ExecutionContext, Future}

class RegistryOpaQueryer()(
    implicit config: Config,
    system: ActorSystem,
    ec: ExecutionContext,
    materializer: Materializer
) extends OpaQueryer {

  def queryForAspects(
      jwt: Option[String],
      aspectIds: Seq[String],
      operationType: AuthOperations.OperationType
  ): Future[Seq[OpaQueryPair]] = {
    this.queryForAspects(
      aspectIds,
      operationType,
      (policyId: String) =>
        super.queryPolicy(jwt, policyId)
    )
  }

  def queryForAspectsAsDefaultUser(
      aspectIds: Seq[String],
      operationType: AuthOperations.OperationType
  ): Future[Seq[OpaQueryPair]] = {
    this.queryForAspects(
      aspectIds,
      operationType,
      (policyId: String) => super.queryAsDefaultUser(policyId)
    )
  }

  private def queryForAspects(
      aspectIds: Seq[String],
      operationType: AuthOperations.OperationType,
      fn: String => Future[List[OpaQuery]]
  ): Future[Seq[OpaQueryPair]] = {
    val policyIds: Set[String] = DB readOnly { session =>
      DefaultRecordPersistence
        .getPolicyIds(session, aspectIds, operationType)
    }

    val futures = policyIds.toSeq.map(
      policyId =>
        fn(policyId)
          .map(queries => OpaQueryPair(policyId, queries))
    )

    Future.sequence(futures)
  }

  def queryForRecord(
    jwt: Option[String],
    operationType: AuthOperations.OperationType
  ): Future[List[OpaQuery]] = {
    val skipOpaQuery = "auth.skipOpaQuery"
    if (config.hasPath(skipOpaQuery) && config.getBoolean(skipOpaQuery)){
      Future.successful(List(OpaQuerySkipAccessControl))
    }
    else {
      super.queryRecord(jwt, "object.registry.record.owner_orgunit." + operationType.id)
    }
  }
}
