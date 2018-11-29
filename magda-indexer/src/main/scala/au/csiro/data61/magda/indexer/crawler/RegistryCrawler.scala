package au.csiro.data61.magda.indexer.crawler

import java.time.OffsetDateTime

import akka.NotUsed
import akka.actor.{ActorSystem, Scheduler}
import akka.event.Logging
import akka.stream.Materializer
import akka.stream.scaladsl.Source
import au.csiro.data61.magda.client.RegistryExternalInterface
import au.csiro.data61.magda.indexer.helpers.StreamController
import au.csiro.data61.magda.indexer.search.SearchIndexer
import au.csiro.data61.magda.model.misc.DataSet
import com.typesafe.config.Config

import scala.concurrent.{ExecutionContextExecutor, Future}

class RegistryCrawler(interface: RegistryExternalInterface, indexer: SearchIndexer)
                     (implicit val system: ActorSystem,
                      implicit val config: Config,
                      implicit val materializer: Materializer) extends Crawler {
  val log = Logging(system, getClass)
  implicit val ec: ExecutionContextExecutor = system.dispatcher
  implicit val scheduler: Scheduler = system.scheduler

  var lastCrawl: Option[Future[Unit]] = None
  private val streamControllerSourceBufferSize =
    config.getInt("crawler.streamControllerSourceBufferSize")

  def crawlInProgress(): Boolean = lastCrawl.exists(!_.isCompleted)

  def crawl(): Future[Unit] = {
    if (crawlInProgress()) lastCrawl.get
    else {
      lastCrawl = Some(newCrawl())
      lastCrawl.get
    }
  }

  private def newCrawl(): Future[Unit] = {
    val startInstant = OffsetDateTime.now

    log.info("Crawling registry at {}", interface.baseApiPath)

    val interfaceSource = streamForInterface()

    indexer.index(interfaceSource)
      .flatMap { result =>
        log.info("Indexed {} datasets with {} failures", result.successes, result.failures.length)

        val futureOpt = if (result.failures.isEmpty) { // does this need to be tunable?
          log.info("Trimming datasets indexed before {}", startInstant)
          Some(indexer.trim(startInstant))
        } else {
          log.warning("Encountered too many failures to trim old datasets")
          None
        }

        futureOpt.map(_.map(_ => result)).getOrElse(Future(result))
      }
      .recover {
        case e: Throwable =>
          log.error(e, "Failed while indexing {}")
          SearchIndexer.IndexResult(0, Seq())
      }
      .map(result => (result.successes, result.failures.length))
      .map {
        case (successCount, failureCount) =>
          if (successCount > 0) {
            if (config.getBoolean("indexer.makeSnapshots")) {
              log.info("Snapshotting...")
              indexer.snapshot()
            }
          } else {
            log.info("Did not successfully index anything, no need to snapshot either.")
          }

          if (failureCount > 0) {
            log.warning("Failed to index {} datasets", failureCount)
          }
      }
      .recover {
        case e: Throwable =>
          log.error(e, "Failed crawl")
      }
  }

  /**
    * Provide a dataset source for a stream.
    *
    * @return the stream source
    */
  private def streamForInterface(): Source[DataSet, NotUsed] = {
    val streamController = new StreamController(interface, streamControllerSourceBufferSize)
    streamController.start()
    streamController.getSource
  }
}
