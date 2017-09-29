

package au.csiro.data61.magda.directives

import scala.collection.immutable.Seq
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

object AuthDirectives {

  val requireUserId: Directive1[String] = {
    extractRequest flatMap { request =>
      val sessionToken = request.headers.find {
        case headers.RawHeader(Authentication.headerName, value) => true
        case _ => false
      }
      
      println(sessionToken)

      sessionToken match {
        case Some(header) =>
          try {
            provide(Authentication.jwt.verify(header.value()).getClaim("userId").asString())
          } catch {
            case NonFatal(_) => reject(AuthenticationFailedRejection(AuthenticationFailedRejection.CredentialsRejected, HttpChallenge("magda", None)))
          }
        case None => reject(AuthenticationFailedRejection(AuthenticationFailedRejection.CredentialsMissing, HttpChallenge("magda", None)))
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