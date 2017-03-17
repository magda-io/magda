package au.csiro.data61.magda.crawler

import au.csiro.data61.magda.test.api.BaseApiSpec
import au.csiro.data61.magda.crawler.CrawlerApi
import au.csiro.data61.magda.external.InterfaceConfig
import au.csiro.data61.magda.test.util.IndexerGenerators
import au.csiro.data61.magda.test.util.Generators
import org.scalacheck.Gen
import au.csiro.data61.magda.external.ExternalInterface
import scala.concurrent.Future
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchIndexer
import akka.http.scaladsl.model.StatusCodes.Accepted
import au.csiro.data61.magda.search.elasticsearch.DefaultIndices
import scala.concurrent.duration._

class CrawlerApiSpec extends BaseApiSpec {

  it("should do") {
    forAll(Gen.uuid, Gen.listOf(Generators.dataSetGen), IndexerGenerators.interfaceConfGen) { (indexId, dataSets, interfaceConfig) =>
      val interface = new ExternalInterface {
        override def getInterfaceConfig(): InterfaceConfig = interfaceConfig
        override def getDataSets(start: Long = 0, number: Int = 10): Future[List[DataSet]] = Future(dataSets.drop(start.toInt).take(number))
        override def getTotalDataSetCount(): Future[Long] = Future(dataSets.length)
      }
      val externalInterfaces = Seq(interface)
      val crawler = Crawler(externalInterfaces)
      val indices = new FakeIndices(indexId.toString)
      val indexer = new ElasticSearchIndexer(MockClientProvider, indices)
      val crawlerApi = new CrawlerApi(crawler, indexer)

      val routes = crawlerApi.routes

      Post("/reindex") ~> routes ~> check {
        status shouldBe Accepted

        blockUntil("Reindex is finished") { () =>
          val reindexCheck = Get("/reindex") ~> routes ~> runRoute

          val reindexStatus = reindexCheck.entity.toStrict(30 seconds).await.data.decodeString("UTF-8")

          reindexStatus == "true"
        }
      }
    }
  }
}