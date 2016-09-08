package au.csiro.data61.magda.crawler

import scala.concurrent.Await
import scala.concurrent.duration._
import scala.language.postfixOps
import java.net.URL
import akka.actor.{ Actor, ActorSystem, Props, _ }
import scala.language.postfixOps
import au.csiro.data61.magda.crawler._
import au.csiro.data61.magda.external.ExternalInterface.ExternalInterfaceType.ExternalInterfaceType

class Supervisor(system: ActorSystem) extends Actor {
  val indexer = context actorOf Props(new Indexer(self))

  val maxPages = 100
  val maxRetries = 2

  var numVisited = 0
  var toScrape = Set.empty[URL]
  var scrapeCounts = Map.empty[URL, Int]
  var host2Actor = Map.empty[URL, ActorRef]

  def receive: Receive = {
    case Start(interfaceType, baseUrl) =>
      println(s"starting for $baseUrl")
      scrape(interfaceType, baseUrl)
    case ScrapeFinished(start, count) =>
      println(s"scrapeing finished $start")
    case IndexFinished(dataSets) =>
      println(s"index finished")
    //      if (numVisited < maxPages)
    //        urls.toSet.filter(l => !scrapeCounts.contains(l)).foreach(scrape)
    //      checkAndShutdown(url)
    //    case ScrapeFailure(url, reason) =>
    //      val retries: Int = scrapeCounts(url)
    //      println(s"scrapeing failed $url, $retries, reason = $reason")
    //      if (retries < maxRetries) {
    //        countVisits(url)
    //        host2Actor(url.getHost) ! Scrape(url)
    //      } else
    //        checkAndShutdown(url)
  }

  //  def checkAndShutdown(url: URL): Unit = {
  //    toScrape -= url
  //    // if nothing to visit
  //    if (toScrape.isEmpty) {
  //      self ! PoisonPill
  //      system.terminate()
  //    }
  //  }

  def scrape(interfaceType: ExternalInterfaceType, baseUrl: URL) = {

    println(s"url = $baseUrl")
    val actor = host2Actor.getOrElse(baseUrl, {
      val buff = system.actorOf(Props(new RepoCrawler(self, indexer, interfaceType, baseUrl)))
      host2Actor += (baseUrl -> buff)
      buff
    })

    //    numVisited += 1
    //    toScrape += baseUrl
    actor ! ScrapeRepo()
  }

  def countVisits(url: URL): Unit = scrapeCounts += (url -> (scrapeCounts.getOrElse(url, 0) + 1))
}