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
import org.scalatest.{Assertion, AsyncFlatSpec, BeforeAndAfterEach, Matchers}

import scala.collection.mutable.ListBuffer
import scala.concurrent.{ExecutionContextExecutor, Future, Promise}

class StreamControllerTest extends AsyncFlatSpec with Matchers with BeforeAndAfterEach {

  implicit val system: ActorSystem = ActorSystem("StreamControllerTest")
  implicit val ec: ExecutionContextExecutor = system.dispatcher
  implicit val materializer: ActorMaterializer = ActorMaterializer()
  implicit val config: Config = ConfigFactory.load()

  private var sc: StreamController = None.orNull
  private val tokenOption1 = Some("token")
  private val tokenOption2 = None
  private val batchSize = 3
  private var dataSets: Seq[DataSet] = Seq()

  override def afterEach(): Unit = {
    super.afterEach()
    val actorRef = sc.getActorRef
    actorRef ! PoisonPill
  }

  class MockRegistryInterface extends RegistryInterface {
    private var callCount = 0
    private var nextIndex = 0

    override def getDataSetsReturnToken(start: Int, size: Int)
    : Future[(Option[String], List[DataSet])] = {
      assert (start == 0)
      callCount += 1
      nextIndex = size
      Future.successful(tokenOption1, dataSets.slice(start, size).toList)
    }

    override def getDataSetsToken(token: String, size: Int)
    : Future[(Option[String], List[DataSet])] = {
      assert (token.nonEmpty)
      callCount += 1
      if (callCount * size < dataSets.size){
        val startIndex = nextIndex
        val endIndex = startIndex + size
        nextIndex = endIndex
        val batch = dataSets.slice(startIndex, endIndex).toList
        val tokenOption = if (startIndex + batchSize < dataSets.size) tokenOption1 else tokenOption2
        Future.successful(tokenOption, batch)
      }
      else {
        Future.successful(tokenOption2, Nil)
      }
    }
  }

  class MockIndexer(streamController: StreamController, batchSize: Int) extends SearchIndexer{
    private var dataSetCount = 0
    private val buffer = new ListBuffer[Promise[Unit]]()

    override def index(source: Source[DataSet, NotUsed]): Future[SearchIndexer.IndexResult] = {
      streamController.start()
      val indexResults = source
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
      dataSetCount += 1
      buffer.append(promise)

      if (dataSetCount % batchSize == 0) {
        // Simulate batch processing
        buffer.toList.foreach(promise => promise.success())
        buffer.clear()
        streamController.next(batchSize)
      }
      else if (dataSetCount == streamController.getTotalDataSetsNum) {
        // Simulate non-full batch processing
        buffer.toList.foreach(promise => promise.success())
        buffer.clear()
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

  private def createDataSets(num: Int): Seq[DataSet] = {
    val range = 1 to num
    range.foldLeft(Seq[DataSet]()){
      case (acc, e) =>
        acc ++ Seq(
          DataSet(identifier = s"d$e", catalog = Some("c"), quality = 1.0D, score = Some(1.0F)))
    }
  }

  private def run(dataSetNum: Int): Future[Assertion] = {
    dataSets = createDataSets(dataSetNum)
    val mockRegistryInterface = new MockRegistryInterface()
    sc = new StreamController(mockRegistryInterface, batchSize)
    val source = sc.getSource
    val mockIndexer = new MockIndexer(sc, batchSize)
    val indexResultF: Future[IndexResult] = mockIndexer.index(source)

    indexResultF.map(indexResult =>
      indexResult shouldEqual IndexResult(dataSets.size, List()))
  }

  "The stream controller" should "support the indexer stream" in {
    run(dataSetNum = 17)
  }

  "The stream controller" should "support the indexer stream again" in {
    run(dataSetNum = 12)
  }
}
