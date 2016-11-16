//package au.csiro.data61.magda.crawler
//
//import scala.concurrent.Future
//import scala.language.postfixOps
//
//import com.typesafe.config.Config
//
//import akka.actor.{ Actor, ActorSystem, _ }
//import akka.stream.Materializer
//import au.csiro.data61.magda.crawler.Crawler
//import au.csiro.data61.magda.external.InterfaceConfig
//import au.csiro.data61.magda.search.SearchIndexer
//import scala.util.Failure
//import scala.util.Success
//
//class CrawlSupervisor(system: ActorSystem, materializer: Materializer, config: Config, val externalInterfaces: Seq[InterfaceConfig]) extends Actor with ActorLogging {
//  //  val indexer = context actorOf Props(new Indexer(self))
//  //  val host2Actor: Map[URL, ActorRef] = externalInterfaces
//  //    .groupBy(_.baseUrl)
//  //    .mapValues(interfaceConfig => system.actorOf(Props(new RepoCrawler(self, interfaceConfig.head))))
//  //
//  //  def receive: Receive = {
//  //    case ScrapeAll =>
//  //      log.info("Beginning scrape with interfaces {}", host2Actor.map { case (url, _) => url.toString })
//  //      host2Actor.foreach { case (_, interface) => interface ! ScrapeRepo }
//  //    case NeedsReIndexing =>
//  //      log.info("Search index is empty, commanding crawlers to rebuild it 🐜🐜🐜")
//  //      self ! ScrapeAll
//  //    case ScrapeRepoFailed(baseUrl, reason) =>
//  //      log.error(reason, "Failed to start index for {} due to {}", baseUrl, reason.getMessage)
//  //    case ScrapeRepoFinished(baseUrl) =>
//  //      log.info("Finished scraping {}", baseUrl)
//  //    case Index(source, dataSets) =>
//  //      indexer ! Index(source, dataSets)
//  //    case IndexFinished(dataSets, baseUrl) =>
//  //      log.info("Finished indexing {} datasets from {}", dataSets.length, baseUrl)
//  //    case IndexFailed(baseUrl, reason) =>
//  //      log.error(reason, "Failed to index datasets for {} due to {}", baseUrl, reason.getMessage)
//  //  }
//  implicit val ec = system.dispatcher
//  val indexer = SearchIndexer(system, system.dispatcher, materializer)
//  val crawler = new Crawler(system, config, externalInterfaces, materializer, indexer)
//
//  def receive: Receive = {
//    case ScrapeAll =>
//  }
//}