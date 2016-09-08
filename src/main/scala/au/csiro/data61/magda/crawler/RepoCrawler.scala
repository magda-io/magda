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

/**
 * @author Foat Akhmadeev
 *         17/01/16
 */
class RepoCrawler(supervisor: ActorRef, indexer: ActorRef, apiType: ExternalInterfaceType, baseUrl: URL) extends Actor {
  val PAGE_SIZE = 50
  implicit val ec = context.dispatcher
  val interface: ExternalInterface = ExternalInterface(apiType, baseUrl)(context.system, context.dispatcher, ActorMaterializer.create(context))

  val throttler = context.actorOf(Props(classOf[TimerBasedThrottler], 1 msgsPer 10.second))
  throttler ! SetTarget(Some(context.self))

  def receive: Receive = {
    case ScrapeRepo() =>
      println(s"scraping $baseUrl")

      interface.getTotalDataSetCount() onComplete {
        case Success(count) => createBatches(0, count).map(batch => throttler ! ScrapeDataSets(batch._1, batch._2.toInt))
      }
    case ScrapeDataSets(start, number) =>
      println(s"scraping $number datasets starting with $start from $apiType at $baseUrl")

      interface.getDataSets(start, number.toInt) onComplete {
        case Success(dataSets) => {
          indexer ! Index(dataSets)
        }
      }
  }

  def createBatches(start: Long, end: Long): List[(Long, Long)] = (end - start) match {
    case 0 => List()
    case remaining => {
      val nextPageSize = math.min(PAGE_SIZE, remaining)
      (start, nextPageSize) :: createBatches(start + nextPageSize, end)
    }
  }   
}