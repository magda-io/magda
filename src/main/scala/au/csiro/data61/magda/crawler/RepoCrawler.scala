package au.csiro.data61.magda.crawler

import java.net.URL

import scala.concurrent.Future
import scala.concurrent.duration._
import scala.language.postfixOps
import scala.util.Failure
import scala.util.Success

import akka.actor.{ Actor, Props, _ }
import akka.contrib.throttle.Throttler._
import akka.contrib.throttle.TimerBasedThrottler
import akka.pattern.ask
import akka.pattern.pipe
import akka.stream.ActorMaterializer
import au.csiro.data61.magda.external.ExternalInterface
import au.csiro.data61.magda.external.ExternalInterface.ExternalInterfaceType._
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.external.InterfaceConfig

/**
 * @author Foat Akhmadeev
 *         17/01/16
 */
class RepoCrawler(supervisor: ActorRef, indexer: ActorRef, interfaceDef: InterfaceConfig) extends Actor with ActorLogging {
  //  val PAGE_SIZE = supervisor.
  implicit val ec = context.dispatcher
  val interface: ExternalInterface = ExternalInterface(interfaceDef)(context.system, context.dispatcher, ActorMaterializer.create(context))

  val throttler = context.actorOf(Props(classOf[TimerBasedThrottler], 1 msgsPer 1.second))
  throttler ! SetTarget(Some(context.self))

  def receive: Receive = {
    case ScrapeRepo =>
      log.info("Starting scrape of {}", interfaceDef.baseUrl)

      interface.getTotalDataSetCount() onComplete {
        case Success(count) => {
          val maxFromConfig = if (AppConfig.conf.hasPath("crawler.maxResults")) AppConfig.conf.getLong("crawler.maxResults") else Long.MaxValue
          createBatches(0, Math.min(maxFromConfig, count)).map(batch => throttler ! ScrapeDataSets(batch._1, batch._2.toInt))
        }
        case Failure(reason) => supervisor ! ScrapeRepoFailed(interfaceDef.baseUrl, reason)
      }
    case ScrapeDataSets(start, number) =>
      log.info("Scraping datasets from {} to {} in {}", start, start + number, interfaceDef.baseUrl)

      interface.getDataSets(start, number.toInt) onComplete {
        case Success(dataSets) => {
          val dataSetsWithCatalog = dataSets.map(_.copy(catalog = interfaceDef.name))
          indexer ! Index(interfaceDef.name, dataSetsWithCatalog)
          context.self ! ScrapeDataSetsFinished(start, number)
        }
        case Failure(reason) => context.self ! ScrapeDataSetsFailed(start, number, reason)
      }
    case ScrapeDataSetsFailed(start, number, reason) =>
      log.error(reason, "Failed to scrape datasets from {} to {} in {} due to {}", start, start + number, interfaceDef.baseUrl, reason)
    // TODO: Retry!
  }

  def createBatches(start: Long, end: Long): List[(Long, Long)] = (end - start) match {
    case 0 => List()
    case remaining => {
      val nextPageSize = math.min(interfaceDef.pageSize, remaining)
      (start, nextPageSize) :: createBatches(start + nextPageSize, end)
    }
  }
}