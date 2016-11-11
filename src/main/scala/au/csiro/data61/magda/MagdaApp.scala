
package au.csiro.data61.magda

import akka.actor.{ Actor, ActorLogging, ActorSystem, DeadLetter, Props }
import akka.event.Logging
import akka.stream.ActorMaterializer
import au.csiro.data61.magda.api.Api
import au.csiro.data61.magda.crawler.CrawlSupervisor
import au.csiro.data61.magda.external.InterfaceConfig
import au.csiro.data61.magda.spatial.RegionSource
import com.typesafe.config.{ ConfigObject, ConfigValue }

import scala.collection.JavaConversions._

object MagdaApp extends App {
  implicit val system = ActorSystem()
  implicit val executor = system.dispatcher
  implicit val materializer = ActorMaterializer()
  implicit val config = AppConfig.conf

  val logger = Logging(system, getClass)

  val role = Option(sys.env("MAGDA_SEARCH_ROLE")).getOrElse("both")

  logger.info("Starting MAGDA Metadata with role {} in env {}", role, AppConfig.env)

  val listener = system.actorOf(Props(classOf[Listener]))
  system.eventStream.subscribe(listener, classOf[DeadLetter])

  val interfaceConfigs = config.getConfig("indexedServices").root().map {
    case (name: String, serviceConfig: ConfigValue) =>
      InterfaceConfig(serviceConfig.asInstanceOf[ConfigObject].toConfig)
  }.toSeq

  role match {
    case "api"     => startApi()
    case "indexer" => startCrawl()
    case "both" =>
      startCrawl()
      startApi()
  }

  // Index erryday 
  //  system.scheduler.schedule(0 millis, 1 days, supervisor, Start(List((ExternalInterfaceType.CKAN, new URL(config.getString("services.dga-api.baseUrl"))))))

  def startApi() = {
    logger.debug("Starting API")
    new Api()
  }
  def startCrawl() = {
    logger.debug("Starting Crawler")
    system.actorOf(Props(new CrawlSupervisor(system, config, interfaceConfigs)))
  }
}

class Listener extends Actor with ActorLogging {
  def receive = {
    case d: DeadLetter => log.debug(d.message.toString())
  }
}