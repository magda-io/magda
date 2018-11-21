package au.csiro.data61.magda.indexer.helpers

import java.util.concurrent.atomic.AtomicLong

import akka.NotUsed
import akka.actor.{ActorRef, ActorSystem, PoisonPill, Scheduler}
import akka.event.Logging
import akka.stream.{KillSwitches, Materializer, OverflowStrategy}
import akka.stream.scaladsl.{Keep, Sink, Source}
import au.csiro.data61.magda.client.RegistryExternalInterface
import au.csiro.data61.magda.indexer.search.SearchIndexer
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.util.ErrorHandling
import com.typesafe.config.Config
import org.reactivestreams.Publisher

import scala.concurrent.duration._
import scala.concurrent.{ExecutionContextExecutor, Future}

class StreamSourceController(interface: RegistryExternalInterface, indexer: SearchIndexer)
                            (implicit val system: ActorSystem,
                             implicit val config: Config,
                             implicit val materializer: Materializer) {
  val log = Logging(system, getClass)
  implicit val ec: ExecutionContextExecutor = system.dispatcher
  implicit val scheduler: Scheduler = system.scheduler

  private val bufferSize = 1000
  private val crawledCount = new AtomicLong(0)
  private val newCrawlThreshold = 500
  private val sharedKillSwitch = KillSwitches.shared("my-kill-switch")
  private val (ref, source) = createStreamSource()
  private var tokenOption: Option[String] = None
  private var isCrawling = false


  private def createStreamSource(): (ActorRef, Source[DataSet, NotUsed]) = {
    val (ref: ActorRef, publisher: Publisher[DataSet]) =
      Source.actorRef[DataSet](bufferSize = bufferSize, OverflowStrategy.fail)
        .toMat(Sink.asPublisher(false))(Keep.both).run()

    val source = Source.fromPublisher(publisher)

    val source2: Source[DataSet, NotUsed] = source.via(sharedKillSwitch.flow)

    (ref, source2)
  }

  def terminate(): Unit = {
    sharedKillSwitch.shutdown()
  }

  private def tokenCrawl(nextFuture: () => Future[(Option[String], List[DataSet])]): Future[(Option[String], List[DataSet])] = {
    val onRetry = (retryCount: Int, e: Throwable) => log.error(e, "Failed while fetching from registry, retries left: {}", retryCount + 1)

    val safeFuture: Future[(Option[String], List[DataSet])] = ErrorHandling.retry(nextFuture, 30.seconds, 30, onRetry)
      .recover {
        case e: Throwable =>
          log.error(e, "Failed completely while fetching from registry. This means we can't go any further!!")
          (None, Nil)
      }
    safeFuture
  }

  private def fillStreamSource(nextFuture: () => Future[(Option[String], List[DataSet])]) = {

    tokenCrawl(nextFuture)
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
          terminate()
      })
  }

  def dataSetSource: Source[DataSet, NotUsed] = {
    val firstPageFuture = () => interface.getDataSetsReturnToken(0, bufferSize)
    fillStreamSource(firstPageFuture)
    source
  }

  def refAndSource: (ActorRef, Source[DataSet, NotUsed]) = {
    (ref, source)
  }

  def updateSource(pCount: Int): String = {

    if (pCount % bufferSize == 0 || tokenOption.isEmpty) {
      log.info("Total pulled: {}", pCount)
    }

    if (!isCrawling && tokenOption.nonEmpty && pCount >= newCrawlThreshold){
      fillStreamSource(() => interface.getDataSetsToken(tokenOption.get, newCrawlThreshold))
      isCrawling = true
    }

    "Ok"
  }
}
