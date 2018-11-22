package au.csiro.data61.magda.indexer.helpers

import akka.NotUsed
import akka.actor.{ActorRef, ActorSystem, Scheduler}
import akka.event.Logging
import akka.stream.scaladsl.{Keep, Sink, Source}
import akka.stream.{KillSwitches, Materializer, OverflowStrategy}
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

  private val sharedKillSwitch = KillSwitches.shared("my-kill-switch")
  private val (ref, source) = createStreamSource()

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
