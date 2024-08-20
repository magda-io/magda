package au.csiro.data61.magda.indexer

import akka.Done
import akka.actor.{
  Actor,
  ActorLogging,
  ActorSystem,
  CoordinatedShutdown,
  DeadLetter,
  Props
}
import akka.event.Logging
import akka.stream.ActorMaterializer
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.indexer.search.SearchIndexer
import au.csiro.data61.magda.search.elasticsearch.DefaultClientProvider
import au.csiro.data61.magda.search.elasticsearch.DefaultIndices
import akka.http.scaladsl.Http
import au.csiro.data61.magda.indexer.external.registry.RegisterWebhook.{
  ShouldCrawl,
  ShouldNotCrawl,
  initWebhook
}
import au.csiro.data61.magda.indexer.crawler.RegistryCrawler
import au.csiro.data61.magda.client.{
  AuthApiClient,
  EmbeddingApiClient,
  RegistryExternalInterface
}

import scala.concurrent.Future
import au.csiro.data61.magda.search.elasticsearch.Indices

import scala.concurrent.duration.DurationLong

object IndexerApp extends App {
  implicit val config = AppConfig.conf()
  implicit val system = ActorSystem("indexer", config)
  implicit val executor = system.dispatcher
  implicit val materializer = ActorMaterializer()

  val logger = Logging(system, getClass)

  logger.info("Starting Indexer")
  logger.info("Log level is {}", config.getString("akka.loglevel"))

  val listener = system.actorOf(Props(classOf[Listener]))
  system.eventStream.subscribe(listener, classOf[DeadLetter])

  logger.debug("Starting Crawler")

  val registryInterface = new RegistryExternalInterface()
  val embeddingApiClient = new EmbeddingApiClient()

  val indexer =
    SearchIndexer(new DefaultClientProvider, DefaultIndices, embeddingApiClient)
  val crawler = new RegistryCrawler(registryInterface, indexer)

  val authClient = new AuthApiClient()
  val api = new IndexerApi(crawler, indexer, authClient, registryInterface)

  val bindingFuture = Http()
    .newServerAt(config.getString("http.interface"), config.getInt("http.port"))
    .bind(api.routes)

  logger.info(
    s"Listening on ${config.getString("http.interface")}:${config.getInt("http.port")}"
  )

  logger.info(
    "http.waitBeforeTermination: {}",
    config
      .getDuration("http.waitBeforeTermination")
      .toMillis milliseconds
  )

  logger.info(
    "http.hardTerminationDeadline: {}",
    config
      .getDuration("http.hardTerminationDeadline")
      .toMillis milliseconds
  )

  logger.info(
    "akka.http.server.request-timeout: {}",
    config
      .getDuration("akka.http.server.request-timeout")
      .toMillis milliseconds
  )

  logger.info(
    "akka.http.server.idle-timeout: {}",
    config
      .getDuration("akka.http.server.idle-timeout")
      .toMillis milliseconds
  )

  val shutdown = CoordinatedShutdown(system)
  shutdown.addTask(CoordinatedShutdown.PhaseServiceUnbind, "http-unbind") {
    () =>
      bindingFuture.flatMap(_.unbind()).map(_ => Done)
  }
  shutdown.addTask(
    CoordinatedShutdown.PhaseServiceRequestsDone,
    "http-graceful-termination"
  ) { () =>
    bindingFuture
      .flatMap(
        b =>
          akka.pattern.after(
            config
              .getDuration("http.waitBeforeTermination")
              .toMillis milliseconds,
            system.scheduler
          )(
            b.terminate(
              config
                .getDuration("http.hardTerminationDeadline")
                .toMillis milliseconds
            )
          )
      )
      .map(_ => Done)
  }

  {
    if (config.getBoolean("registry.registerForWebhooks")) {
      initWebhook(registryInterface)
    } else {
      Future(ShouldCrawl)
    }
  } flatMap {
    case ShouldCrawl => Future(ShouldCrawl)
    case ShouldNotCrawl => {
      logger.info("Checking to see if datasets index is empty")
      indexer
        .isEmpty(Indices.DataSetsIndex)
        .map(
          isEmpty =>
            if (isEmpty) {
              logger.info("Datasets index is empty, recrawling")
              ShouldCrawl
            } else {
              logger.info("Datasets index is NOT empty. No need to recrawl.")
              ShouldNotCrawl
            }
        )
    }
  } map {
    case ShouldCrawl => {
      if (config.getBoolean("indexer.allowAutoCrawlOnStartingUp")) {
        crawler.crawl()
      } else {
        logger.info(
          "allowAutoCrawlOnStartingUp is disabled. Auto crawl skipped."
        )
      }
    }
    case _ => // this means we were able to resume a webhook, so all good now :)
  } recover {
    case e: Throwable =>
      logger.error(e, "Error while initializing")

      // This is a super massive problem - might as well just crash to make it super-obvious and to
      // use K8S' restart logic
      logger.error(
        "Failure to register webhook or perform initial crawl is an unrecoverable and drastic error, crashing"
      )
      System.exit(1)
  }
}

class Listener extends Actor with ActorLogging {

  def receive = {
    case d: DeadLetter => log.debug(d.message.toString())
  }
}
