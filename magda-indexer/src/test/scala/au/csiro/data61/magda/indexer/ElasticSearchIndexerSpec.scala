package au.csiro.data61.magda.indexer

import akka.actor.{ActorSystem, Cancellable}
import akka.{NotUsed, pattern}
import akka.stream.{ActorMaterializer, Materializer, OverflowStrategy}
import akka.stream.scaladsl.{Flow, Keep, Sink, Source}
import akka.testkit.{ImplicitSender, TestActors, TestKit, TestProbe}
import akka.pattern.pipe
import akka.stream.testkit.scaladsl.{TestSink, TestSource}
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.indexer.search.SearchIndexer
import au.csiro.data61.magda.indexer.search.elasticsearch.ElasticSearchIndexer
import au.csiro.data61.magda.search.elasticsearch.{DefaultClientProvider, DefaultIndices}
import au.csiro.data61.magda.model.misc.{DataSet, Format, Publisher}
import com.typesafe.config.Config
import org.scalatest.{BeforeAndAfterAll, Matchers, WordSpecLike}

import scala.concurrent.{Await, ExecutionContext, ExecutionContextExecutor, Future}
import scala.concurrent.duration._
import scala.util.Failure

class ElasticSearchIndexerSpec extends TestKit(ActorSystem("ElasticSearchIndexerSpec"))
  with ImplicitSender with WordSpecLike with Matchers with BeforeAndAfterAll {

  implicit val config: Config = AppConfig.conf()
  implicit val ec: ExecutionContextExecutor = system.dispatcher
  implicit val materializer: ActorMaterializer = ActorMaterializer ()

  override def afterAll: Unit = {
    TestKit.shutdownActorSystem(system)
  }

  "ElasticSearchIndexerSpec" must {
    "index" in {
      val dataset = DataSet(identifier="testId", catalog =
        Some("testCatalog"), quality = 1.0, score = Some(1.0f))
      val datasetStream: Source[DataSet, NotUsed] = Source.repeat(dataset)
      val indexer = new ElasticSearchIndexer(new DefaultClientProvider, DefaultIndices)
      indexer.index(datasetStream)
    }
  }
}

