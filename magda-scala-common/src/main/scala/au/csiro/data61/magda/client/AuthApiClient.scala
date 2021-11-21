package au.csiro.data61.magda.client

import akka.stream.Materializer
import akka.actor.ActorSystem
import com.typesafe.config.Config
import scala.concurrent.ExecutionContext
import au.csiro.data61.magda.model.Auth.AuthProtocols
import au.csiro.data61.magda.model.Auth.User
import java.net.URL
import scala.concurrent.Future
import akka.http.scaladsl.unmarshalling.Unmarshal
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.headers.RawHeader
import au.csiro.data61.magda.opa._
import au.csiro.data61.magda.opa.OpaTypes.OpaQuery
import akka.http.scaladsl.model._
import spray.json._
import akka.util.ByteString
import scala.concurrent.duration._
import scala.collection.mutable.ListBuffer
import io.lemonlabs.uri.{Url, QueryString, UrlPath}
import au.csiro.data61.magda.model.Auth

class AuthApiClient(authHttpFetcher: HttpFetcher)(
    implicit val config: Config,
    implicit val system: ActorSystem,
    implicit val executor: ExecutionContext,
    implicit val materializer: Materializer
) extends AuthProtocols {

  private val logger = system.log

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

  def getUserPublic(userId: String): Future[User] = {
    val responseFuture = authHttpFetcher.get(s"/v0/public/users/$userId")

    responseFuture.flatMap(
      response =>
        response.status match {
          case StatusCodes.OK => Unmarshal(response.entity).to[User]
          case _ =>
            Unmarshal(response.entity)
              .to[String]
              .map(error => throw new Exception(error))
        }
    )
  }

  def getAuthDecision(
      jwtToken: Option[String],
      config: AuthDecisionReqConfig
  ) = {
    val authDecisionEndpoint = UrlPath.parse("/v0/opa/decision")

    val usePost = config.input.isDefined || config.unknowns.isDefined || config.resourceUri.isDefined

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
      val requestDataFields: ListBuffer[(String, JsValue)] = ListBuffer()
      if (config.input.isDefined) {
        requestDataFields += ("input" -> config.input.get)
      }
      if (config.unknowns.isDefined) {
        requestDataFields += ("unknowns" -> JsArray(
          config.unknowns.get.map(v => JsString(v)).toVector
        ))
      }
      if (config.resourceUri.isDefined) {
        requestDataFields += ("resourceUri" -> JsString(config.resourceUri.get))
      }

      val requestData = JsObject(requestDataFields.toMap).toString
      authHttpFetcher.post(
        requestUrl.toString,
        HttpEntity(ContentTypes.`application/json`, requestData),
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
        Unmarshal(res).to[Auth.AuthDecision]
      }
    }

  }

  def queryRecord(
      jwtToken: Option[String],
      operationType: AuthOperations.OperationType,
      policyIds: List[String]
  ): Future[List[(String, List[List[OpaTypes.OpaQuery]])]] = {
    Future.sequence(
      policyIds.map(
        policyId =>
          queryPolicy(jwtToken, operationType, policyId).map(
            result => (policyId, result)
          )
      )
    )
  }

  private def queryPolicy(
      jwtToken: Option[String],
      operationType: AuthOperations.OperationType,
      policyId: String
  ): Future[List[List[OpaQuery]]] = {
    val requestData: String = s"""{
                                 |  "query": "data.$policyId.${operationType.id}",
                                 |  "unknowns": ["input.object"]
                                 |}""".stripMargin

    logger.debug("Making request to opa with requestData {}", requestData)

    val headers = jwtToken match {
      case Some(jwt) => List(RawHeader("X-Magda-Session", jwt))
      case None      => List()
    }

    authHttpFetcher
      .post(
        s"/v0/opa/compile",
        HttpEntity(ContentTypes.`application/json`, requestData),
        headers,
        true
      )
      .flatMap(receiveOpaResponse[List[List[OpaQuery]]](_, policyId) { json =>
        OpaParser.parseOpaResponse(json, policyId)
      })
  }

  private def receiveOpaResponse[T](
      res: HttpResponse,
      policyId: String
  )(fn: JsValue => T): Future[T] = {
    if (res.status.intValue() != 200) {
      res.entity.dataBytes.runFold(ByteString(""))(_ ++ _).flatMap { body =>
        logger
          .error(s"OPA failed to process the request: {}", body.utf8String)
        Future.failed(
          new Exception(
            s"Failed to retrieve access control decision from OPA for $policyId: ${body.utf8String}"
          )
        )
      }
    } else {
      res.entity.toStrict(10.seconds).map { entity =>
        val string = entity.data.utf8String
        logger.debug("Recieved {} from OPA", string)
        fn(string.parseJson)
      }
    }
  }
}
