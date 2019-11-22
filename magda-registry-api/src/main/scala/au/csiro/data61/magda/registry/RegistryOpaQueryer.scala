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

  private def skipOpaQuery(implicit config: Config) =
    config.hasPath("authorization.skipOpaQuery") && config.getBoolean(
      "authorization.skipOpaQuery"
    )

  def queryForRecord(
      jwt: Option[String],
      operationType: AuthOperations.OperationType
  ): Future[List[List[OpaQuery]]] = {

    if (skipOpaQuery) {
      Future.successful(List(List(OpaQuerySkipAccessControl)))
    } else {
      val theRecordPolicyId =
        if (config.hasPath("opa.recordPolicyId")) {
          config.getString("opa.recordPolicyId")
        } else {
          throw new Exception("Error: Missing opa.recordPolicyId in the config.")
        }

      super.queryRecord(
        jwt,
        policyId = theRecordPolicyId + "." + operationType.id
      )
    }
  }
}
