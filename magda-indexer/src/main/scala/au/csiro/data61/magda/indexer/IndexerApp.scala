
package au.csiro.data61.magda.indexer

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
import au.csiro.data61.magda.AppConfig;
import au.csiro.data61.magda.indexer.crawler.Crawler
import au.csiro.data61.magda.indexer.external.InterfaceConfig
import au.csiro.data61.magda.indexer.search.SearchIndexer
import au.csiro.data61.magda.search.elasticsearch.DefaultClientProvider
import au.csiro.data61.magda.search.elasticsearch.DefaultIndices
import au.csiro.data61.magda.indexer.external.ExternalInterface
import au.csiro.data61.magda.indexer.crawler.CrawlerApi
import akka.http.scaladsl.Http
import scala.concurrent.duration._

object IndexerApp extends App {
  implicit val system = ActorSystem()
  implicit val executor = system.dispatcher
  implicit val materializer = ActorMaterializer()
  implicit val config = AppConfig.conf()

  val logger = Logging(system, getClass)

  logger.info("Starting Indexer in env {}", AppConfig.getEnv)
  logger.info("Log level is {}", config.getString("akka.loglevel"))

  val listener = system.actorOf(Props(classOf[Listener]))
  system.eventStream.subscribe(listener, classOf[DeadLetter])

  val interfaceConfigs = InterfaceConfig.all

  logger.debug("Starting Crawler")

  val indexer = SearchIndexer(new DefaultClientProvider, DefaultIndices)
  val crawler = Crawler(interfaceConfigs.values.toSeq.map(ExternalInterface(_)))

  val api = new IndexerApi(crawler, indexer)

  Http().bindAndHandle(api.routes, config.getString("http.interface"), config.getInt("http.port"))
}

class Listener extends Actor with ActorLogging {
  def receive = {
    case d: DeadLetter => log.debug(d.message.toString())
  }
}