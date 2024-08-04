package au.csiro.data61.magda.client

import scala.concurrent.ExecutionContext
import scala.concurrent.{Future, Promise}
import akka.actor.{ActorSystem, Scheduler}
import akka.http.scaladsl.Http
import akka.http.scaladsl.client.RequestBuilding
import akka.http.scaladsl.marshalling.ToEntityMarshaller
import akka.http.scaladsl.model.HttpRequest
import akka.http.scaladsl.model.HttpResponse
import akka.stream.Materializer
import akka.stream.scaladsl.Sink
import akka.stream.scaladsl.Source
import au.csiro.data61.magda.util.Http.getPort

import java.net.URL
import java.util.concurrent.TimeUnit
import scala.concurrent.duration.Duration
import scala.concurrent.duration.MILLISECONDS
import akka.http.scaladsl.model.HttpHeader
import akka.pattern.after
import au.csiro.data61.magda.AppConfig

import scala.util.{Failure, Success}
import akka.stream.{OverflowStrategy, QueueOfferResult}
import akka.stream.scaladsl._

import scala.concurrent.duration.FiniteDuration
import scala.util.control.NonFatal
import scala.util.Random
import spray.json._
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.unmarshalling.{Unmarshal, Unmarshaller}
import akka.util.ByteString

trait HttpFetcher {
  def get(path: String, headers: Seq[HttpHeader] = Seq()): Future[HttpResponse]

  def post[T](
      path: String,
      payload: T,
      headers: Seq[HttpHeader] = Seq(),
      autoRetryConnection: Boolean = false
  )(
      implicit m: ToEntityMarshaller[T]
  ): Future[HttpResponse]

  def put[T](
      path: String,
      payload: T,
      headers: Seq[HttpHeader] = Seq(),
      autoRetryConnection: Boolean = false
  )(
      implicit m: ToEntityMarshaller[T]
  ): Future[HttpResponse]

  def jsonResponse(
      res: HttpResponse,
      url: Option[String] = None,
      method: Option[String] = None
  )(
      implicit system: ActorSystem,
      ec: ExecutionContext
  ): Future[JsValue] = {
    if (!res.status.isSuccess()) {
      res.entity.dataBytes.runFold(ByteString(""))(_ ++ _).flatMap { body =>
        val errorMsg =
          s"Failed to request${method.map(" " + _).getOrElse("")}${url
            .map(" " + _)
            .getOrElse("")}. ${res.status.value}. ${body.utf8String}"
        system.log.error(errorMsg)
        Future.failed(
          new Exception(errorMsg)
        )
      }
    } else {
      Unmarshal(res).to[JsValue].recover {
        case e: Throwable =>
          res.entity.dataBytes.runFold(ByteString(""))(_ ++ _).map { body =>
            system.log.error(
              s"Failed to Unmarshal JSON response for request${method.map(" " + _).getOrElse("")}${url
                .map(" " + _)
                .getOrElse("")}: {}",
              body.utf8String
            )
          }
          throw e
      }
    }
  }
}

trait MockHttpFetcher extends HttpFetcher {
  def callCount: Unit
}

trait DefaultHttpFetcherUnmarshalType[T]

class HttpFetcherImpl(
    baseUrl: URL,
    requestProcessingQueue: SourceQueueWithComplete[
      (HttpRequest, Promise[HttpResponse])
    ]
)(
    implicit val system: ActorSystem,
    val materializer: Materializer,
    val ec: ExecutionContext
) extends HttpFetcher {

  private val config = AppConfig.conf()
  private val maxRetries: Int =
    config.getInt("akka.http.host-connection-pool.max-retries")

  private val retryBackoff = Duration.fromNanos(
    config
      .getDuration(
        "akka.http.host-connection-pool.base-connection-backoff",
        TimeUnit.NANOSECONDS
      )
  )

  private val maxRetryBackoff = Duration.fromNanos(
    config
      .getDuration(
        "akka.http.host-connection-pool.max-connection-backoff",
        TimeUnit.NANOSECONDS
      )
  )

  private def queueRequest(request: HttpRequest): Future[HttpResponse] = {
    val responsePromise = Promise[HttpResponse]()
    requestProcessingQueue.offer(request -> responsePromise).flatMap {
      case QueueOfferResult.Enqueued => responsePromise.future
      case QueueOfferResult.Dropped =>
        Future
          .failed(
            new RuntimeException(
              s"HTTP request queue to ${baseUrl.toString} overflowed. Try again later."
            )
          )
      case QueueOfferResult.Failure(ex) => Future.failed(ex)
      case QueueOfferResult.QueueClosed =>
        Future.failed(
          new RuntimeException(
            s"HTTP request queue to ${baseUrl.toString} was closed (pool shut down) while running the request. Try again later."
          )
        )
    }
  }

  def get(
      path: String,
      headers: Seq[HttpHeader] = Seq()
  ): Future[HttpResponse] = {
    val url = s"${baseUrl.getPath}${path}"
    system.log.debug("Making GET request to {}{}", baseUrl.getHost, url)
    val request = RequestBuilding
      .Get(url)
      .withHeaders(scala.collection.immutable.Seq.concat(headers))
    queueRequest(request)
    // according to [here](https://doc.akka.io/docs/akka-http/current/client-side/host-level.html#retrying-a-request)
    // only POST, PATCH and CONNECT will not be retried. Thus, PUT will be auto retried.
  }

  def retryFailedConnection[T](
      attempt: () => Future[T],
      attempts: Int,
      delay: FiniteDuration
  )(
      implicit ec: ExecutionContext,
      scheduler: Scheduler
  ): Future[T] = {
    try {
      if (attempts > 0) {
        attempt().recoverWith {
          case error: Throwable
              // We have to do this as UnexpectedConnectionClosureException is a private class
              // https://github.com/akka/akka-http/issues/768
              if error.getMessage.contains(
                "The http server closed the connection unexpectedly"
              ) =>
            val currentDelay = delay + Duration(
              (Random.nextFloat() * retryBackoff.toMillis).round,
              MILLISECONDS
            )

            val actualDelay = if (maxRetryBackoff.lt(currentDelay)) {
              maxRetryBackoff
            } else {
              currentDelay
            }
            after(delay, scheduler) {
              retryFailedConnection(attempt, attempts - 1, actualDelay)
            }
        }
      } else {
        attempt()
      }
    } catch {
      case NonFatal(error) => Future.failed(error)
    }
  }

  def post[T](
      path: String,
      payload: T,
      headers: Seq[HttpHeader] = Seq(),
      autoRetryConnection: Boolean = false
  )(
      implicit m: ToEntityMarshaller[T]
  ): Future[HttpResponse] = {
    val attempt = () => doPost(path, payload, headers)

    if (autoRetryConnection) {
      retryFailedConnection(attempt, maxRetries, retryBackoff)(
        ec,
        system.scheduler
      )
    } else {
      attempt()
    }
  }

  def doPost[T](
      path: String,
      payload: T,
      headers: Seq[HttpHeader] = Seq()
  )(
      implicit m: ToEntityMarshaller[T]
  ): Future[HttpResponse] = {
    val url = s"${baseUrl.getPath}${path}"
    system.log.debug(
      "Making POST request to {}{} with {}",
      baseUrl.getHost,
      url,
      payload
    )
    val request = RequestBuilding
      .Post(url, payload)
      .withHeaders(scala.collection.immutable.Seq.concat(headers))
    queueRequest(request)
  }

  def put[T](
      path: String,
      payload: T,
      headers: Seq[HttpHeader] = Seq(),
      autoRetryConnection: Boolean = false
  )(
      implicit m: ToEntityMarshaller[T]
  ): Future[HttpResponse] = {
    val attempt = () => doPut(path, payload, headers)

    if (autoRetryConnection) {
      retryFailedConnection(attempt, maxRetries, retryBackoff)(
        ec,
        system.scheduler
      )
    } else {
      attempt()
    }
  }

  def doPut[T](
      path: String,
      payload: T,
      headers: Seq[HttpHeader] = Seq()
  )(
      implicit m: ToEntityMarshaller[T]
  ): Future[HttpResponse] = {
    val url = s"${baseUrl.getPath}${path}"
    system.log.debug(
      "Making PUT request to {}{} with {}",
      baseUrl.getHost,
      url,
      payload
    )
    val request = RequestBuilding
      .Put(url, payload)
      .withHeaders(scala.collection.immutable.Seq.concat(headers))
    queueRequest(request)
  }

  def delete[T](path: String, payload: T, headers: Seq[HttpHeader] = Seq())(
      implicit m: ToEntityMarshaller[T]
  ): Future[HttpResponse] = {
    val url = s"${baseUrl.getPath}${path}"
    system.log.debug(
      "Making DELETE request to {}{} with {}",
      baseUrl.getHost,
      url,
      payload
    )
    val request = RequestBuilding
      .Delete(url, payload)
      .withHeaders(scala.collection.immutable.Seq.concat(headers))
    queueRequest(request)
  }

  def head[T](path: String, payload: T, headers: Seq[HttpHeader] = Seq())(
      implicit m: ToEntityMarshaller[T]
  ): Future[HttpResponse] = {
    val url = s"${baseUrl.getPath}${path}"
    system.log.debug(
      "Making HEAD request to {}{} with {}",
      baseUrl.getHost,
      url,
      payload
    )
    val request = RequestBuilding
      .Head(url, payload)
      .withHeaders(scala.collection.immutable.Seq.concat(headers))
    queueRequest(request)
  }

}

object HttpFetcher {

  private val queueSize: Int =
    AppConfig.conf().getInt("akka.http.host-connection-pool.max-open-requests")

  /**
    * use the string of `host|port|protocol` as key to store request processing queue of each host
    */
  private var queueMap = Map.empty[String, SourceQueueWithComplete[
    (HttpRequest, Promise[HttpResponse])
  ]]

  def apply(baseUrl: URL)(
      implicit system: ActorSystem,
      materializer: Materializer,
      ec: ExecutionContext
  ) = {
    val host = baseUrl.getHost
    val port = getPort(baseUrl)
    val protocol = baseUrl.getProtocol

    val hostQueueKey = s"${host}|${port}|${protocol}"

    val requestProcessingQueue: SourceQueueWithComplete[
      (HttpRequest, Promise[HttpResponse])
    ] = queueMap.get(hostQueueKey) match {
      case Some(q) => q
      case None =>
        val poolClientFlow = protocol match {
          case "http" =>
            Http().cachedHostConnectionPool[Promise[HttpResponse]](host, port)
          case "https" =>
            Http()
              .cachedHostConnectionPoolHttps[Promise[HttpResponse]](host, port)
        }
        val queue = Source
          .queue[(HttpRequest, Promise[HttpResponse])](
            queueSize,
            // drop oldest request
            OverflowStrategy.dropHead
          )
          .via(poolClientFlow)
          .to(Sink.foreach({
            case ((Success(resp), p)) => p.success(resp)
            case ((Failure(e), p))    => p.failure(e)
          }))
          .run()
        queueMap += (hostQueueKey -> queue)
        queue
    }

    new HttpFetcherImpl(baseUrl, requestProcessingQueue)
  }
}
