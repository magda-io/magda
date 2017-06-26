
package au.csiro.data61.magda

import akka.actor.{ Actor, ActorLogging, ActorSystem, DeadLetter, Props }
import akka.event.Logging
import akka.http.scaladsl.Http
import akka.stream.ActorMaterializer
import au.csiro.data61.magda.api.SearchApi
import au.csiro.data61.magda.search.elasticsearch.{ DefaultClientProvider, ElasticSearchQueryer }

object MagdaApp extends App {
  implicit val config = AppConfig.conf()
  implicit val system = ActorSystem("search-api", config)
  implicit val executor = system.dispatcher
  implicit val materializer = ActorMaterializer()
  implicit val clientProvider = new DefaultClientProvider

  implicit val logger = Logging(system, getClass)

  logger.info("Starting API in env {} on port {}", AppConfig.getEnv, config.getString("http.port"))

  val listener = system.actorOf(Props(classOf[Listener]))
  system.eventStream.subscribe(listener, classOf[DeadLetter])

  logger.debug("Starting API")
  val searchQueryer = ElasticSearchQueryer.apply
  val api = new SearchApi(searchQueryer)

  val interface = Option(System.getenv("npm_package_config_interface")).orElse(Option(config.getString("http.interface"))).getOrElse("127.0.0.1")
  val port = Option(System.getenv("npm_package_config_port")).map(_.toInt).orElse(Option(config.getInt("http.port"))).getOrElse(6101)

  Http().bindAndHandle(api.routes, interface, port)
}

class Listener extends Actor with ActorLogging {
  def receive = {
    case d: DeadLetter => log.debug(d.message.toString())
  }
}
