package au.csiro.data61.magda.registry

import scala.concurrent.ExecutionContext
import scala.concurrent.Future
import scala.util.control.NonFatal

import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model._
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.model.headers
import akka.http.scaladsl.server._
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.unmarshalling.Unmarshal
import akka.stream.Materializer
import au.csiro.data61.magda.model.Auth.User
import akka.http.scaladsl.model.headers.CustomHeader
import com.typesafe.config.Config
import au.csiro.data61.magda.client.AuthApiClient
import akka.http.scaladsl.server.AuthenticationFailedRejection
import akka.http.scaladsl.model.headers.HttpChallenge
import au.csiro.data61.magda.Authentication
import akka.event.Logging
import au.csiro.data61.magda.opa.OpaQueryer
import au.csiro.data61.magda.directives.AuthDirectives
import au.csiro.data61.magda.opa.OpaTypes._

object Directives {

  def withAspectOpaQuery(
      aspectIds: Seq[String],
      operationType: AuthOperations.OperationType
  )(
      implicit config: Config,
      system: ActorSystem,
      materializer: Materializer,
      ec: ExecutionContext
  ): Directive1[Seq[OpaQueryPair]] = {
    val queryer =
      new RegistryOpaQueryer()(config, system, system.dispatcher, materializer)

    AuthDirectives.getJwt().flatMap { jwt =>
      val future = queryer.queryForAspects(jwt, aspectIds, operationType)

      onSuccess(future).flatMap { queryResults =>
        provide(queryResults)
      }
    }
  }

  def withRecordOpaQuery(
      recordId: String,
      aspectIds: Seq[String],
      operationType: AuthOperations.OperationType
  )(
      implicit config: Config,
      system: ActorSystem,
      materializer: Materializer,
      ec: ExecutionContext
  ): Directive1[Option[Seq[OpaQueryPair]]] = {
    val queryer =
      new RegistryOpaQueryer()(config, system, system.dispatcher, materializer)

    AuthDirectives.getJwt().flatMap { jwt =>
      val recordFuture = queryer.queryForRecord(jwt, operationType)
      val aspectFuture = queryer.queryForAspects(jwt, aspectIds, operationType)

      val combined = for {
        recordPermission <- recordFuture
        aspectPermissions <- aspectFuture
      } yield (recordPermission, aspectPermissions)

      onSuccess(combined).tflatMap(_ match {
        case (
            recordPermission,
            aspectOpaQueries
            ) =>
          provide(if (recordPermission) Some(aspectOpaQueries) else None)
      })
    }
  }
}
