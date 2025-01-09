package au.csiro.data61.magda.client

import akka.actor.ActorSystem
import akka.stream.Materializer
import au.csiro.data61.magda.model.Auth.AuthProtocols
import com.typesafe.config.Config
import io.lemonlabs.uri.UrlPath
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import au.csiro.data61.magda.AppConfig
import spray.json._

import java.net.URL
import scala.concurrent.{ExecutionContext, Future}

class EmbeddingApiClient(reqHttpFetcher: HttpFetcher)(
    implicit val config: Config,
    implicit val system: ActorSystem,
    implicit val executor: ExecutionContext,
    implicit val materializer: Materializer
) {

  private val parallelism: Int =
    AppConfig.conf().getInt("embeddingApi.parallelism")

  def this()(
      implicit config: Config,
      system: ActorSystem,
      executor: ExecutionContext,
      materializer: Materializer
  ) = {
    this(
      HttpFetcher(
        new URL(config.getString("embeddingApi.baseUrl")),
        Some(parallelism)
      )
    )(
      config,
      system,
      executor,
      materializer
    )
  }

  def get(text: String): Future[Array[Double]] = {
    val embeddingEndpoint = UrlPath.parse("/v1/embeddings").toString()
    reqHttpFetcher
      .post[JsValue](
        embeddingEndpoint,
        payload = JsObject(("input", JsString(text))),
        autoRetryConnection = true
      )
      .flatMap(
        reqHttpFetcher.jsonResponse(_, Some(embeddingEndpoint), Some("POST"))
      )
      .map { data =>
        val embeddings = data.asJsObject
          .fields("data")
          .asInstanceOf[JsArray]
          .elements
          .map(
            _.asJsObject
              .fields("embedding")
              .asInstanceOf[JsArray]
              .elements
              .map(_.asInstanceOf[JsNumber].value.toDouble)
          )
        embeddings.head.toArray
      }
  }

  def get(textList: Seq[String]): Future[Array[Array[Double]]] = {
    val embeddingEndpoint = UrlPath.parse("/v1/embeddings").toString()
    reqHttpFetcher
      .post[JsValue](
        embeddingEndpoint,
        payload =
          JsObject(("input", JsArray(textList.toVector.map(JsString(_))))),
        autoRetryConnection = true
      )
      .flatMap(
        reqHttpFetcher.jsonResponse(_, Some(embeddingEndpoint), Some("POST"))
      )
      .map { data =>
        val embeddings = data.asJsObject
          .fields("data")
          .asInstanceOf[JsArray]
          .elements
          .map(
            _.asJsObject
              .fields("embedding")
              .asInstanceOf[JsArray]
              .elements
              .map(_.asInstanceOf[JsNumber].value.toDouble)
              .toArray
          )
          .toArray
        embeddings
      }
  }

}
