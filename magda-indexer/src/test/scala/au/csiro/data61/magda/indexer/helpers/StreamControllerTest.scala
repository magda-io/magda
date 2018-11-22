package au.csiro.data61.magda.indexer.helpers

import akka.actor.{ActorSystem, PoisonPill}
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.Sink
import au.csiro.data61.magda.model.misc.DataSet
import com.typesafe.config.{Config, ConfigFactory}
import org.scalatest.{AsyncFlatSpec, BeforeAndAfterEach, Matchers}

import scala.concurrent.{ExecutionContextExecutor, Future}

class StreamControllerTest extends AsyncFlatSpec with Matchers with BeforeAndAfterEach {

  implicit val system: ActorSystem = ActorSystem("StreamControllerTest")
  implicit val ec: ExecutionContextExecutor = system.dispatcher
  implicit val materializer: ActorMaterializer = ActorMaterializer()
  implicit val config: Config = ConfigFactory.load()

  private var ssc: StreamSourceController = None.orNull
  private var sc: StreamController = None.orNull

  private val tokenOption1 = Some("token1")
  private val dataSet1 =
    DataSet(identifier = "d1", catalog = Some("c"), quality = 1.0D, score = Some(1.0F))
  private val dataSet2 =
    DataSet(identifier = "d2", catalog = Some("c"), quality = 1.0D, score = Some(1.0F))
  private val dataSets1: Seq[DataSet] = List(dataSet1, dataSet2)

  private val tokenOption2 = None
  private val dataSet3 =
    DataSet(identifier = "d3", catalog = Some("c"), quality = 1.0D, score = Some(1.0F))
  private val dataSet4 =
    DataSet(identifier = "d4", catalog = Some("c"), quality = 1.0D, score = Some(1.0F))
  private val dataSets2: Seq[DataSet] = List(dataSet3, dataSet4)

  override def afterEach(): Unit = {
    super.afterEach()
    val (actorRef, _) = ssc.refAndSource
    actorRef ! PoisonPill
  }

  class MockRegistryInterface extends RegistryInterface {
    private var callCount = 0
    override def getDataSetsReturnToken(start: Int, size: Int)
    : Future[(Option[String], List[DataSet])] = {

      callCount += 1
      Future.successful(tokenOption1, dataSets1.toList)
    }

    override def getDataSetsToken(token: String, size: Int)
    : Future[(Option[String], List[DataSet])] = {
      if (callCount == 1){
        callCount += 1
        Future.successful(tokenOption2, dataSets2.toList)
      }
      else {
        callCount += 1
        Future.successful(tokenOption2, Nil)
      }
    }
  }

  "The stream controller" should "control the stream flow" in {

    // Create the stream source.
    ssc = new StreamSourceController()
    val (_, source) = ssc.refAndSource

    val mockRegistryInterface = new MockRegistryInterface()
    sc = new StreamController(mockRegistryInterface, ssc)

    // Start the stream.
    val actualDataSetsF: Future[Seq[DataSet]] = source.runWith(Sink.seq)

    // Fill the stream source.
    val initialTokenOptionF = sc.start(50)
    initialTokenOptionF.map(tokenOption => tokenOption shouldEqual tokenOption1)

    // Fill the stream source, usually caused by feedback from the stream Sink.
    val nextTokenOptionF = initialTokenOptionF.flatMap(tokenOption => {
      sc.next(tokenOption, 50)
    })

    // Fill the stream source, may caused by feedback from the stream Sink.
    // Because tokenOption is None, it will terminate the stream.
    // Do this after some delay to simulate stream processing.
    Thread.sleep(500)
    nextTokenOptionF.map(tokenOption => sc.next(tokenOption, 50))

    nextTokenOptionF.map(tokenOption => tokenOption shouldEqual tokenOption2)

    actualDataSetsF.flatMap(dataSets => dataSets shouldEqual dataSets1 ++ dataSets2)
  }
}
