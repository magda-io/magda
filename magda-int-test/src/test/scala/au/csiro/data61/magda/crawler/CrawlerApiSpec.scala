
package au.csiro.data61.magda.crawler

import au.csiro.data61.magda.test.api.BaseApiSpec
import au.csiro.data61.magda.indexer.external.InterfaceConfig
import au.csiro.data61.magda.indexer.crawler.CrawlerApi;
import au.csiro.data61.magda.test.util.IndexerGenerators
import au.csiro.data61.magda.test.util.Generators
import org.scalacheck.Gen
import scala.concurrent.Future
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.indexer.search.elasticsearch.ElasticSearchIndexer
import akka.http.scaladsl.model.StatusCodes.{ OK, Accepted }
import au.csiro.data61.magda.search.elasticsearch.DefaultIndices
import scala.concurrent.duration._
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchQueryer
import au.csiro.data61.magda.api.SearchApi
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.api.model.Protocols
import au.csiro.data61.magda.api.BaseSearchApiSpec
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import org.scalacheck.Shrink
import akka.http.scaladsl.server.Route
import java.util.UUID
import au.csiro.data61.magda.model.misc.Agent
import au.csiro.data61.magda.search.elasticsearch.Indices
import com.typesafe.config.ConfigFactory
import au.csiro.data61.magda.indexer.crawler.Crawler
import au.csiro.data61.magda.indexer.external.registry.RegistryExternalInterface
import au.csiro.data61.magda.indexer.crawler.RegistryCrawler
import au.csiro.data61.magda.client.HttpFetcher

class CrawlerApiSpec extends BaseApiSpec with Protocols {

  override def buildConfig = ConfigFactory.parseString("indexer.requestThrottleMs=1").withFallback(super.buildConfig)
  implicit val ec = system.dispatcher

  it("should correctly store new datasets when reindexed") {
    // When shrinking, shrink the datasets only and put them in a new index.
    implicit def shrinker2(implicit s: Shrink[List[DataSet]], s3: Shrink[InterfaceConfig]): Shrink[(List[DataSet], List[DataSet], InterfaceConfig)] =
      Shrink[(List[DataSet], List[DataSet], InterfaceConfig)] {
        case (beforeDataSets, afterDataSets, interfaceConfig) ⇒
          logger.warning("Shrinking")
          Shrink.shrink(beforeDataSets).flatMap(shrunkBefore => Shrink.shrink(afterDataSets).map(shrunkAfter => (shrunkBefore, shrunkAfter))).map {
            case (beforeDataSets, afterDataSets) => (beforeDataSets, afterDataSets, interfaceConfig)
          }
      }

    val cachedListCache: scala.collection.mutable.Map[String, List[_]] = scala.collection.mutable.HashMap.empty

    // Gen these as a tuple so that they're shrunk together instead of separately
    val gen = for {
      dataSetsInitial <- Generators.listSizeBetween(0, 20, Generators.dataSetGen(cachedListCache))
      dataSetsRemaining <- Gen.someOf(dataSetsInitial)
      dataSetsNew <- Generators.listSizeBetween(0, 20, Generators.dataSetGen(cachedListCache))
      dataSetsAfter = dataSetsRemaining.toList ++ dataSetsNew
      interfaceConf <- IndexerGenerators.interfaceConfGen
      source = (dataSetsInitial, dataSetsAfter, interfaceConf)
    } yield source

    forAll(gen) {
      case (source) =>
        val indexId = UUID.randomUUID().toString

        doTest(indexId, source, true)
        doTest(indexId, source, false)

        deleteIndex(indexId)
    }

    def doTest(indexId: String, source: (List[DataSet], List[DataSet], InterfaceConfig), firstIndex: Boolean) = {
      val filteredSource = source match {
        case (initialDataSets, afterDataSets, interfaceConfig) =>
          (if (firstIndex) initialDataSets else afterDataSets, interfaceConfig)
      }

      val externalInterface = filteredSource match {
        case (dataSets, interfaceConfig) =>
          val fetcher = HttpFetcher(interfaceConfig.baseUrl)
          new RegistryExternalInterface(fetcher, interfaceConfig) {
            override def getInterfaceConfig(): InterfaceConfig = interfaceConfig
            override def getDataSetsToken(pageToken: String, number: Int): scala.concurrent.Future[(Option[String], List[DataSet])] = {
              if (pageToken.toInt < dataSets.length) {
                Future(Some((pageToken.toInt + number).toString), dataSets.drop(pageToken.toInt).take(Math.min(number, dataSets.length - pageToken.toInt)))
              } else {
                Future(None, Nil)
              }
            }
            override def getDataSetsReturnToken(start: Long = 0, number: Int = 10): Future[(Option[String], List[DataSet])] = {
              Future(Some((start.toInt + number).toString), dataSets.drop(start.toInt).take(number))
            }
            override def getTotalDataSetCount(): Future[Long] = Future(dataSets.length)
          }
      }
      val crawler = new RegistryCrawler(externalInterface)
      val indices = new FakeIndices(indexId.toString)
      val indexer = new ElasticSearchIndexer(MockClientProvider, indices)
      val crawlerApi = new CrawlerApi(crawler, indexer)
      val searchQueryer = new ElasticSearchQueryer(indices)
      val api = new SearchApi(searchQueryer)(config, logger)

      val routes = crawlerApi.routes

      indexer.ready.await(30 seconds)

      blockUntil("Reindex is finished") { () =>
        val reindexCheck = Get("/in-progress") ~> routes ~> runRoute

        val inProgress = reindexCheck.entity.toStrict(30 seconds).await.data.decodeString("UTF-8")

        inProgress == "false"
      }

      // Combine all the datasets but keep what interface they come from
      val allDataSets = filteredSource match { case (dataSets, interfaceConfig) => dataSets.map((_, interfaceConfig)) }

      refresh(indexId)

      try {
        blockUntilExactCount(allDataSets.size, indexId, indices.getType(Indices.DataSetsIndexType))
      } catch {
        case (e: Throwable) =>
          val sizeQuery = search(indexId / indices.getType(Indices.DataSetsIndexType)).size(10000)
          val result = client.execute(sizeQuery).await(60 seconds)
          logger.error("Did not have the right dataset count - this looks like it's a kraken, but it's actually more likely to be an elusive failure in the crawler")
          logger.error(s"Desired dataset count was ${allDataSets.size}, actual dataset count was ${result.totalHits}" +
            s", firstIndex = ${source._1.size}, afterCount = ${source._2.size}")
          logger.error(s"Returned results: ${result.hits}")
          logger.error(s"First index: ${source._1.map(_.normalToString)}")
          logger.error(s"Second index: ${source._2.map(_.normalToString)}")
          throw e
      }

      Get(s"/v0/datasets?query=*&limit=${allDataSets.size}") ~> api.routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]

        response.dataSets.size should equal(allDataSets.size)

        val bothDataSets = response.dataSets
          .map(resDataSet => (resDataSet, allDataSets.find {
            case (inputDataSet, interfaceConfig) => resDataSet.identifier == inputDataSet.identifier
          }))
          .map {
            case (resDataSet, Some((inputDataSet, interfaceConfig))) => (resDataSet, inputDataSet, interfaceConfig)
            case (resDataSet, _) => withClue(s"${resDataSet.identifier} indexed at ${resDataSet.indexed} could not be found in ${allDataSets.map(_._1.identifier)}") {
              fail
            }
          }

        bothDataSets.foreach {
          case (resDataSet, inputDataSet, interfaceConfig) =>
            // Everything except publisher and catalog should be the same between input/output
            def removeDynamicFields(dataSet: DataSet) = dataSet.copy(publisher = None, catalog = None, indexed = None, source = None)
            removeDynamicFields(resDataSet) should equal(removeDynamicFields(inputDataSet))

            // The indexer should set the source field to the name of the source
            resDataSet.source.get should equal(interfaceConfig.name)

            // If publisher is not defined by the dataset, it should be set to the default of the interface if one is
            // present
            if (inputDataSet.publisher.isDefined) {
              resDataSet.publisher should equal(inputDataSet.publisher)
            } else if (interfaceConfig.defaultPublisherName.isDefined) {
              resDataSet.publisher.get should equal(Agent(name = interfaceConfig.defaultPublisherName))
            } else {
              resDataSet.publisher should be(None)
            }
        }
      }
    }
  }

}