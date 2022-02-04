package au.csiro.data61.magda.registry

import akka.actor.ActorSystem
import akka.stream.Materializer
import au.csiro.data61.magda.opa.OpaTypes._
import com.typesafe.config.Config
import scalikejdbc.DB
import scala.util.{Failure, Success, Try}

import scala.concurrent.{ExecutionContext, Future}
import au.csiro.data61.magda.client.AuthApiClient
import au.csiro.data61.magda.client.HttpFetcher
import java.net.URL
import au.csiro.data61.magda.client.AuthOperations

class RegistryAuthApiClient(
    authHttpFetcher: HttpFetcher
)(
    implicit config: Config,
    system: ActorSystem,
    ec: ExecutionContext,
    materializer: Materializer
) extends AuthApiClient(authHttpFetcher) {
  def this()(
      implicit config: Config,
      system: ActorSystem,
      executor: ExecutionContext,
      materializer: Materializer
  ) = {
    this(
      HttpFetcher(
        new URL(config.getString("authApi.baseUrl"))
      )(system, materializer, executor)
    )(
      config,
      system,
      executor,
      materializer
    )
  }
}
