package au.csiro.data61.magda.indexer.helpers

import java.util.concurrent.atomic.AtomicLong

import akka.NotUsed
import akka.actor.{Actor, ActorRef, ActorSystem, Props, Scheduler}
import akka.event.Logging
import akka.stream.Materializer
import akka.stream.scaladsl.Source
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.util.ErrorHandling
import com.typesafe.config.Config

import scala.concurrent.duration._
import scala.concurrent.{ExecutionContext, ExecutionContextExecutor, Future}

trait RegistryInterface {
  def getDataSetsReturnToken(start: Int, size: Int): Future[(Option[String], List[DataSet])]
  def getDataSetsToken(token: String, size: Int): Future[(Option[String], List[DataSet])]
}

class ControllerActor(controller: StreamController) extends Actor {
  implicit val ec: ExecutionContextExecutor = ExecutionContext.global
  def receive: Receive = {
    case "start" =>  controller.start()
    case x => throw new Exception(s"ControllerActor received unknown message s$x")
  }
}

class StreamController(interface: RegistryInterface, bufferSize: Int)
                      (implicit val system: ActorSystem,
                       implicit val config: Config,
                       implicit val materializer: Materializer) {

  implicit val ec: ExecutionContextExecutor = system.dispatcher
  implicit val scheduler: Scheduler = system.scheduler

  val log = Logging(system, getClass)

  private val ssc = new StreamSourceController(bufferSize, this)
  private val (actorRef, source) = ssc.refAndSource
  private val crawledCount = new AtomicLong(0)
  private var tokenOptionF: Future[Option[String]] = Future{None}
  private val theActor = system.actorOf(Props(classOf[ControllerActor], this), "controllerActor")

  private def getDataSets(nextFuture: () => Future[(Option[String], List[DataSet])])
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

  private def fillStreamSource(nextFuture: () => Future[(Option[String], List[DataSet])])
  : Future[Option[String]] = {

    getDataSets(nextFuture)
      .map(results => {
        val tokenOption = results._1
        val dataSets = results._2
        if (dataSets.nonEmpty) {
          crawledCount.addAndGet(dataSets.size)
          log.info("Total crawled {} datasets from registry", crawledCount.get())
          val hasNext = tokenOption.nonEmpty && dataSets.nonEmpty
          ssc.fillSource(dataSets, hasNext)
        }

        tokenOption
      })
  }

  def getSource: Source[DataSet, NotUsed] = {
    source
  }

  def getActorRef: ActorRef = {
    actorRef
  }

  def start(): Future[Option[String]] = {
    val firstPageF = () => interface.getDataSetsReturnToken(0, bufferSize/2)
    tokenOptionF = fillStreamSource(firstPageF)
    tokenOptionF
  }

  def next(nextSize: Int): Future[Option[String]] = {
    tokenOptionF.flatMap(tokenOption => {
      if (tokenOption.isEmpty){
        Future.successful(None)
      }
      else {
        val nextPageF = () => interface.getDataSetsToken(tokenOption.get, bufferSize/2)
        tokenOptionF = fillStreamSource(nextPageF)
        tokenOptionF
      }
    })
  }

  def asActor: ActorRef = {
    theActor
  }

}
