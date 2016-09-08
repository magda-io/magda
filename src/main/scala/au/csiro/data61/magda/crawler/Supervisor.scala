package au.csiro.data61.magda.crawler

import scala.concurrent.Await
import scala.concurrent.duration._
import scala.language.postfixOps
import java.net.URL
import akka.actor.{ Actor, ActorSystem, Props, _ }
import scala.language.postfixOps
import au.csiro.data61.magda.crawler._
import au.csiro.data61.magda.external.ExternalInterface.ExternalInterfaceType.ExternalInterfaceType
import akka.event.Logging

class Supervisor(system: ActorSystem) extends Actor with ActorLogging {
  var host2Actor = Map.empty[URL, ActorRef]
  val indexer = context actorOf Props(new Indexer(self))

  def receive: Receive = {
    case Start(externalInterfaces) =>
      log.info("Beginning scrape with {} interfaces", externalInterfaces.length)

      externalInterfaces
        .map(interface => host2Actor.getOrElse(interface._2, {
          val newActor = system.actorOf(Props(new RepoCrawler(self, indexer, interface._1, interface._2)))
          host2Actor += (interface._2 -> newActor)
          newActor
        }))
        .map(actor => actor ! ScrapeRepo())
    case ScrapeRepoFailed(baseUrl, reason) =>
      log.error(reason, "Failed to start index for {} due to {}", baseUrl, reason.getMessage)
    case ScrapeRepoFinished(baseUrl) =>
      host2Actor.get(baseUrl).get ! PoisonPill
      host2Actor -= baseUrl
      log.info("Finished scraping {}", baseUrl)
    case IndexFinished(dataSets, baseUrl) =>
      val ids = dataSets.map { ds => s"${ds.title.getOrElse("")}" }
      log.info("Finished indexing datasets {} from {}", ids, baseUrl)
    case IndexFailed(baseUrl, reason) =>
      log.error(reason, "Failed to index datasets for {} due to {}", baseUrl, reason.getMessage)
  }
}