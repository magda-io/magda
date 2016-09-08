package au.csiro.data61.magda.crawler

import java.net.URL

import akka.actor.{ Actor, Props, _ }
import akka.pattern.{ ask, pipe }
import akka.util.Timeout

import scala.concurrent.Future
import scala.concurrent.duration._
import scala.language.postfixOps
import au.csiro.data61.magda.external.ExternalInterface.ExternalInterfaceType._
import akka.contrib.throttle.TimerBasedThrottler
import akka.contrib.throttle.Throttler._
import akka.stream.ActorMaterializer
import au.csiro.data61.magda.external.ExternalInterface
import scala.util.Success
import scala.util.Failure

/**
 * @author Foat Akhmadeev
 *         17/01/16
 */
class RepoCrawler(supervisor: ActorRef, indexer: ActorRef, apiType: ExternalInterfaceType, baseUrl: URL) extends Actor with ActorLogging {
  val PAGE_SIZE = 50
  implicit val ec = context.dispatcher
  val interface: ExternalInterface = ExternalInterface(apiType, baseUrl)(context.system, context.dispatcher, ActorMaterializer.create(context))

  val throttler = context.actorOf(Props(classOf[TimerBasedThrottler], 1 msgsPer 1.second))
  throttler ! SetTarget(Some(context.self))

  def receive: Receive = {
    case ScrapeRepo() =>
      log.info("Starting scrape of {}", baseUrl)

      interface.getTotalDataSetCount() onComplete {
        case Success(count)  => createBatches(0, /*count*/10000).map(batch => throttler ! ScrapeDataSets(batch._1, batch._2.toInt))
        case Failure(reason) => supervisor ! ScrapeRepoFailed(baseUrl, reason)
      }
    case ScrapeDataSets(start, number) =>
      log.info("Scraping datasets from {} to {} in {}", start, start + number, baseUrl)

      interface.getDataSets(start, number.toInt) onComplete {
        case Success(dataSets) => {
          indexer ! Index(baseUrl, dataSets)
          context.self ! ScrapeDataSetsFinished(start, number)
        }
        case Failure(reason) => context.self ! ScrapeDataSetsFailed(start, number, reason)
      }
    case ScrapeDataSetsFailed(start, number, reason) =>
      log.error(reason, "Failed to scrape datasets from {} to {} in {} due to {}", start, start + number, baseUrl, reason)
      // TODO: Retry!
  }

  def createBatches(start: Long, end: Long): List[(Long, Long)] = (end - start) match {
    case 0 => List()
    case remaining => {
      val nextPageSize = math.min(PAGE_SIZE, remaining)
      (start, nextPageSize) :: createBatches(start + nextPageSize, end)
    }
  }
}