package au.csiro.data61.magda.registry

import akka.actor.ActorSystem
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server._
import akka.stream.Materializer
import au.csiro.data61.magda.directives.AuthDirectives
import au.csiro.data61.magda.opa.OpaTypes._
import com.typesafe.config.Config

import scala.concurrent.{ExecutionContext, Future}

object Directives {

  def withRecordOpaQuery(
      operationType: AuthOperations.OperationType
  )(
      implicit config: Config,
      system: ActorSystem,
      materializer: Materializer,
      ec: ExecutionContext
  ): Directive1[List[OpaQuery]] = {
    val queryer = new RegistryOpaQueryer()(config, system, system.dispatcher, materializer)

    AuthDirectives.getJwt().flatMap { jwt =>
      val recordFuture: Future[List[OpaQuery]] = queryer.queryForRecord(jwt, operationType)

      val recordPermissionsF: Future[List[OpaQuery]] = for {
        recordPermission <- recordFuture
      } yield recordPermission

      onSuccess(recordPermissionsF).flatMap { queryResults =>
        provide(queryResults)
      }
    }
  }
}
