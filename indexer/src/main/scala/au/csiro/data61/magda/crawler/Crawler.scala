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

class Crawler(val externalInterfaces: Seq[ExternalInterface])(implicit val system: ActorSystem, implicit val config: Config, implicit val materializer: Materializer) {
  val log = Logging(system, getClass)
  implicit val ec = system.dispatcher

  def crawl(indexer: SearchIndexer) = {
    externalInterfaces
      .filter(!_.getInterfaceConfig.ignore)
      .map(streamForInterface)
      .reduce(Source.combine(_, _)(Merge(_)))
      .map {
        case (source, dataSets) =>
          val filteredDataSets = dataSets
            .filterNot(_.distributions.isEmpty)
            .map(dataSet => dataSet.copy(publisher =
              dataSet.publisher.orElse(
                source.defaultPublisherName.map(defaultPublisher => Agent(name = Some(defaultPublisher)))
              )))

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
      .runWith(Sink.fold(0)((countSoFar, thisResult) => countSoFar + thisResult._2.size))
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

  def streamForInterface(interface: ExternalInterface): Source[(InterfaceConfig, List[DataSet]), NotUsed] = {
    val interfaceDef = interface.getInterfaceConfig

    Source.fromFuture(interface.getTotalDataSetCount())
      .mapConcat { count =>
        log.info("{} has {} datasets", interfaceDef.baseUrl, count)
        val maxFromConfig = if (config.hasPath("indexer.maxResults")) config.getLong("indexer.maxResults") else Long.MaxValue
        createBatches(interfaceDef, 0, Math.min(maxFromConfig, count))
      }
      .throttle(1, 1 second, 1, ThrottleMode.Shaping)
      .mapAsync(1) { batch => interface.getDataSets(batch.start, batch.size).map((interfaceDef, _)) }
      .recover {
        case e: Throwable =>
          log.error(e, "Failed while fetching from {}", interfaceDef.name)
          (interfaceDef, Nil)
      }
  }

  case class Batch(start: Long, size: Int, last: Boolean)

  def createBatches(interfaceDef: InterfaceConfig, start: Long, end: Long): List[Batch] = {
    val length = end - start
    if (length <= 0) {
      Nil
    } else {
      val nextPageSize = math.min(interfaceDef.pageSize, length).toInt
      Batch(start, nextPageSize, false) :: createBatches(interfaceDef, start + nextPageSize, end)
    }
  }
}

object Crawler {
  def apply(externalInterfaces: Seq[ExternalInterface])(implicit system: ActorSystem, config: Config, materializer: Materializer) =
    new Crawler(externalInterfaces)
}