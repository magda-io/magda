
package au.csiro.data61.magda

import akka.actor.{ Actor, ActorLogging, ActorSystem, DeadLetter, Props }
import akka.event.Logging
import akka.stream.ActorMaterializer
import au.csiro.data61.magda.api.Api
import au.csiro.data61.magda.crawler.Supervisor
import au.csiro.data61.magda.external.InterfaceConfig
import au.csiro.data61.magda.spatial.RegionSource
import com.typesafe.config.{ ConfigObject, ConfigValue }

import scala.collection.JavaConversions._

object MagdaApp extends App {
  implicit val system = ActorSystem()
  implicit val executor = system.dispatcher
  implicit val materializer = ActorMaterializer()
  implicit val config = Config.conf

  val logger = Logging(system, getClass)

  logger.info("Starting MAGDA Metadata with env {}", Config.env)

  val listener = system.actorOf(Props(classOf[Listener]))
  system.eventStream.subscribe(listener, classOf[DeadLetter])

  val interfaceConfigs = config.getConfig("indexedServices").root().map {
    case (name: String, serviceConfig: ConfigValue) =>
      InterfaceConfig(serviceConfig.asInstanceOf[ConfigObject].toConfig)
  }.toSeq
  val regionSources = RegionSource.loadFromConfig(config.atKey("regionSources"))

  val supervisor = system.actorOf(Props(new Supervisor(system, config, interfaceConfigs, regionSources)))

  // Index erryday 
  //  system.scheduler.schedule(0 millis, 1 days, supervisor, Start(List((ExternalInterfaceType.CKAN, new URL(config.getString("services.dga-api.baseUrl"))))))

  val api = new Api(regionSources)
}

class Listener extends Actor with ActorLogging {
  def receive = {
    case d: DeadLetter => //log.info(d.message)
  }
}