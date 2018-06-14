package au.csiro.data61.magda.search.elasticsearch

import akka.actor.Scheduler
import akka.event.LoggingAdapter
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.util.ErrorHandling.retry
import com.sksamuel.elastic4s.{ ElasticsearchClientUri }

import scala.concurrent.{ ExecutionContext, Future }
import scala.concurrent.duration._
import com.sksamuel.elastic4s.http.HttpClient

trait ClientProvider {
  def getClient(implicit scheduler: Scheduler, logger: LoggingAdapter, ec: ExecutionContext): Future[HttpClient]
}

class DefaultClientProvider extends ClientProvider {
  private var clientFuture: Option[Future[HttpClient]] = None

  override def getClient(implicit scheduler: Scheduler, logger: LoggingAdapter, ec: ExecutionContext): Future[HttpClient] = {
    val outerFuture = clientFuture match {
      case Some(future) => future
      case None =>
        val future = retry(() => Future {
          val uri = ElasticsearchClientUri(AppConfig.conf().getString("elasticSearch.serverUrl")+"?cluster.name=myesdb")
          HttpClient(uri)
        }, 10 seconds, 10, onRetry(logger))
          .map { client =>
            logger.info("Successfully made initial contact with the ES client (this doesn't mean we're fully connected yet!)")
            client
          }

        clientFuture = Some(future)

        future
    }

    outerFuture
  }

  private def onRetry(logger: LoggingAdapter)(retriesLeft: Int, error: Throwable) = logger.error("Failed to make initial contact with ES server, {} retries left \n {}", retriesLeft, error)
}
