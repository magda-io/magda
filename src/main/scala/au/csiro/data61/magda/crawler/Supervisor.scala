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
import au.csiro.data61.magda.api.Api
import com.typesafe.config.Config
import akka.stream.ActorMaterializer
import au.csiro.data61.magda.external.InterfaceConfig

class Supervisor(system: ActorSystem, config: Config, val externalInterfaces: Seq[InterfaceConfig]) extends Actor with ActorLogging {
  val indexer = context actorOf Props(new Indexer(self))
  val host2Actor: Map[URL, ActorRef] = externalInterfaces
    .groupBy(_.baseUrl)
    .mapValues(interfaceConfig => system.actorOf(Props(new RepoCrawler(self, indexer, interfaceConfig.head))))

  def receive: Receive = {
    case ScrapeAll =>
      log.info("Beginning scrape with interfaces {}", host2Actor.map { case (url, _) => url.toString })
      host2Actor.foreach { case (_, interface) => interface ! ScrapeRepo }
    case NeedsReIndexing =>
      log.info("Search index is empty, commanding crawlers to rebuild it 🐜🐜🐜")
      self ! ScrapeAll
    case ScrapeRepoFailed(baseUrl, reason) =>
      log.error(reason, "Failed to start index for {} due to {}", baseUrl, reason.getMessage)
    case ScrapeRepoFinished(baseUrl) =>
      log.info("Finished scraping {}", baseUrl)
    case IndexFinished(dataSets, baseUrl) =>
      log.info("Finished indexing {} datasets from {}", dataSets.length, baseUrl)
    case IndexFailed(baseUrl, reason) =>
      log.error(reason, "Failed to index datasets for {} due to {}", baseUrl, reason.getMessage)
  }
}