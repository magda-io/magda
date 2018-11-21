package au.csiro.data61.magda.indexer.helpers

import akka.NotUsed
import akka.actor.{ActorRef, ActorSystem}
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.{Sink, Source}
import akka.testkit.{ImplicitSender, TestKit}
import au.csiro.data61.magda.model.misc.DataSet
import com.typesafe.config.{Config, ConfigFactory}
import org.scalatest._

import scala.concurrent.duration._
import scala.concurrent.{Await, ExecutionContextExecutor, Future}

class StreamSourceControllerTest extends TestKit(ActorSystem("StreamSourceControllerTest"))
  with ImplicitSender with WordSpecLike with Matchers
  with BeforeAndAfterAll with BeforeAndAfterEach {

  implicit val ec: ExecutionContextExecutor = system.dispatcher
  implicit val materializer: ActorMaterializer = ActorMaterializer()
  implicit val config: Config = ConfigFactory.load()

  var ssc: StreamSourceController = None.orNull
  var actorRef: ActorRef = None.orNull
  var source: Source[DataSet, NotUsed] = None.orNull

  val dataSet1 = DataSet(identifier = "d1", catalog = Some("c"), quality = 1.0D, score = Some(1.0F))
  val dataSet2 = DataSet(identifier = "d2", catalog = Some("c"), quality = 1.0D, score = Some(1.0F))
  val dataSet3 = DataSet(identifier = "d3", catalog = Some("c"), quality = 1.0D, score = Some(1.0F))
  val dataSets = dataSet1 :: dataSet2 :: dataSet3 :: Nil

  override def beforeEach(): Unit = {
    super.beforeEach()
    ssc = new StreamSourceController(None.orNull, None.orNull)
    val (actorRef1, source1) = ssc.refAndSource
    actorRef = actorRef1
    source = source1
  }

  "The stream source controller" must {
    "fill source after the stream is alive" in {
      // take(dataSets.size) in order to terminate the stream automatically
      // so that actualDataSetsF can complete.
      val actualDataSetsF: Future[Seq[DataSet]] = source.take(dataSets.size).runWith(Sink.seq)

      // Fill the source.
      dataSets.foreach(dataSet => actorRef ! dataSet)

      val resultF = actualDataSetsF.map(actualDataSets => actualDataSets shouldEqual dataSets)
      Await.result(actualDataSetsF, 10.seconds)
      // Give time for resultF to complete.
      Thread.sleep(500)
      assert(resultF.isCompleted)
    }

    "fill source before the stream is alive" in {
      dataSets.foreach(dataSet => actorRef ! dataSet)
      val actualDataSetsF: Future[Seq[DataSet]] = source.take(dataSets.size).runWith(Sink.seq)
      val resultF = actualDataSetsF.map(actualDataSets => actualDataSets shouldEqual dataSets)
      Await.result(actualDataSetsF, 10.seconds)
      Thread.sleep(500)
      assert(resultF.isCompleted)
    }

    "fill source before and after the stream is alive" in {
      dataSets.foreach(dataSet => actorRef ! dataSet)
      val actualDataSetsF: Future[Seq[DataSet]] = source.take(2*dataSets.size).runWith(Sink.seq)
      dataSets.foreach(dataSet => actorRef ! dataSet)
      val resultF = actualDataSetsF.map(actualDataSets =>
        actualDataSets shouldEqual dataSets :: dataSets)

      Await.result(actualDataSetsF, 10.seconds)
      Thread.sleep(500)
      assert(resultF.isCompleted)
    }

    "be able to terminate the stream explictly" in {
      // Fill the source.
      dataSets.foreach(dataSet => actorRef ! dataSet)

      // Activate the stream.
      val actualDataSetsF: Future[Seq[DataSet]] = source.runWith(Sink.seq)

      // Give time for actualDataSetsF to run.
      Thread.sleep(500)

      val resultF = actualDataSetsF.map(actualDataSets => {
        println(actualDataSets)
        actualDataSets shouldEqual dataSets
      })

      // Terminate the stream so that actualDataSetsF can complete
      ssc.terminate()
      Await.result(actualDataSetsF, 10.seconds)

      // Give time for resultF to run.
      Thread.sleep(500)
      assert(resultF.isCompleted)
    }
  }
}
