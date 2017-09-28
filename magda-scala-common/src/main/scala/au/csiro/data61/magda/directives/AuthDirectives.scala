

package au.csiro.data61.magda.directives

import scala.collection.immutable.Seq
import scala.concurrent.ExecutionContext
import scala.concurrent.Future
import scala.util.control.NonFatal

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm

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

object AuthDirectives {
  val algorithm = Algorithm.HMAC256(Option(System.getenv("JWT_SECRET")).orElse(Option(System.getenv("npm_package_config_jwtSecret"))).getOrElse("squirrel"))
  val jwt = JWT.require(algorithm).build

  val requireUserId: Directive1[String] = {
    extractRequest flatMap { request =>
      val sessionToken = request.headers.find {
        case headers.RawHeader("X-Magda-Session", value) => true
        case _ => false
      }

      sessionToken match {
        case Some(header) =>
          try {
            provide(jwt.verify(header.value()).getClaim("userId").asString())
          } catch {
            case NonFatal(_) => complete(StatusCodes.Unauthorized)
          }
        case None => complete(StatusCodes.Unauthorized)
      }
    }
  }

  def requireIsAdmin(authApiClient: AuthApiClient): Directive1[String] = {
    implicit val ec = authApiClient.executor
    
    requireUserId flatMap { userId =>
      extractActorSystem flatMap { actorSystem =>
        extractMaterializer flatMap { materializer =>
          extractExecutionContext flatMap { executionContext =>
            authorizeAsync(_ => authApiClient.getUserPublic(userId).map(_.isAdmin)) tflatMap { _ =>
              provide(userId)
            }
          }
        }
      }
    }
  }
}