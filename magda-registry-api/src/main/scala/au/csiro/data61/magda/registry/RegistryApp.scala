
package au.csiro.data61.magda.registry

import akka.actor.Actor
import akka.actor.ActorLogging
import akka.actor.ActorSystem
import akka.actor.DeadLetter
import akka.actor.Props
import akka.event.Logging
import akka.http.scaladsl.Http
import akka.stream.ActorMaterializer
import au.csiro.data61.magda.AppConfig

object RegistryApp extends App {
  class Listener extends Actor with ActorLogging {
    def receive = {
      case d: DeadLetter => //log.info(d.message)
    }
  }

  implicit val system = ActorSystem()
  implicit val executor = system.dispatcher
  implicit val materializer = ActorMaterializer()
  implicit val config = AppConfig.conf()

  val logger = Logging(system, getClass)

  logger.info("Starting MAGDA! Registry with env {}", AppConfig.getEnv)

  val listener = system.actorOf(Props(classOf[Listener]))
  system.eventStream.subscribe(listener, classOf[DeadLetter])

  val webHookActor = system.actorOf(WebHookActor.props, name = "WebHookActor")

  val api = new Api(webHookActor, config, system, executor, materializer)
  Http().bindAndHandle(api.routes, config.getString("http.interface"), config.getInt("http.port"))
}
