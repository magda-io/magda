package au.csiro.data61.magda.indexer.helpers

import akka.NotUsed
import akka.actor.{ActorRef, ActorSystem, PoisonPill}
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.{Sink, Source}
import au.csiro.data61.magda.model.misc.DataSet
import com.typesafe.config.{Config, ConfigFactory}
import org.scalatest.{AsyncFlatSpec, FlatSpec,  _}

import scala.concurrent.{ExecutionContextExecutor, Future}

import org.scalatest.concurrent.ScalaFutures._
import scala.concurrent.duration._

class StreamSourceControllerTest extends FlatSpec with Matchers with BeforeAndAfterEach {

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

  private val sourceBufferSize = dataSets.size * 2

  implicit val patienceConfig = PatienceConfig(120.second)

  override def beforeEach(): Unit = {
    super.beforeEach()
    ssc = new StreamSourceController(sourceBufferSize, None.orNull)
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
    ssc.fillSource(dataSets, false, true)

    actualDataSetsF.map(actual => actual shouldEqual dataSets)

    whenReady(actualDataSetsF)(identity)
  }

  it should "fill the source before the stream starts" in {
    ssc.fillSource(dataSets, false, true)
    val actualDataSetsF: Future[Seq[DataSet]] = source.runWith(Sink.seq)
    actualDataSetsF.map(actual => actual shouldEqual dataSets)

    whenReady(actualDataSetsF)(identity)
  }

  it should "fill the source before and after the stream starts" in {
    ssc.fillSource(dataSets, true, true)
    val actualDataSetsF: Future[Seq[DataSet]] = source.runWith(Sink.seq)
    ssc.fillSource(dataSets, false, false)
    actualDataSetsF.map(actual => actual shouldEqual dataSets ++ dataSets)

    whenReady(actualDataSetsF)(identity)
  }
}