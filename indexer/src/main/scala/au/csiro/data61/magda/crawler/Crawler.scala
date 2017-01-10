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

class Crawler(val externalInterfaces: Seq[InterfaceConfig], indexer: SearchIndexer)(implicit val system: ActorSystem, implicit val config: Config, implicit val materializer: Materializer) {
  val log = Logging(system, getClass)
  implicit val ec = system.dispatcher

  val interfaces = externalInterfaces
    .groupBy(_.baseUrl)
    .mapValues(interfaceDef =>
      ExternalInterface(interfaceDef.head)
    )

  def crawl() = {
    externalInterfaces
      .map { interface =>
        val needsIndexingFuture = if (config.getBoolean("indexer.alwaysReindex")) {
          log.info("Indexing {} because indexer.alwaysReindex is true", interface.name)
          Future(true)
        } else {
          indexer.needsReindexing(interface).map { needsReindexing =>
            if (needsReindexing) {
              log.info("Indexing {} because it was determined to have zero records", interface.name)
            } else {
              log.info("Not indexing {} because it already has records", interface.name)
            }
            needsReindexing
          }
        }

        Source.fromFuture(needsIndexingFuture)
          .flatMapConcat { needsReindexing => if (needsReindexing) streamForInterface(interface) else Source.empty[(InterfaceConfig, List[DataSet])] }
      }
      .reduce((x, y) => Source.combine(x, y)(Merge(_)))
      .map {
        case (source, dataSets) =>
          val filteredDataSets = dataSets.filterNot(_.distributions.isEmpty)

          val ineligibleDataSetCount = dataSets.size - filteredDataSets.size
          if (ineligibleDataSetCount > 0) {
            log.info("Filtering out {} datasets from {} because they have no distributions", ineligibleDataSetCount, source.name)
          }

          (source, filteredDataSets)
      }
      .mapAsync(1) {
        case (source, dataSets) =>
          indexer.index(source, dataSets)
            .map(_ => (source, dataSets))
            .recover {
              case e: Throwable =>
                log.error(e, "Failed while indexing")
                (source, Nil)
            }
      }
      .runWith(Sink.fold(0)((a, b) => a + b._2.size))
      .map { size =>
        if (size > 0) {
          log.info("Indexed {} datasets", size)
          if (config.getBoolean("indexer.makeSnapshots")) {
            log.info("Snapshotting...")
            indexer.snapshot()
          }
        } else {
          log.info("Did not need to index anything, no need to snapshot either.")
        }
      }
      .recover {
        case e: Throwable =>
          log.error(e, "Failed crawl")
      }
  }

  def streamForInterface(interfaceDef: InterfaceConfig): Source[(InterfaceConfig, List[DataSet]), NotUsed] = {
    val interface = interfaces.get(interfaceDef.baseUrl).get

    Source.fromFuture(interface.getTotalDataSetCount())
      .mapConcat { count =>
        log.info("{} has {} datasets", interfaceDef.baseUrl, count)
        val maxFromConfig = if (config.hasPath("indexer.maxResults")) config.getLong("indexer.maxResults") else Long.MaxValue
        createBatches(interfaceDef, 0, Math.min(maxFromConfig, count))
      }
      .throttle(1, 1 second, 1, ThrottleMode.Shaping)
      .mapAsync(1) {
        case (start, size) => interface.getDataSets(start, size).map((interfaceDef, _))
      }
      .recover {
        case e: Throwable =>
          log.error(e, "Failed while fetching from {}", interfaceDef.name)
          (interfaceDef, Nil)
      }
  }

  def createBatches(interfaceDef: InterfaceConfig, start: Long, end: Long): List[(Long, Int)] = {
    val length = end - start
    if (length <= 0) {
      Nil
    } else {
      val nextPageSize = math.min(interfaceDef.pageSize, length).toInt
      (start, nextPageSize) :: createBatches(interfaceDef, start + nextPageSize, end)
    }
  }
}

object Crawler {
  def apply(externalInterfaces: Seq[InterfaceConfig], indexer: SearchIndexer)(implicit system: ActorSystem, config: Config, materializer: Materializer) =
    new Crawler(externalInterfaces, indexer)
}