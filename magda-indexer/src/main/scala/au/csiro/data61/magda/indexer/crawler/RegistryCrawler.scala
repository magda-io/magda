package au.csiro.data61.magda.indexer.crawler

import akka.NotUsed
import akka.actor.{ActorRef, ActorSystem, PoisonPill}
import akka.event.Logging
import akka.stream.{Materializer, OverflowStrategy, ThrottleMode}
import akka.stream.scaladsl.{Keep, Merge, Sink, Source}
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.indexer.search.SearchIndexer
import com.typesafe.config.Config

import scala.concurrent.Future
import scala.concurrent.duration._
import au.csiro.data61.magda.model.misc.Agent
import java.time.Instant
import java.time.OffsetDateTime
import java.util.concurrent.atomic.{AtomicInteger, AtomicLong}

import au.csiro.data61.magda.util.ErrorHandling
import au.csiro.data61.magda.client.RegistryExternalInterface
import au.csiro.data61.magda.indexer.search.elasticsearch.ElasticSearchIndexer
import org.reactivestreams.Publisher

class RegistryCrawler(interface: RegistryExternalInterface, indexer: SearchIndexer)(implicit val system: ActorSystem, implicit val config: Config, implicit val materializer: Materializer) extends Crawler {
  val log = Logging(system, getClass)
  implicit val ec = system.dispatcher
  implicit val scheduler = system.scheduler

  var lastCrawl: Option[Future[Unit]] = None

  def crawlInProgress: Boolean = lastCrawl.map(!_.isCompleted).getOrElse(false)

  def crawl(): Future[Unit] = {
    if (crawlInProgress) lastCrawl.get
    else {
      lastCrawl = Some(newCrawl())
      lastCrawl.get
    }
  }

  private def newCrawl(): Future[Unit] = {
    val startInstant = OffsetDateTime.now

    log.info("Crawling registry at {}", interface.baseApiPath)

    val interfaceSource = streamForInterface2()

    ElasticSearchIndexer.setRegistryCrawler(this)

    indexer.index(interfaceSource)
      .flatMap { result =>
        log.info("Indexed {} datasets with {} failures", result.successes, result.failures.length)

        val futureOpt = if (result.failures.length == 0) { // does this need to be tunable?
          log.info("Trimming datasets indexed before {}", startInstant)
          Some(indexer.trim(startInstant))
        } else {
          log.warning("Encountered too many failures to trim old datasets")
          None
        }

        futureOpt.map(_.map(_ => result)).getOrElse(Future(result))
      }
      .recover {
        case e: Throwable =>
          log.error(e, "Failed while indexing {}")
          SearchIndexer.IndexResult(0, Seq())
      }
      .map(result => (result.successes, result.failures.length))
      .map {
        case (successCount, failureCount) =>
          if (successCount > 0) {
            if (config.getBoolean("indexer.makeSnapshots")) {
              log.info("Snapshotting...")
              indexer.snapshot()
            }
          } else {
            log.info("Did not successfully index anything, no need to snapshot either.")
          }

          if (failureCount > 0) {
            log.warning("Failed to index {} datasets", failureCount)
          }
      }
      .recover {
        case e: Throwable =>
          log.error(e, "Failed crawl")
      }
  }

  private def tokenCrawl(nextFuture: () => Future[(Option[String], List[DataSet])], batchSize: Int): Source[DataSet, NotUsed] = {
    val onRetry = (retryCount: Int, e: Throwable) => log.error(e, "Failed while fetching from registry, retries left: {}", retryCount + 1)

    val safeFuture = ErrorHandling.retry(nextFuture, 30 seconds, 30, onRetry)
      .recover {
        case e: Throwable =>
          log.error(e, "Failed completely while fetching from registry. This means we can't go any further!!")
          (None, Nil)
      }

    Source.fromFuture(safeFuture).flatMapConcat {
      case (tokenOption, dataSets) =>
        val dataSetSource = Source.fromIterator(() => dataSets.toIterator)

        tokenOption match {
          case Some(token) => dataSetSource.concat(tokenCrawl(() => interface.getDataSetsToken(token, batchSize), batchSize))
          case None        => dataSetSource
        }
    }
  }

  private def streamForInterface(): Source[DataSet, NotUsed] = {
    val firstPageFuture = () => interface.getDataSetsReturnToken(0, 50)

    val crawlSource = tokenCrawl(firstPageFuture, 100)
      .map(dataSet => dataSet.copy(publisher =
        dataSet.publisher))
      .alsoTo(Sink.fold(0) {
        case (count, y) =>
          val newCount = count + 1

          if ((newCount % 1000) == 0) {
            log.info("Crawled {} datasets from registry", newCount)
          }

          newCount
      })

    crawlSource
  }


  private val bufferSize = 1000
  private val crawledCount = new AtomicLong(0)
  private val newCrawlThreshold = 500
  private val (ref, source) = createStreamSource()
  private var tokenOption: Option[String] = None
  private var isCrawling = false

  private def createStreamSource() = {
    val (ref: ActorRef, publisher: Publisher[DataSet]) =
      Source.actorRef[DataSet](bufferSize = bufferSize, OverflowStrategy.fail)
        .toMat(Sink.asPublisher(false))(Keep.both).run()

    val source = Source.fromPublisher(publisher)

    (ref, source)
  }

  private def tokenCrawl2(nextFuture: () => Future[(Option[String], List[DataSet])]): Future[(Option[String], List[DataSet])] = {
    val onRetry = (retryCount: Int, e: Throwable) => log.error(e, "Failed while fetching from registry, retries left: {}", retryCount + 1)

    val safeFuture: Future[(Option[String], List[DataSet])] = ErrorHandling.retry(nextFuture, 30 seconds, 30, onRetry)
      .recover {
        case e: Throwable =>
          log.error(e, "Failed completely while fetching from registry. This means we can't go any further!!")
          (None, Nil)
      }
    safeFuture
  }

  private def fillStreamSource(nextFuture: () => Future[(Option[String], List[DataSet])]) = {

    tokenCrawl2(nextFuture)
      .map(results => {
        tokenOption = results._1
        val dataSets: Seq[DataSet] = results._2
        crawledCount.addAndGet(dataSets.size)
        log.info("Total crawled {} datasets from registry", crawledCount.get())
        dataSets foreach (dataSet => {
          dataSet.copy(publisher = dataSet.publisher)
          ref ! dataSet
        })

        isCrawling = false

        if (tokenOption.isEmpty)
          endSource()
      })
  }

  private def streamForInterface2(): Source[DataSet, NotUsed] = {
    val firstPageFuture = () => interface.getDataSetsReturnToken(0, bufferSize)
    fillStreamSource(firstPageFuture)
    source
  }

  private def endSource(): Unit = {
    log.info("End of crawling.")
    ref ! PoisonPill
  }

  def updateSource(pCount: Int): String = {

    if (pCount % bufferSize == 0) {
      log.info("Total pulled: {}", pCount)
    }

    if (!isCrawling && tokenOption.nonEmpty && pCount >= newCrawlThreshold){
      fillStreamSource(() => interface.getDataSetsToken(tokenOption.get, newCrawlThreshold))
      isCrawling = true
    }

    "Ok"
  }
}
