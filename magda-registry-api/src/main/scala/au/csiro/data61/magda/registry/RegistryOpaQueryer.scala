package au.csiro.data61.magda.registry

import akka.actor.ActorSystem
import akka.stream.Materializer
import au.csiro.data61.magda.opa.OpaQueryer
import au.csiro.data61.magda.opa.OpaTypes._
import com.typesafe.config.Config

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
    val skipOpaQuery = "auth.skipOpaQuery"
    if (config.hasPath(skipOpaQuery) && config.getBoolean(skipOpaQuery)){
      Future.successful(List(OpaQuerySkipAccessControl))
    }
    else {
      super.queryRecord(jwt, "object.registry.record.owner_orgunit." + operationType.id)
    }
  }
}
