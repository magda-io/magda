package au.csiro.data61.magda.client

import akka.actor.ActorSystem
import akka.event.Logging
import akka.stream.{ActorAttributes, Materializer}
import com.typesafe.config.Config
import io.lemonlabs.uri.UrlPath
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.stream.scaladsl.Source
import au.csiro.data61.magda.util.RichConfig._
import spray.json._
import scala.concurrent.duration._

import java.net.URL
import scala.concurrent.duration.DurationInt
import scala.concurrent.{ExecutionContext, Future}
import akka.actor.Scheduler
import akka.pattern.after

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

  val mainDispatcher = system.dispatchers.lookup("embeddingApi.main-dispatcher")
  val logger = Logging(system, getClass)

  val maxRetries = config.getOptionalInt("embeddingApi.maxRetries").getOrElse(5)

  val retryBackoff =
    config.getOptionalDuration("embeddingApi.retryBackoff").getOrElse(5 seconds)

  val taskSize = config.getOptionalInt("embeddingApi.taskSize").getOrElse(5)

  def retry[T](
      op: () => Future[T],
      delay: FiniteDuration,
      retries: Int,
      onRetry: (Int, Throwable) => Unit = (_, _) => {}
  )(implicit ec: ExecutionContext, s: Scheduler): Future[T] = {
    op().recoverWith {
      case e: Throwable if retries > 0 =>
        onRetry(retries - 1, e)
        after(delay, s)(
          retry(op, delay, retries - 1, onRetry)(mainDispatcher, scheduler)
        )(mainDispatcher)
    }(mainDispatcher)
  }

  def get(text: String): Future[Array[Double]] = _getWithRetry(text)

  def get(textList: Seq[String]): Future[Array[Array[Double]]] = {
    if (textList.size <= taskSize) {
      _getWithRetry(textList)
    } else {
      textList.toList
        .grouped(taskSize)
        .foldLeft[Future[Array[Array[Double]]]](Future.successful(Array())) {
          (acc, item) =>
            acc.flatMap { resultList =>
              _getWithRetry(item).map(resultList ++ _)
            }
        }
    }
  }

  def _getWithRetry(text: String): Future[Array[Double]] =
    retry(
      () => _get(text),
      delay = retryBackoff,
      retries = maxRetries,
      onRetry = (count, err) => {
        logger.warning(
          "{} times retry generate embedding because of error: {}",
          count,
          err
        )
      }
    )(mainDispatcher, scheduler)

  def _getWithRetry(textList: Seq[String]): Future[Array[Array[Double]]] =
    retry(
      () => _get(textList),
      delay = retryBackoff,
      retries = maxRetries,
      onRetry = (count, err) => {
        logger.warning(
          "{} times retry generate embedding because of error: {}",
          count,
          err
        )
      }
    )(mainDispatcher, scheduler)

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
