
package au.csiro.data61.magda

import akka.actor.{ Actor, ActorLogging, ActorSystem, DeadLetter, Props }
import akka.event.Logging
import akka.http.scaladsl.Http
import akka.stream.ActorMaterializer
import au.csiro.data61.magda.api.Api
import au.csiro.data61.magda.search.elasticsearch.{ DefaultClientProvider, ElasticSearchQueryer }

object MagdaApp extends App {
  implicit val system = ActorSystem()
  implicit val executor = system.dispatcher
  implicit val materializer = ActorMaterializer()
  implicit val config = AppConfig.conf()
  implicit val clientProvider = new DefaultClientProvider

  val logger = Logging(system, getClass)

  logger.info("Starting API in env {} on port {}", AppConfig.getEnv, config.getString("http.port"))

  val listener = system.actorOf(Props(classOf[Listener]))
  system.eventStream.subscribe(listener, classOf[DeadLetter])

  logger.debug("Starting API")
  val searchQueryer = ElasticSearchQueryer.apply
  val api = new Api(logger, searchQueryer)

  Http().bindAndHandle(api.routes, config.getString("http.interface"), config.getInt("http.port"))
}

class Listener extends Actor with ActorLogging {
  def receive = {
    case d: DeadLetter => log.debug(d.message.toString())
  }
}