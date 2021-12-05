package au.csiro.data61.magda.directives

import akka.actor.ActorSystem
import akka.event.Logging
import akka.http.scaladsl.model.StatusCodes.{Forbidden, InternalServerError}
import akka.http.scaladsl.model.headers.HttpChallenge
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.{AuthenticationFailedRejection, Directive0, _}
import au.csiro.data61.magda.Authentication
import au.csiro.data61.magda.client.{AuthApiClient, AuthDecisionReqConfig}
import com.typesafe.config.Config
import io.jsonwebtoken.{Claims, Jws}
import au.csiro.data61.magda.model.Auth

import scala.util.control.NonFatal
import au.csiro.data61.magda.model.Auth.{AuthDecision, User}
import spray.json.{JsObject}
import scala.util.{Failure, Success}

object AuthDirectives {

  def withAuthDecision(
      authApiClient: AuthApiClient,
      config: AuthDecisionReqConfig
  ): Directive1[AuthDecision] = (extractLog & getJwt).tflatMap {
    case (log, jwt) =>
      onComplete(authApiClient.getAuthDecision(jwt, config)).flatMap {
        case Success(authDecision: AuthDecision) => provide(authDecision)
        case Failure(e) =>
          log.error("Failed to get auth decision: {}", e)
          complete(
            InternalServerError,
            s"An error occurred while retrieving auth decision for the request."
          )
      }
  }

  def requirePermission(
      authApiClient: AuthApiClient,
      operationUri: String,
      input: Option[JsObject]
  ): Directive0 =
    (extractLog & withAuthDecision(
      authApiClient,
      AuthDecisionReqConfig(operationUri, unknowns = Some(Nil), input = input)
    )).tflatMap {
      case (log, authDecision: AuthDecision) =>
        if (authDecision.hasResidualRules) {
          // Can't make unconditional decision, we should response 403 error
          log.warning(
            "Failed to make unconditional auth decision for operation `{}`. " +
              "Input: {}. ",
            operationUri,
            input
          )
          complete(
            Forbidden,
            s"you are not permitted to perform `${operationUri}`: no unconditional decision can be made."
          )
        } else {
          if (authDecision.result.isDefined && Auth.isTrueEquivalent(
                authDecision.result.get
              )) {
            // the request is permitted, passing to inner route for processing.
            pass
          } else {
            complete(
              Forbidden,
              s"you are not permitted to perform `${operationUri}`: no unconditional decision can be made."
            )
          }
        }
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
