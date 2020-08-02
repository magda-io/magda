package au.csiro.data61.magda.directives

import akka.actor.ActorSystem
import akka.event.Logging
import akka.http.scaladsl.model.headers
import akka.http.scaladsl.model.headers.HttpChallenge
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.{AuthenticationFailedRejection, _}
import au.csiro.data61.magda.Authentication
import au.csiro.data61.magda.client.AuthApiClient
import com.typesafe.config.Config
import io.jsonwebtoken.{Jws, Claims}

import scala.util.control.NonFatal
import au.csiro.data61.magda.model.Auth.User

object AuthDirectives {

  /**
    * Returns true if config says to skip all authorization.
    */
  def skipAuthorization(implicit system: ActorSystem, config: Config) = {
    val skip = config.hasPath("authorization.skip") && config.getBoolean(
      "authorization.skip"
    )

    if (skip) {
      system.log.warning(
        "WARNING: Skip authorization is turned on! This is fine for testing or playing around, but this should NOT BE TURNED ON FOR PRODUCTION!"
      )
    }

    skip
  }

  /** Gets the X-Magda-Session header out of the request, providing it as a string without doing any verification */
  def getJwt(): Directive1[Option[String]] = {
    extractRequest flatMap { request =>
      val sessionToken =
        request.headers.find(_.is(Authentication.headerName.toLowerCase))

      provide(sessionToken.map(_.value()))
    }
  }

  /**
    * If the X-Magda-Session header is present, tries to get a user id out of it.
    *
    * @return If:
    *   - The X-Magda-Session header is present and valid, provides the user id  from it
    *   - The X-Magda-Session header is present and NOT valid, returns 400
    *   - The X-Magda-Session header is not present at all, provides None
    */
  def provideUserId(
      implicit system: ActorSystem,
      config: Config
  ): Directive1[Option[String]] = {
    if (skipAuthorization) {
      provide(Some("authorization-skipped"))
    } else {
      val log = Logging(system, getClass)
      extractRequest flatMap { request =>
        val sessionToken =
          request.headers.find(_.is(Authentication.headerName.toLowerCase))

        sessionToken match {
          case None => provide(None)
          case Some(header) if header.value().isEmpty() =>
            log.info("X-Magda-Session header was blank")
            reject(
              AuthenticationFailedRejection(
                AuthenticationFailedRejection.CredentialsMissing,
                HttpChallenge("magda", None)
              )
            )
          case Some(header) =>
            try {
              val claims: Jws[Claims] =
                Authentication.parser(system.log).parseClaimsJws(header.value())
              val userId = claims.getBody().get("userId", classOf[String])

              provide(
                Some(userId)
              )
            } catch {
              case NonFatal(e) =>
                log.error(
                  e,
                  "Could not verify X-Magda-Session header in request"
                )
                reject(
                  AuthenticationFailedRejection(
                    AuthenticationFailedRejection.CredentialsRejected,
                    HttpChallenge("magda", None)
                  )
                )
            }
        }
      }
    }

  }

  /**
    * Gets a user ID off the incoming X-Magda-Session JWT. Will return 403 if it can't find one.
    */
  def requireUserId(
      implicit system: ActorSystem,
      config: Config
  ): Directive1[String] = {
    provideUserId(system, config) flatMap {
      case Some(userId) =>
        provide(
          userId
        )
      case None =>
        val log = Logging(system, getClass)
        log.info("Could not find X-Magda-Session header in request")
        reject(
          AuthenticationFailedRejection(
            AuthenticationFailedRejection.CredentialsMissing,
            HttpChallenge("magda", None)
          )
        )

    }
  }

  /**
    * Gets user making the request from the Auth API. Provides None if it can't find the user id.
    */
  def provideUser(
      authApiClient: AuthApiClient
  )(implicit system: ActorSystem, config: Config): Directive1[Option[User]] = {
    implicit val ec = authApiClient.executor
    val log = Logging(system, getClass)

    if (skipAuthorization) {
      provide(Some(User("authorization-skipped", true)))
    } else {
      provideUserId(system, config) flatMap {
        case Some(userId) =>
          log.debug("Authenticated as user with id {}", userId)
          extractActorSystem flatMap { actorSystem =>
            extractMaterializer flatMap { materializer =>
              extractExecutionContext flatMap { executionContext =>
                onSuccess(authApiClient.getUserPublic(userId)) flatMap { user =>
                  provide(Some(user))
                }
              }
            }
          }
        case None => provide(None)
      }
    }
  }

  /**
    * Looks up the user to make sure that the user is an admin. Responds with 403 if the user is
    * not an admin, passes through the user object if the user is an admin.
    */
  def requireIsAdmin(
      authApiClient: AuthApiClient
  )(implicit system: ActorSystem, config: Config): Directive1[User] = {
    provideUser(authApiClient).flatMap {
      case Some(user) =>
        authorize(user.isAdmin) tflatMap { _ =>
          provide(user)
        }
      case None =>
        reject(
          AuthenticationFailedRejection(
            AuthenticationFailedRejection.CredentialsMissing,
            HttpChallenge("magda", None)
          )
        )
    }
  }
}
