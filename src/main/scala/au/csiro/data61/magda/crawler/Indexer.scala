package au.csiro.data61.magda.crawler

import java.net.URL

import scala.util.Failure
import scala.util.Success

import akka.actor.Actor
import akka.actor.ActorRef
import au.csiro.data61.magda.api.Types._
import au.csiro.data61.magda.search.SearchProvider

/**
 * @author Foat Akhmadeev
 *         17/01/16
 */
class Indexer(supervisor: ActorRef) extends Actor {
  val searchProvider: SearchProvider = SearchProvider()
  implicit val ec = context.dispatcher

  def receive: Receive = {
    case Index(baseUrl, dataSets) =>
      searchProvider.index(dataSets) onComplete {
        case Success(_)      => supervisor ! IndexFinished(dataSets, baseUrl)
        case Failure(reason) => supervisor ! IndexFailed(baseUrl, reason)
      }

  }

  @throws[Exception](classOf[Exception])
  override def postStop(): Unit = {
    super.postStop()
    //    store.foreach(println)
    //    println(store.size)
  }
}