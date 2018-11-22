package au.csiro.data61.magda.indexer.helpers

import java.time.OffsetDateTime

import akka.NotUsed
import akka.actor.{ActorSystem, PoisonPill}
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.{Sink, Source}
import au.csiro.data61.magda.indexer.search.SearchIndexer
import au.csiro.data61.magda.indexer.search.SearchIndexer.IndexResult
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.search.elasticsearch.Indices
import com.typesafe.config.{Config, ConfigFactory}
import org.scalatest.{AsyncFlatSpec, BeforeAndAfterEach, Matchers}

import scala.collection.mutable.ListBuffer
import scala.concurrent.{ExecutionContextExecutor, Future, Promise}

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

  class MockIndexer(streamController: StreamController) extends SearchIndexer{
    private var dataSetCount = 0
    private val batchSize = 2
    private val buffer = new ListBuffer[Promise[Unit]]()

    override def index(source: Source[DataSet, NotUsed]): Future[SearchIndexer.IndexResult] = {
      streamController.start(batchSize)
      val indexResults = source
        .map(dataSet => {
          println(s"Received: $dataSet")
          (dataSet.uniqueId, index(dataSet))
        })
        .runWith(Sink.fold(Future(SearchIndexer.IndexResult(0, Seq()))) {
          case (combinedResultFuture, (thisResultIdentifier, thisResultFuture)) =>
            combinedResultFuture.flatMap { combinedResult =>
              thisResultFuture.map { _ =>
                combinedResult.copy(successes = combinedResult.successes + 1)
              }.recover {
                case _: Throwable =>
                  combinedResult.copy(failures = combinedResult.failures :+ thisResultIdentifier)
              }
            }
        })

      indexResults.flatMap(identity)
    }

    private def index(dataSet: DataSet, promise: Promise[Unit] = Promise[Unit]): Future[Unit] = {
      dataSetCount += 1
      buffer.append(promise)

      // Simulate batch processing
      if (dataSetCount % batchSize == 0) {
        buffer.toList.foreach(promise => promise.success())
        buffer.clear()
        println("Request next batch")
        streamController.next(batchSize)
      }

      promise.future
    }

    override def delete(identifiers: Seq[String]): Future[Unit] = {
      throw new Exception("delete() not implemented")
    }

    override def snapshot(): Future[Unit] = {
      throw new Exception("snapshot() not implemented")
    }

    override def ready: Future[Unit] = {
      throw new Exception("ready() not implemented")
    }

    override def trim(before: OffsetDateTime): Future[Unit] = {
      throw new Exception("trim() not implemented")
    }

    override def isEmpty(index: Indices.Index): Future[Boolean] = {
      throw new Exception("isEmpty() not implemented")
    }
  }

  "The stream controller" should "control the simple stream flow" in {

    // Create the stream source.
    ssc = new StreamSourceController()
    val (_, source) = ssc.refAndSource

    val mockRegistryInterface = new MockRegistryInterface()
    sc = new StreamController(mockRegistryInterface, ssc)

    // Start the stream.
    val actualDataSetsF: Future[Seq[DataSet]] = source.runWith(Sink.seq)

    // Fill the stream source.
    val initF = sc.start(2)

    // Fill the stream source, usually caused by feedback from the stream Sink.
    val nextF = initF.flatMap(_ => sc.next(2))

    // Fill the stream source, may caused by feedback from the stream Sink.
    // Because tokenOption is None, it will terminate the stream.
    // Do this after some delay to simulate stream processing.
    Thread.sleep(500)
    nextF.map(_ => sc.next( 2))

    nextF.map(tokenOption => tokenOption shouldEqual tokenOption2)

    actualDataSetsF.flatMap(dataSets => dataSets shouldEqual dataSets1 ++ dataSets2)
  }

  "The stream controller" should "support the indexer stream" in {

    // Create the stream source.
    ssc = new StreamSourceController()
    val (_, source) = ssc.refAndSource

    val mockRegistryInterface = new MockRegistryInterface()
    sc = new StreamController(mockRegistryInterface, ssc)
    val mockIndexer = new MockIndexer(sc)

    // Start the stream.
    val indexResultF: Future[SearchIndexer.IndexResult] = mockIndexer.index(source)

    indexResultF.map(indexResult =>
      indexResult shouldEqual IndexResult(dataSets1.size + dataSets2.size, List()))
  }
}
