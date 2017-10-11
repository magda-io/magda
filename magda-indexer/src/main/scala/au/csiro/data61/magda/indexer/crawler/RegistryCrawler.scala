package au.csiro.data61.magda.indexer.crawler

import akka.NotUsed
import akka.actor.ActorSystem
import akka.event.Logging
import akka.stream.{ Materializer, ThrottleMode }
import akka.stream.scaladsl.{ Merge, Sink, Source }
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.indexer.search.SearchIndexer
import com.typesafe.config.Config

import scala.concurrent.Future
import scala.concurrent.duration._
import au.csiro.data61.magda.model.misc.Agent
import java.time.Instant
import java.time.OffsetDateTime
import au.csiro.data61.magda.util.ErrorHandling
import au.csiro.data61.magda.client.RegistryExternalInterface

class RegistryCrawler(interface: RegistryExternalInterface)(implicit val system: ActorSystem, implicit val config: Config, implicit val materializer: Materializer) extends Crawler {
  val log = Logging(system, getClass)
  implicit val ec = system.dispatcher
  implicit val scheduler = system.scheduler

  def crawl(indexer: SearchIndexer): Future[Unit] = {
    val startInstant = OffsetDateTime.now

    log.info("Crawling registry at {}", interface.baseApiPath)

    val interfaceSource = streamForInterface()

    val crawlFuture = indexer.index(interfaceSource)
      .flatMap { result =>
        log.info("Indexed {} datasets with {} failures", result.successes, result.failures.length)

        val futureOpt = if (result.failures.length == 0) { // does this need to be tunable?
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

    crawlFuture.map(result => (result.successes, result.failures.length))
      .map {
        case (successCount, failureCount) =>
          if (successCount > 0) {
            log.info("Indexed {} datasets with {} failures", successCount, failureCount)
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

  def tokenCrawl(nextFuture: () => Future[(Option[String], List[DataSet])], batchSize: Int): Source[DataSet, NotUsed] = {
    val onRetry = (retryCount: Int, e: Throwable) => log.error(e, "Failed while fetching from registry, retries left: {}", retryCount + 1)

    val safeFuture = ErrorHandling.retry(nextFuture, 30 seconds, 30, onRetry)
      .recover {
        case e: Throwable =>
          log.error(e, "Failed completely while fetching from registry. This means we can't go any further!!")
          (None, Nil)
      }

    Source.fromFuture(safeFuture).flatMapConcat {
      case (tokenOption, dataSets) =>
        val dataSetSource = Source.fromIterator(() => dataSets.toIterator)

        tokenOption match {
          case Some(token) => dataSetSource.concat(tokenCrawl(() => interface.getDataSetsToken(token, batchSize), batchSize))
          case None        => dataSetSource
        }
    }
  }

  def streamForInterface(): Source[DataSet, NotUsed] = {
    val firstPageFuture = () => interface.getDataSetsReturnToken(0, 50)

    val crawlSource = tokenCrawl(firstPageFuture, 100)
      .filterNot(_.distributions.isEmpty)
      .map(dataSet => dataSet.copy(publisher =
        dataSet.publisher))
      .alsoTo(Sink.fold(0) {
        case (count, y) =>
          val newCount = count + 1

          if ((newCount % 1000) == 0) {
            log.info("Crawled {} datasets from registry", newCount)
          }

          newCount
      })

    crawlSource
  }
}
