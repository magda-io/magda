package au.csiro.data61.magda.crawler

import akka.NotUsed
import akka.actor.ActorSystem
import akka.event.Logging
import akka.stream.{ Materializer, ThrottleMode }
import akka.stream.scaladsl.{ Merge, Sink, Source }
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.external.{ ExternalInterface, InterfaceConfig }
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.search.SearchIndexer
import com.typesafe.config.Config

import scala.concurrent.Future
import scala.concurrent.duration._
import au.csiro.data61.magda.model.misc.Agent
import java.time.Instant
import java.time.OffsetDateTime

class Crawler(val externalInterfaces: Seq[ExternalInterface])(implicit val system: ActorSystem, implicit val config: Config, implicit val materializer: Materializer) {
  val log = Logging(system, getClass)
  implicit val ec = system.dispatcher

  def crawl(indexer: SearchIndexer) = {
    val startInstant = OffsetDateTime.now

    val crawlFutures = externalInterfaces
      .filter(!_.getInterfaceConfig.ignore)
      .map { interface =>
        val interfaceSource = streamForInterface(interface)

        indexer.index(interface.getInterfaceConfig, interfaceSource)
          .flatMap { result =>
            log.info("Indexed {} datasets from {} with {} failures", result.successes, interface.getInterfaceConfig.name, result.failures.length)

            val futureOpt = if (result.successes >= result.failures.length) { // does this need to be tunable?
              log.info("Trimming datasets from {} indexed before {}", interface.getInterfaceConfig.name, startInstant)
              Some(indexer.trim(interface.getInterfaceConfig, startInstant))
            } else {
              log.warning("Encountered too many failures to trim old datasets from {}", interface.getInterfaceConfig.name)
              None
            }

            futureOpt.map(_.map(_ => result)).getOrElse(Future(result))
          }
          .recover {
            case e: Throwable =>
              log.error(e, "Failed while indexing {}")
              SearchIndexer.IndexResult(0, Seq())
          }
      }

    Future.sequence(crawlFutures)
      .map(results => results.foldLeft((0l, 0l)) { (soFar, result) =>
        val (prevSuccesses, prevFailures) = soFar
        (prevSuccesses + result.successes, prevFailures + result.failures.length)
      })
      .map {
        case (successCount, failureCount) =>
          if (successCount > 0) {
            log.info("Indexed {} datasets", successCount)
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

  def streamForInterface(interface: ExternalInterface): Source[DataSet, NotUsed] = {
    val interfaceDef = interface.getInterfaceConfig

    Source.fromFuture(interface.getTotalDataSetCount())
      .mapConcat { count =>
        log.info("{} has {} datasets", interfaceDef.baseUrl, count)
        val maxFromConfig = if (config.hasPath("indexer.maxResults")) config.getLong("indexer.maxResults") else Long.MaxValue
        createBatches(interfaceDef, 0, Math.min(maxFromConfig, count))
      }
      .throttle(1, 1 second, 1, ThrottleMode.Shaping)
      .mapAsync(1) { batch => interface.getDataSets(batch.start, batch.size) }
      .map { dataSets =>
        val filteredDataSets = dataSets
          .filterNot(_.distributions.isEmpty)
          .map(dataSet => dataSet.copy(publisher =
            dataSet.publisher.orElse(
              interfaceDef.defaultPublisherName.map(defaultPublisher => Agent(name = Some(defaultPublisher)))
            )))

        val ineligibleDataSetCount = dataSets.size - filteredDataSets.size
        if (ineligibleDataSetCount > 0) {
          log.info("Filtering out {} datasets from {} because they have no distributions", ineligibleDataSetCount, interfaceDef.name)
        }

        filteredDataSets
      }
      .recover {
        case e: Throwable =>
          log.error(e, "Failed while fetching from {}", interfaceDef.name)
          Nil
      }
      .mapConcat(identity)
  }

  case class Batch(start: Long, size: Int)

  def createBatches(interfaceDef: InterfaceConfig, start: Long, end: Long): List[Batch] = {
    val length = end - start
    if (length <= 0) {
      Nil
    } else {
      val nextPageSize = math.min(interfaceDef.pageSize, length).toInt
      Batch(start, nextPageSize) :: createBatches(interfaceDef, start + nextPageSize, end)
    }
  }
}

object Crawler {
  def apply(externalInterfaces: Seq[ExternalInterface])(implicit system: ActorSystem, config: Config, materializer: Materializer) =
    new Crawler(externalInterfaces)
}