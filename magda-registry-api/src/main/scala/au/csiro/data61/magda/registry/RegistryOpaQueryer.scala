package au.csiro.data61.magda.registry

import akka.actor.ActorSystem
import akka.stream.Materializer
import au.csiro.data61.magda.opa.OpaQueryer
import au.csiro.data61.magda.opa.OpaTypes._
import com.typesafe.config.Config

import au.csiro.data61.magda.directives.AuthDirectives.skipOpaQuery
import scala.concurrent.{ExecutionContext, Future}

class RegistryOpaQueryer()(
    implicit config: Config,
    system: ActorSystem,
    ec: ExecutionContext,
    materializer: Materializer
) extends OpaQueryer {

  def queryForRecord(
      jwt: Option[String],
      operationType: AuthOperations.OperationType
  ): Future[List[OpaQuery]] = {

    if (skipOpaQuery)
      Future.successful(List(OpaQuerySkipAccessControl))
    else
      super.queryRecord(
        jwt,
        policyId = "object.registry.record.owner_orgunit." + operationType.id
      )
  }
}
