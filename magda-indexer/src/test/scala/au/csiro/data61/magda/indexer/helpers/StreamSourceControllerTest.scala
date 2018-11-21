package au.csiro.data61.magda.indexer.helpers

import akka.NotUsed
import akka.actor.{ActorRef, ActorSystem, PoisonPill}
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.{Sink, Source}
import au.csiro.data61.magda.model.misc.DataSet
import com.typesafe.config.{Config, ConfigFactory}
import org.scalatest.{AsyncFlatSpec, _}

import scala.concurrent.{ExecutionContextExecutor, Future}

class StreamSourceControllerTest extends AsyncFlatSpec with Matchers with BeforeAndAfterEach {

  implicit val system: ActorSystem = ActorSystem("StreamSourceControllerTest")
  implicit val ec: ExecutionContextExecutor = system.dispatcher
  implicit val materializer: ActorMaterializer = ActorMaterializer()
  implicit val config: Config = ConfigFactory.load()

  private var ssc: StreamSourceController = None.orNull
  private var actorRef: ActorRef = None.orNull
  private var source: Source[DataSet, NotUsed] = None.orNull

  private val dataSet1 =
    DataSet(identifier = "d1", catalog = Some("c"), quality = 1.0D, score = Some(1.0F))
  private val dataSet2 =
    DataSet(identifier = "d2", catalog = Some("c"), quality = 1.0D, score = Some(1.0F))
  private val dataSet3 =
    DataSet(identifier = "d3", catalog = Some("c"), quality = 1.0D, score = Some(1.0F))

  private val dataSets: Seq[DataSet] = List(dataSet1, dataSet2, dataSet3)

  override def beforeEach(): Unit = {
    super.beforeEach()
    ssc = new StreamSourceController(None.orNull, None.orNull)
    val (ref, src) = ssc.refAndSource
    actorRef = ref
    source = src
  }

  override def afterEach(): Unit = {
    super.afterEach()
    actorRef ! PoisonPill
  }

  "The stream source controller" should "fill the source after the stream starts" in {
    // take(dataSets.size) in order to terminate the stream automatically
    // so that actualDataSetsF can complete.
    val actualDataSetsF: Future[Seq[DataSet]] = source.take(dataSets.size).runWith(Sink.seq)

    // Fill the source.
    dataSets.foreach(dataSet => actorRef ! dataSet)

    actualDataSetsF.map(actual => actual shouldEqual dataSets)
  }

  it should "fill the source before the stream starts" in {
    dataSets.foreach(dataSet => actorRef ! dataSet)
    val actualDataSetsF: Future[Seq[DataSet]] = source.take(dataSets.size).runWith(Sink.seq)
    actualDataSetsF.map(actual => actual shouldEqual dataSets)
  }

  it should "fill the source before and after the stream starts" in {
    dataSets.foreach(dataSet => actorRef ! dataSet)
    val actualDataSetsF: Future[Seq[DataSet]] = source.take(2*dataSets.size).runWith(Sink.seq)
    dataSets.foreach(dataSet => actorRef ! dataSet)
    actualDataSetsF.map(actual => actual shouldEqual dataSets ++ dataSets)
  }

  it should "be able to terminate the stream explicitly" in {
    // Fill the source.
    dataSets.foreach(dataSet => actorRef ! dataSet)

    // Run the stream.
    val actualDataSetsF: Future[Seq[DataSet]] = source.runWith(Sink.seq)

    // Fill more to the source.
    dataSets.foreach(dataSet => actorRef ! dataSet)

    // No more data to fill the source, terminate the stream so that actualDataSetsF can complete.
    // Call terminate() after some delay in order to give some time for actualDataSetsF to run.
    // If calling terminate() without delay, the future may complete before the stream gets a
    // chance to run, resulting in an empty actualDataSetsF.
    Thread.sleep(500)
    ssc.terminate()

    actualDataSetsF.map(actual => actual shouldEqual dataSets ++ dataSets)
  }
}
