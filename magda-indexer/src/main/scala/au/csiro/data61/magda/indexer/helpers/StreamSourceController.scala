package au.csiro.data61.magda.indexer.helpers

import akka.NotUsed
import akka.actor.{ActorRef, ActorSystem, Scheduler}
import akka.event.Logging
import akka.stream._
import akka.stream.impl.Stages.DefaultAttributes
import akka.stream.impl.fusing.GraphStages.SimpleLinearGraphStage
import akka.stream.scaladsl.{Keep, Sink, Source}
import akka.stream.stage.{GraphStageLogic, InHandler, OutHandler}
import au.csiro.data61.magda.model.misc.DataSet
import com.typesafe.config.Config
import org.reactivestreams.Publisher

import scala.concurrent.ExecutionContextExecutor

class StreamSourceController(bufferSize: Int)(implicit val system: ActorSystem,
                                              implicit val config: Config,
                                              implicit val materializer: Materializer) {

  val log = Logging(system, getClass)
  implicit val ec: ExecutionContextExecutor = system.dispatcher
  implicit val scheduler: Scheduler = system.scheduler

  private val (ref, source) = createStreamSource()
  val NO_MORE_DATASETS: String = "Done"

  final case class CheckEnd[Object]() extends SimpleLinearGraphStage[Object] {
    override def initialAttributes: Attributes = DefaultAttributes.take

    override def createLogic(inheritedAttributes: Attributes): GraphStageLogic =
      new GraphStageLogic(shape) with InHandler with OutHandler {
        override def onPush(): Unit = {
          val x = grab(in)
          if (x == NO_MORE_DATASETS)
            completeStage()
          else
            push(out, x)
        }

        override def onPull(): Unit = {
          pull(in)
        }

       setHandlers(in, out, this)
      }

    override def toString: String = "Check"
  }

  private def createStreamSource(): (ActorRef, Source[DataSet, NotUsed]) = {
    val (ref: ActorRef, publisher: Publisher[DataSet]) =
      Source.actorRef[DataSet](bufferSize = bufferSize+1, OverflowStrategy.fail)
        .toMat(Sink.asPublisher(false))(Keep.both).run()

    val source: Source[DataSet, NotUsed] = Source.fromPublisher(publisher)
    val source2: Source[DataSet, NotUsed] = source.via(CheckEnd.apply())
    (ref, source2)
  }

  def terminate(): Unit = {
    ref ! NO_MORE_DATASETS
  }

  def fillSource(dataSets: Seq[DataSet]): Unit = {
    dataSets foreach (dataSet => {
      dataSet.copy(publisher = dataSet.publisher)
      ref ! dataSet
    })
  }

  def refAndSource: (ActorRef, Source[DataSet, NotUsed]) = {
    (ref, source)
  }
}
