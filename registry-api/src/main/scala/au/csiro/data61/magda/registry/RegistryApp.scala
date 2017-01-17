
package au.csiro.data61.magda.registry

import akka.actor.Actor
import akka.actor.ActorLogging
import akka.actor.ActorSystem
import akka.actor.DeadLetter
import akka.actor.Props
import akka.event.Logging
import akka.stream.ActorMaterializer

object RegistryApp extends App {
  implicit val system = ActorSystem()
  implicit val executor = system.dispatcher
  implicit val materializer = ActorMaterializer()
  implicit val config = Config.conf

  val logger = Logging(system, getClass)

  logger.info("Starting MAGDA Registry with env {}", Config.env)

  val listener = system.actorOf(Props(classOf[Listener]))
  system.eventStream.subscribe(listener, classOf[DeadLetter])

  val api = new Api()
}

class Listener extends Actor with ActorLogging {
  def receive = {
    case d: DeadLetter => //log.info(d.message)
  }
}