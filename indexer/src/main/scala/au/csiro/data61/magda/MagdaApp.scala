
package au.csiro.data61.magda

import scala.collection.JavaConversions._
import scala.util.Failure
import scala.util.Success

import com.typesafe.config.ConfigObject
import com.typesafe.config.ConfigValue

import akka.actor.Actor
import akka.actor.ActorLogging
import akka.actor.ActorSystem
import akka.actor.DeadLetter
import akka.actor.Props
import akka.event.Logging
import akka.stream.ActorMaterializer
import au.csiro.data61.magda.crawler.Crawler
import au.csiro.data61.magda.external.InterfaceConfig
import au.csiro.data61.magda.search.SearchIndexer
import au.csiro.data61.magda.search.elasticsearch.DefaultClientProvider

object MagdaApp extends App {
  implicit val system = ActorSystem()
  implicit val executor = system.dispatcher
  implicit val materializer = ActorMaterializer()
  implicit val config = AppConfig.conf

  val logger = Logging(system, getClass)

  logger.info("Starting Indexer in env {}", AppConfig.env)

  val listener = system.actorOf(Props(classOf[Listener]))
  system.eventStream.subscribe(listener, classOf[DeadLetter])

  val interfaceConfigs = config.getConfig("indexedServices").root().map {
    case (name: String, serviceConfig: ConfigValue) =>
      InterfaceConfig(serviceConfig.asInstanceOf[ConfigObject].toConfig)
  }.toSeq

  // Index erryday 
  //  system.scheduler.schedule(0 millis, 1 days, supervisor, Start(List((ExternalInterfaceType.CKAN, new URL(config.getString("services.dga-api.baseUrl"))))))

  logger.debug("Starting Crawler")
  val indexer = SearchIndexer(new DefaultClientProvider, config)
  val crawler = new Crawler(system, config.getConfig("indexer"), interfaceConfigs, materializer, indexer)

  crawler.crawl() onComplete {
    case Success(_) =>
      logger.info("Successfully completed crawl")
    case Failure(e) =>
      logger.error(e, "Crawl failed")
  }
}

class Listener extends Actor with ActorLogging {
  def receive = {
    case d: DeadLetter => log.debug(d.message.toString())
  }
}