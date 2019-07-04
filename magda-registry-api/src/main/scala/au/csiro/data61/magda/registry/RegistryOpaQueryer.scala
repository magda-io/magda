package au.csiro.data61.magda.registry

import scalikejdbc.DB
import akka.stream.Materializer
import com.typesafe.config.Config
import scala.concurrent.{ExecutionContext, Future}

import akka.actor.ActorSystem
import au.csiro.data61.magda.opa.OpaQueryer
import au.csiro.data61.magda.opa.OpaTypes._

class RegistryOpaQueryer()(
    implicit config: Config,
    system: ActorSystem,
    ec: ExecutionContext,
    materializer: Materializer
) extends OpaQueryer {

  def queryForAspects(
      jwt: Option[String],
      aspectIds: Seq[String]
  ): Future[Seq[OpaQueryPair]] = {
    this.queryForAspects(
      aspectIds,
      (policyId: String) => super.queryPolicy(jwt, policyId + ".view")
    )
  }

  def queryForAspectsAsDefaultUser(
      aspectIds: Seq[String]
  ): Future[Seq[OpaQueryPair]] = {
    this.queryForAspects(
      aspectIds,
      (policyId: String) => super.queryAsDefaultUser(policyId)
    )
  }

  private def queryForAspects(
      aspectIds: Seq[String],
      fn: String => Future[List[OpaQuery]]
  ): Future[Seq[OpaQueryPair]] = {
    val policyIds: Set[String] = DB readOnly { session =>
      DefaultRecordPersistence
        .getPolicyIds(session, aspectIds)
    }

    val futures = policyIds.toSeq.map(
      policyId =>
        fn(policyId)
          .map(queries => OpaQueryPair(policyId, queries))
    )

    Future.sequence(futures)
  }
}
