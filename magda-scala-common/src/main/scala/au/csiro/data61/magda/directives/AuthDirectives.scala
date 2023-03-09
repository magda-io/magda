package au.csiro.data61.magda.directives

import akka.http.scaladsl.model.StatusCodes.{Forbidden, InternalServerError}
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.{Directive0, _}
import au.csiro.data61.magda.Authentication
import au.csiro.data61.magda.client.{AuthApiClient, AuthDecisionReqConfig}
import io.jsonwebtoken.{Claims, Jws}
import au.csiro.data61.magda.model.Auth

import au.csiro.data61.magda.model.Auth.{AuthDecision}
import spray.json.{JsObject}

import scala.util.{Failure, Success}

object AuthDirectives {

  /**
    * Make auth decision based on auth decision request config.
    * Depends on the config provided, either partial eval (conditional decision on a set of records/objects)
    * Or unconditional decision for a single record / object will be returned.
    * @param authApiClient
    * @param config
    * @return
    */
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

  /**
    * Require unconditional auth decision based on auth decision request config.
    * When making decision on a group of records/objects, this method makes sure
    * the user has permission to all records/objects regardless individual record / object's attributes.
    *
    * @param authApiClient
    * @param config
    * @param requiredDecision
    * @return
    */
  def requireUnconditionalAuthDecision(
      authApiClient: AuthApiClient,
      config: AuthDecisionReqConfig,
      requiredDecision: Boolean = true
  ): Directive0 = withAuthDecision(authApiClient, config).flatMap {
    authDecision =>
      if (authDecision.hasResidualRules == false && authDecision.result.isDefined && (requiredDecision == Auth
            .isTrueEquivalent(authDecision.result.get))) {
        pass
      } else {
        complete(
          Forbidden,
          s"you are not permitted to perform `${config.operationUri}` on required resources."
        )
      }
  }

  /**
    * require permission based on input data provided.
    * Different from withAuthDecision, its method always set `unknowns` = Nil i.e. it will always attempt to make unconditional decision.
    * It's for make decision for one single record / object. For partial eval for a set of records / objects, please use `withAuthDecision` or `requireUnconditionalAuthDecision`
    * @param authApiClient
    * @param operationUri
    * @param input
    * @return
    */
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
              s"you are not permitted to perform `${operationUri}`."
            )
          }
        }
    }

  /** Gets the X-Magda-Session header out of the request, providing it as a string without doing any verification */
  def getJwt: Directive1[Option[String]] = {
    extractRequest.flatMap { request =>
      val sessionToken =
        request.headers.find(_.is(Authentication.headerName.toLowerCase))

      provide(sessionToken.map(_.value()))
    }
  }

  /**
    * get current user ID from JWT token
    * If can't find JWT token, return None
    * @return
    */
  def getUserId: Directive1[Option[String]] = {
    extractLog.flatMap { logger =>
      getJwt.flatMap {
        case Some(jwtToken) =>
          try {
            val claims: Jws[Claims] =
              Authentication.parser(logger).parseClaimsJws(jwtToken)
            val userId = claims.getBody().get("userId", classOf[String])

            provide(Some(userId))
          } catch {
            case e: Throwable =>
              logger.error(
                e,
                "Failed to extract UserId from JWT token"
              )
              reject(
                ValidationRejection("Failed to retrieve userId from JWT token!")
              )
          }
        case _ => provide(None)
      }
    }
  }

  /**
    * get current user ID from JWT token
    * If can't locate userId, response 403 error
    * @return
    */
  def requireUserId: Directive1[String] = getUserId.flatMap {
    case Some(userId) => provide(userId)
    case _ =>
      complete(
        Forbidden,
        s"Anonymous users access are not permitted: userId is required."
      )
  }
}
