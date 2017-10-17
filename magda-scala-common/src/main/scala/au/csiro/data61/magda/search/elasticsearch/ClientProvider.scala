package au.csiro.data61.magda.search.elasticsearch

import akka.actor.Scheduler
import akka.event.LoggingAdapter
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.util.ErrorHandling.retry
import com.sksamuel.elastic4s.{ ElasticsearchClientUri }
import org.elasticsearch.common.settings.Settings

import scala.concurrent.{ ExecutionContext, Future }
import scala.concurrent.duration._
import com.sksamuel.elastic4s.TcpClient
import com.sksamuel.elastic4s.xpack.security.XPackElasticClient

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
          val passwordOpt = Option(System.getenv("ELASTIC_SEARCH_PASSWORD"))
          var settings = Settings.builder().put("cluster.name", "myesdb")

          passwordOpt match {
            case Some(password) =>
              logger.info("Password specified, starting with XPack")
              settings = settings.put("xpack.security.user", s"elastic:$password")
              XPackElasticClient(settings.build(), uri)
            case None =>
              logger.info("No password specified, starting without XPack")
              TcpClient.transport(settings.build(), uri)
          }
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