package au.csiro.data61.magda.crawler

import java.net.URL

import akka.actor.{ Actor, ActorRef }

/**
 * @author Foat Akhmadeev
 *         17/01/16
 */
class Indexer(supervisor: ActorRef) extends Actor {
  def receive: Receive = {
    case Index(baseUrl, dataSets) =>

      // TODO: Put into ES or similar here

      supervisor ! IndexFinished(dataSets, baseUrl)
  }

  @throws[Exception](classOf[Exception])
  override def postStop(): Unit = {
    super.postStop()
    //    store.foreach(println)
    //    println(store.size)
  }
}