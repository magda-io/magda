package au.csiro.data61.magda.indexer.helpers

import java.time.OffsetDateTime
import java.util.concurrent.atomic.AtomicInteger

import akka.NotUsed
import akka.actor.{ActorSystem, PoisonPill}
import akka.stream.{ActorMaterializer, OverflowStrategy}
import akka.stream.scaladsl.{Sink, Source}
import au.csiro.data61.magda.client.RegistryInterface
import au.csiro.data61.magda.indexer.search.SearchIndexer
import au.csiro.data61.magda.indexer.search.SearchIndexer.IndexResult
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.search.elasticsearch.Indices
import com.typesafe.config.{Config, ConfigFactory}
import org.scalatest.{Assertion, AsyncFlatSpec, BeforeAndAfterEach, Matchers}

import scala.collection.mutable.ListBuffer
import scala.concurrent.{ExecutionContextExecutor, Future, Promise}

class StreamControllerTest extends AsyncFlatSpec with Matchers with BeforeAndAfterEach {

  implicit val system: ActorSystem = ActorSystem("StreamControllerTest")
  implicit val ec: ExecutionContextExecutor = system.dispatcher
  implicit val materializer: ActorMaterializer = ActorMaterializer()
  implicit val config: Config = ConfigFactory.load()

  private var sc: StreamController = None.orNull
  private var dataSets: Seq[DataSet] = Seq()

  override def afterEach(): Unit = {
    super.afterEach()
    sc.getActorRef ! PoisonPill
  }

  class MockRegistryInterface extends RegistryInterface {
    private val nextIndex = new AtomicInteger(0)
    private val dataSetCount = new AtomicInteger(0)

    override def getDataSetsReturnToken(start: Long, size: Int)
    : Future[(Option[String], List[DataSet])] = {
      assert (start == 0)
      nextIndex.set(size)
      val batch = dataSets.slice(start.toInt, size).toList
      dataSetCount.addAndGet(batch.size)
      val token = s"token $size"
      val tokenOption = if (batch.size < size || batch.size == dataSets.size) None else Some(token)
//      println(s"* start: $start, end: $size, batch: ${batch.size}, " +
//        s"fetch: ${dataSetCount.get()}, token: $tokenOption")

      Future.successful(tokenOption, batch)
    }

    override def getDataSetsToken(token: String, size: Int)
    : Future[(Option[String], List[DataSet])] = {
      assert (token.nonEmpty)

      val startIndex = nextIndex.get()
      var endIndex = startIndex + size

      if (endIndex > dataSets.size)
        endIndex = dataSets.size

      nextIndex.set(endIndex)
      val batch = dataSets.slice(startIndex, endIndex).toList
      dataSetCount.addAndGet(batch.size)

      val tokenOption =
        if (startIndex >= dataSets.size ||
          batch.size < size ||
          batch.size == size && endIndex == dataSets.size)
          None
        else
          Some(s"token ${dataSetCount.get()}")

//      println(s"** start: $startIndex, end: $endIndex, batch: ${batch.size}, " +
//        s"fetch: ${dataSetCount.get()}, token: $tokenOption")

      Future.successful(tokenOption, batch)
    }
  }

  class MockIndexer(bufferSize: Int) extends SearchIndexer{
    private val dataSetCount = new AtomicInteger(0)
    private val buffer = new ListBuffer[Promise[Unit]]()
    private val batchProcessingSize = 4

    override def index(source: Source[DataSet, NotUsed]): Future[SearchIndexer.IndexResult] = {
      val indexResults = source.buffer(bufferSize, OverflowStrategy.backpressure)
        .map(dataSet => {
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
      dataSetCount.incrementAndGet()
      buffer.append(promise)

      if (dataSetCount.get() == dataSets.size) {
        // Simulate non-full batch processing
        buffer.toList.foreach(promise => promise.success())
        buffer.clear()
      }
      else if (dataSetCount.get() % batchProcessingSize == 0) {
        // Simulate batch processing
        buffer.toList.foreach(promise => promise.success())
        buffer.clear()
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

  private def createDataSets(num: Int): Seq[DataSet] = {
    val range = 1 to num
    range.foldLeft(Seq[DataSet]()){
      case (acc, e) =>
        acc ++ Seq(
          DataSet(identifier = s"d$e", catalog = Some("c"), quality = 1.0D, score = Some(1.0F)))
    }
  }

  private val bufferSize = 8
  private def run(dataSetNum: Int): Future[Assertion] = {
    dataSets = createDataSets(dataSetNum)
    val mockRegistryInterface = new MockRegistryInterface()
    sc = new StreamController(mockRegistryInterface, bufferSize)
    val source = sc.getSource
    val mockIndexer = new MockIndexer(2)
    val indexResultF: Future[IndexResult] = mockIndexer.index(source)

    sc.start()

    indexResultF.map(indexResult =>
      indexResult shouldEqual IndexResult(dataSets.size, List()))
  }

  "The stream controller" should "support the indexer stream 1" in {
    val numOfDataSets = 10 * bufferSize - 1
    run(numOfDataSets)
  }

  "The stream controller" should "support the indexer stream 2" in {
    val numOfDataSets = 10 * bufferSize
    run(numOfDataSets)
  }

  "The stream controller" should "support the indexer stream 3" in {
    val numOfDataSets = 10 * bufferSize + 1
    run(numOfDataSets)
  }

  "The stream controller" should "support the indexer stream 4" in {
    val numOfDataSets = bufferSize - 1
    run(numOfDataSets)
  }

  "The stream controller" should "support the indexer stream 5" in {
    val numOfDataSets = bufferSize
    run(numOfDataSets)
  }

  "The stream controller" should "support the indexer stream 6" in {
    val numOfDataSets = bufferSize + 1
    run(numOfDataSets)
  }

  "The stream controller" should "support the indexer stream 7" in {
    val numOfDataSets = bufferSize / 2 - 1
    run(numOfDataSets)
  }

  "The stream controller" should "support the indexer stream 8" in {
    val numOfDataSets = bufferSize / 2
    run(numOfDataSets)
  }

  "The stream controller" should "support the indexer stream 9" in {
    val numOfDataSets = bufferSize / 2 + 1
    run(numOfDataSets)
  }

  "The stream controller" should "support the indexer stream 10" in {
    val numOfDataSets = 1
    run(numOfDataSets)
  }
}
