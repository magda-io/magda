package au.csiro.data61.magda.search.elasticsearch

import akka.actor.Scheduler
import akka.event.LoggingAdapter
import com.sksamuel.elastic4s.ElasticClient
import au.csiro.data61.magda.AppConfig
import com.sksamuel.elastic4s.ElasticsearchClientUri
import scala.concurrent.Future
import au.csiro.data61.magda.util.FutureRetry.retry
import scala.concurrent.duration._
import scala.concurrent.ExecutionContext
import org.elasticsearch.common.settings.Settings

object ClientProvider {
  private var clientFuture: Option[Future[ElasticClient]] = None

  def getClient(implicit scheduler: Scheduler, logger: LoggingAdapter, ec: ExecutionContext): Future[ElasticClient] =
    clientFuture match {
      case Some(future) => future
      case None =>
        val future = retry(() => Future {
          val uri = ElasticsearchClientUri(AppConfig.conf.getString("elasticSearch.serverUrl"))
          val settings = Settings.settingsBuilder().put("cluster.name", "myesdb").build()
          ElasticClient.transport(settings, uri)
        }, 10 seconds, 10, onRetry(logger)(_))

        clientFuture = Some(future)

        future
    }

  def onRetry(logger: LoggingAdapter)(retriesLeft: Int) = logger.warning("Failed to make initial contact with ES server, {} retries left", retriesLeft)
}