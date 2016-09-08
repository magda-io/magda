package au.csiro.data61.magda.crawler

import java.net.URL

import akka.actor.{ Actor, ActorRef }

/**
 * @author Foat Akhmadeev
 *         17/01/16
 */
class Indexer(supervisor: ActorRef) extends Actor {
  var store = Map.empty[URL, Content]

  def receive: Receive = {
    case Index(dataSets) =>
      val ids = dataSets.map { ds => s"${ds.title}\n" }
      println(s"saving datasets:\n $ids")

      // TODO: ???. Profit!

      supervisor ! IndexFinished(dataSets)
  }

  @throws[Exception](classOf[Exception])
  override def postStop(): Unit = {
    super.postStop()
    store.foreach(println)
    println(store.size)
  }
}