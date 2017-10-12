
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
import au.csiro.data61.magda.client.AuthApiClient

object RegistryApp extends App {
  class Listener extends Actor with ActorLogging {
    def receive = {
      case d: DeadLetter => //log.info(d.message)
    }
  }

  implicit val config = AppConfig.conf()
  implicit val system = ActorSystem("registry-api", config)
  implicit val executor = system.dispatcher
  implicit val materializer = ActorMaterializer()

  val logger = Logging(system, getClass)

  logger.info("Starting MAGDA Registry")

  val listener = system.actorOf(Props(classOf[Listener]))
  system.eventStream.subscribe(listener, classOf[DeadLetter])

  val webHookActor = system.actorOf(WebHookActor.props(config.getString("http.externalUrl.v0")), name = "WebHookActor")

  val api = new Api(webHookActor, new AuthApiClient(), config, system, executor, materializer)

  val interface = Option(System.getenv("npm_package_config_interface")).orElse(Option(config.getString("http.interface"))).getOrElse("127.0.0.1")
  val port = Option(System.getenv("npm_package_config_port")).map(_.toInt).orElse(Option(config.getInt("http.port"))).getOrElse(6101)

  Http().bindAndHandle(api.routes, interface, port)
}
