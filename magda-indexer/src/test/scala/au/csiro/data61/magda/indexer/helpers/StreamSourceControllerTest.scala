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

  private val sourceBufferSize = 2 * dataSets.size

  override def beforeEach(): Unit = {
    super.beforeEach()
    ssc = new StreamSourceController(sourceBufferSize)
    val (ref, src) = ssc.refAndSource
    actorRef = ref
    source = src
  }

  override def afterEach(): Unit = {
    super.afterEach()
    actorRef ! PoisonPill
  }

  "The stream source controller" should "fill the source after the stream starts" in {
    val actualDataSetsF: Future[Seq[DataSet]] = source.runWith(Sink.seq)
    ssc.fillSource(dataSets)
    ssc.terminate()
    actualDataSetsF.map(actual => actual shouldEqual dataSets)
  }

  it should "fill the source before the stream starts" in {
    ssc.fillSource(dataSets)
    ssc.terminate()
    val actualDataSetsF: Future[Seq[DataSet]] = source.runWith(Sink.seq)
    actualDataSetsF.map(actual => actual shouldEqual dataSets)
  }

  it should "fill the source before and after the stream starts" in {
    ssc.fillSource(dataSets)
    val actualDataSetsF: Future[Seq[DataSet]] = source.runWith(Sink.seq)
    ssc.fillSource(dataSets)
    ssc.terminate()
    actualDataSetsF.map(actual => actual shouldEqual dataSets ++ dataSets)
  }
}
