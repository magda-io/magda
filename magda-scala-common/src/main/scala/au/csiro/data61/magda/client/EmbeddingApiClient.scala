package au.csiro.data61.magda.client

import akka.actor.ActorSystem
import akka.event.Logging
import akka.stream.Materializer
import com.typesafe.config.Config
import io.lemonlabs.uri.UrlPath
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import au.csiro.data61.magda.util.RichConfig._
import spray.json._
import au.csiro.data61.magda.util.ErrorHandling.retry

import java.net.URL
import java.util.concurrent.TimeUnit
import scala.concurrent.duration.Duration
import scala.concurrent.{ExecutionContext, Future}

class EmbeddingApiClient(reqHttpFetcher: HttpFetcher)(
    implicit val config: Config,
    implicit val system: ActorSystem,
    implicit val executor: ExecutionContext,
    implicit val materializer: Materializer
) {

  def this()(
      implicit config: Config,
      system: ActorSystem,
      executor: ExecutionContext,
      materializer: Materializer
  ) = {
    this(
      HttpFetcher(
        new URL(config.getString("embeddingApi.baseUrl")),
        config.getOptionalInt("embeddingApi.parallelism")
      )
    )(
      config,
      system,
      executor,
      materializer
    )
  }

  implicit val scheduler = system.scheduler
  val logger = Logging(system, getClass)

  def get(text: String): Future[Array[Double]] =
    retry(
      () => _get(text),
      delay = Duration.fromNanos(
        config.getDuration("embeddingApi.retryBackoff", TimeUnit.SECONDS)
      ),
      retries = config.getInt("embeddingApi.maxRetries"),
      onRetry = (count, err) => {
        logger.warning(
          "{} times retry generate embedding because of error: {}",
          count,
          err
        )
      }
    )

  def get(textList: Seq[String]): Future[Array[Array[Double]]] = retry(
    () => _get(textList),
    delay = Duration.fromNanos(
      config.getDuration("embeddingApi.retryBackoff", TimeUnit.SECONDS)
    ),
    retries = config.getInt("embeddingApi.maxRetries"),
    onRetry = (count, err) => {
      logger.warning(
        "{} times retry generate embedding because of error: {}",
        count,
        err
      )
    }
  )

  private def _get(text: String): Future[Array[Double]] = {
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

  private def _get(textList: Seq[String]): Future[Array[Array[Double]]] = {
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
