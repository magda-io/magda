package au.csiro.data61.magda.search.elasticsearch

import akka.actor.Scheduler
import akka.event.LoggingAdapter
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.util.ErrorHandling.retry
import com.sksamuel.elastic4s.{ TcpClient, ElasticsearchClientUri }
import org.elasticsearch.common.settings.Settings

import scala.concurrent.{ ExecutionContext, Future }
import scala.concurrent.duration._

trait ClientProvider {
  def getClient(implicit scheduler: Scheduler, logger: LoggingAdapter, ec: ExecutionContext): Future[TcpClient]
}

class DefaultClientProvider extends ClientProvider {
  private var clientFuture: Option[Future[TcpClient]] = None

  override def getClient(implicit scheduler: Scheduler, logger: LoggingAdapter, ec: ExecutionContext): Future[TcpClient] = {
    val outerFuture = clientFuture match {
      case Some(future) => future
      case None =>
        val future = retry(() => Future {
          val uri = ElasticsearchClientUri(AppConfig.conf().getString("elasticSearch.serverUrl"))
          val settings = Settings.builder().put("cluster.name", "myesdb").build()
          TcpClient.transport(settings, uri)
        }, 10 seconds, 10, onRetry(logger))
          .map { client =>
            logger.info("Successfully connected to elasticsearch client")
            client
          }

        clientFuture = Some(future)

        future
    }

    outerFuture
  }

  private def onRetry(logger: LoggingAdapter)(retriesLeft: Int, error: Throwable) = logger.error("Failed to make initial contact with ES server, {} retries left", retriesLeft, error)
}