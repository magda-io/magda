package au.csiro.data61.magda.indexer.helpers

import java.util.concurrent.atomic.AtomicLong

import akka.actor.{ActorSystem, Scheduler}
import akka.event.Logging
import akka.stream.Materializer
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.util.ErrorHandling
import com.typesafe.config.Config

import scala.concurrent.duration._
import scala.concurrent.{ExecutionContextExecutor, Future}

trait RegistryInterface {
  def getDataSetsReturnToken(start: Int, size: Int): Future[(Option[String], List[DataSet])]
  def getDataSetsToken(token: String, size: Int): Future[(Option[String], List[DataSet])]
}

class StreamController(interface: RegistryInterface, ssc: StreamSourceController)
                      (implicit val system: ActorSystem,
                       implicit val config: Config,
                       implicit val materializer: Materializer) {

  implicit val ec: ExecutionContextExecutor = system.dispatcher
  implicit val scheduler: Scheduler = system.scheduler

  val log = Logging(system, getClass)
  private val crawledCount = new AtomicLong(0)
  private var tokenOption: Option[String] = None

  def getDataSets(nextFuture: () => Future[(Option[String], List[DataSet])])
  : Future[(Option[String], List[DataSet])] = {

    val onRetry = (retryCount: Int, e: Throwable) =>
      log.error(e, "Failed while fetching from registry, retries left: {}", retryCount + 1)

    val safeFuture: Future[(Option[String], List[DataSet])] =
      ErrorHandling.retry(nextFuture, 30.seconds, 30, onRetry)
        .recover {
          case e: Throwable =>
            log.error(e, "Failed completely while fetching from registry. " +
              "This means we can't go any further!!")
            (None, Nil)
        }

    safeFuture
  }

  def fillStreamSource(nextFuture: () => Future[(Option[String], List[DataSet])])
  : Future[Option[String]] = {

    getDataSets(nextFuture)
      .map(results => {
        val tokenOption = results._1
        val dataSets = results._2
        crawledCount.addAndGet(dataSets.size)
        log.info("Total crawled {} datasets from registry", crawledCount.get())
        ssc.fillSource(dataSets)
        tokenOption
      })
  }

  def start(firstPageSize: Int): Future[Option[String]] = {
    val firstPageF = () => interface.getDataSetsReturnToken(0, firstPageSize)
    val tokenOptionF = fillStreamSource(firstPageF)
    tokenOptionF.map(t => {
      tokenOption = t
      tokenOption
    })
  }

  def next(nextSize: Int): Future[Option[String]] = {
    if (tokenOption.isEmpty){
      log.info("No more datasets, terminate the stream.")
      ssc.terminate()
      Future.successful(None)
    }
    else {
      val nextPageF = () => interface.getDataSetsToken(tokenOption.get, nextSize)
      val tokenOptionF = fillStreamSource(nextPageF)
      tokenOptionF.map(t => {
        tokenOption = t
        tokenOption
      })
    }
  }
}
