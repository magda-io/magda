package au.csiro.data61.magda.client

import akka.stream.Materializer
import akka.actor.ActorSystem
import com.typesafe.config.Config

import scala.concurrent.ExecutionContext
import au.csiro.data61.magda.model.Auth.AuthProtocols

import java.net.URL
import scala.concurrent.Future
import akka.http.scaladsl.unmarshalling.Unmarshal
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.headers.RawHeader
import spray.json._
import akka.util.ByteString

import scala.collection.mutable.ListBuffer
import io.lemonlabs.uri.{QueryString, Url, UrlPath}
import au.csiro.data61.magda.model.Auth

class AuthApiClient(authHttpFetcher: HttpFetcher)(
    implicit val config: Config,
    implicit val system: ActorSystem,
    implicit val executor: ExecutionContext,
    implicit val materializer: Materializer
) extends AuthProtocols {

  private val logger = system.log

  // for debug purpose only. When it's on, `getAuthDecision` method will always return "allowed" (`true`) response without contacting the policy engine
  private val skipOpaQuery = if (config.hasPath("authorization.skipOpaQuery")) {
    config.getBoolean("authorization.skipOpaQuery")
  } else {
    false
  }

  private val muteWarning = if (config.hasPath("authorization.muteWarning")) {
    config.getBoolean("authorization.muteWarning")
  } else {
    false
  }

  def this()(
      implicit config: Config,
      system: ActorSystem,
      executor: ExecutionContext,
      materializer: Materializer
  ) = {
    this(HttpFetcher(new URL(config.getString("authApi.baseUrl"))))(
      config,
      system,
      executor,
      materializer
    )
  }

  def getAuthDecision(
      jwtToken: Option[String],
      config: AuthDecisionReqConfig
  ): Future[Auth.AuthDecision] = {
    if (skipOpaQuery) {
      if (!muteWarning) {
        system.log.warning(
          "WARNING: Skip OPA (policy engine) querying option is turned on! This is fine for testing or playing around, but this should NOT BE TURNED ON FOR PRODUCTION!"
        )
      }
      return Future(
        Auth.UnconditionalTrueDecision
      )
    }

    val authDecisionEndpoint = UrlPath.parse("/v0/opa/decision")

    val usePost = config.input.isDefined || (config.unknowns.isDefined && config.unknowns.get.length > 0) || config.resourceUri.isDefined

    val requestQueryFields: ListBuffer[(String, Option[String])] = ListBuffer()
    if (config.rawAst.isDefined) {
      requestQueryFields += ("rawAst" -> config.rawAst
        .filter(!_)
        .map(_.toString))
    }
    if (config.concise.isDefined) {
      requestQueryFields += ("concise" -> config.concise
        .filter(!_)
        .map(_.toString))
    }
    if (config.explain.isDefined) {
      requestQueryFields += ("explain" -> config.explain)
    }
    if (config.pretty.isDefined) {
      requestQueryFields += ("pretty" -> config.pretty.map(_.toString))
    }
    if (config.humanReadable.isDefined) {
      requestQueryFields += ("humanReadable" -> config.humanReadable
        .filter(!_)
        .map(_.toString))
    }
    if (config.unknowns.isDefined && config.unknowns.get.length == 0) {
      // See decision endpoint docs, send unknowns as an empty string to stop endpoint from auto generating unknowns reference
      // we send `unknowns` as query string for this case
      requestQueryFields += ("unknowns" -> Some(""))
    }

    val requestUrl = Url(
      path = if (!usePost) {
        authDecisionEndpoint
          .addParts(UrlPath.parse(config.operationUri).parts)
          .toString
      } else {
        authDecisionEndpoint.toString
      },
      query = QueryString.fromTraversable(requestQueryFields.toVector)
    )

    val headers = jwtToken match {
      case Some(jwt) => List(RawHeader("X-Magda-Session", jwt))
      case None      => List()
    }
    val responseFuture = if (!usePost) {
      authHttpFetcher.get(requestUrl.toString, headers)
    } else {
      val requestDataFields: ListBuffer[(String, JsValue)] = ListBuffer(
        "operationUri" -> JsString(config.operationUri)
      )
      if (config.input.isDefined) {
        requestDataFields += ("input" -> config.input.get)
      }
      if (config.unknowns.isDefined && config.unknowns.get.length > 0) {
        requestDataFields += ("unknowns" -> JsArray(
          config.unknowns.get.map(v => JsString(v)).toVector
        ))
      }
      if (config.resourceUri.isDefined) {
        requestDataFields += ("resourceUri" -> JsString(config.resourceUri.get))
      }

      val requestData = JsObject(requestDataFields.toMap)
      authHttpFetcher.post[JsValue](
        requestUrl.toString,
        requestData,
        headers,
        true
      )
    }

    responseFuture.flatMap { res =>
      if (res.status.intValue() != 200) {
        res.entity.dataBytes.runFold(ByteString(""))(_ ++ _).flatMap { body =>
          val errorMsg =
            s"Failed to retrieve auth decision for operation `${config.operationUri}` from policy engine: ${body.utf8String}"
          logger.error(errorMsg)
          Future.failed(
            new Exception(errorMsg)
          )
        }
      } else {
        Unmarshal(res).to[Auth.AuthDecision].recover {
          case e: Throwable =>
            res.entity.dataBytes.runFold(ByteString(""))(_ ++ _).map { body =>
              logger.error(
                "Failed to Unmarshal auth decision response: {}",
                body.utf8String
              )
            }
            throw e
        }
      }
    }

  }
}
