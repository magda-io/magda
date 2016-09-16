
package au.csiro.data61.magda

import scala.concurrent.ExecutionContextExecutor

import collection.JavaConversions._
import akka.actor.Actor
import akka.actor.ActorLogging
import akka.actor.ActorSystem
import akka.actor.DeadLetter
import akka.actor.Props
import akka.event.Logging
import akka.event.LoggingAdapter
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes._
import akka.http.scaladsl.server.Directives._
import akka.stream.ActorMaterializer
import akka.stream.Materializer
import au.csiro.data61.magda.api.Api
import au.csiro.data61.magda.crawler.Start
import au.csiro.data61.magda.crawler.Supervisor
import au.csiro.data61.magda.external.InterfaceConfig
import com.typesafe.config.ConfigValue
import com.typesafe.config.ConfigObject

object MagdaApp extends App {
  implicit val system = ActorSystem()
  implicit val executor = system.dispatcher
  implicit val materializer = ActorMaterializer()
  implicit val config = Config.conf

  val logger = Logging(system, getClass)

  logger.info("Starting MAGDA Metadata with env {}", Config.env)

  val listener = system.actorOf(Props(classOf[Listener]))
  system.eventStream.subscribe(listener, classOf[DeadLetter])

  val supervisor = system.actorOf(Props(new Supervisor(system, config)))

  config.getConfig("indexedServices").root().foreach {
    case (name: String, serviceConfig: ConfigValue) =>
      supervisor ! Start(List(InterfaceConfig(serviceConfig.asInstanceOf[ConfigObject].toConfig)))
  }

  // Index erryday 
  //  system.scheduler.schedule(0 millis, 1 days, supervisor, Start(List((ExternalInterfaceType.CKAN, new URL(config.getString("services.dga-api.baseUrl"))))))

  val api = new Api()
}

class Listener extends Actor with ActorLogging {
  def receive = {
    case d: DeadLetter => //log.info(d.message)
  }
}