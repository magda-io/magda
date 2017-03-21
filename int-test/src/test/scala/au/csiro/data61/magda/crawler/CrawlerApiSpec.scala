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

class CrawlerApiSpec extends BaseApiSpec with Protocols {

  // When shrinking, shrink the datasets only and put them in a new index.
  implicit def shrinker(implicit s: Shrink[UUID], s1: Shrink[List[(List[DataSet], List[DataSet], InterfaceConfig)]]): Shrink[(UUID, (List[(List[DataSet], List[DataSet], InterfaceConfig)]))] =
    Shrink[(UUID, (List[(List[DataSet], List[DataSet], InterfaceConfig)]))] {
      case (indexId, sources) ⇒
        Shrink.shrink(sources).map { shrunkSources ⇒
          logger.info("Shrinking from {} to {}", sources.length, shrunkSources.length)
          (UUID.randomUUID(), shrunkSources)
        }
    }

  // Gen these as a tuple so that they're shrunk together instead of separately
  val gen = for {
    uuid <- Gen.uuid
    dataSetsInitial <- Generators.listSizeBetween(0, 20, Generators.dataSetGen)
    dataSetsRemaining <- Gen.someOf(dataSetsInitial)
    dataSetsNew <- Generators.listSizeBetween(0, 20, Generators.dataSetGen)
    dataSetsAfter = dataSetsRemaining.toList ++ dataSetsNew
    interfaceConf <- IndexerGenerators.interfaceConfGen
    sources <- Generators.listSizeBetween(0, 5, (dataSetsInitial, dataSetsAfter, interfaceConf)).suchThat { tuples =>
      val interfaceConfs = tuples.map(_._2)
      interfaceConfs.distinct == interfaceConfs
    }
  } yield (uuid, sources)

  it("should correctly store new datasets when reindexed") {

    forAll(gen) {
      case (indexId, sources) =>
        doTest(indexId, sources, true)
        
        Thread.sleep(2000)
        
        doTest(indexId, sources, false)
    }
  }

  def doTest(indexId: UUID, sources: List[(List[DataSet], List[DataSet], InterfaceConfig)], firstIndex: Boolean) = {
    val filteredSources = sources.map {
      case (initialDataSets, afterDataSets, interfaceConfig) =>
        (if (firstIndex) initialDataSets else afterDataSets, interfaceConfig)
    }

    val externalInterfaces = filteredSources.map {
      case (dataSets, interfaceConfig) =>
        new ExternalInterface {
          override def getInterfaceConfig(): InterfaceConfig = interfaceConfig
          override def getDataSets(start: Long = 0, number: Int = 10): Future[List[DataSet]] =
            Future(dataSets.drop(start.toInt).take(number))
          override def getTotalDataSetCount(): Future[Long] = Future(dataSets.length)
        }
    }
    val crawler = Crawler(externalInterfaces)
    val indices = new FakeIndices(indexId.toString)
    val indexer = new ElasticSearchIndexer(MockClientProvider, indices)
    val crawlerApi = new CrawlerApi(crawler, indexer)
    val searchQueryer = new ElasticSearchQueryer(indices)
    val api = new SearchApi(searchQueryer)(config, logger)

    val routes = crawlerApi.routes

    indexer.ready.await

    Post("/reindex") ~> routes ~> check {
      status shouldBe Accepted
    }

    blockUntil("Reindex is finished") { () =>
      val reindexCheck = Get("/reindex/in-progress") ~> routes ~> runRoute

      val reindexStatus = reindexCheck.entity.toStrict(30 seconds).await.data.decodeString("UTF-8")

      reindexStatus == "true"
    }

    // Combine all the datasets but keep what interface they come from
    val allDataSets = filteredSources.flatMap { case (dataSets, interfaceConfig) => dataSets.map((_, interfaceConfig)) }

    Thread.sleep(1000) // Count-intuitively this makes the test go faster because it stops us from hammering ES asking if its done indexing yet.
    
    // it might take a bit longer for ES to finish refreshing its index
    blockUntilCount(allDataSets.size, indexId.toString, indices.getType(Indices.DataSetsIndexType))

    Get(s"/datasets/search?query=*&limit=${allDataSets.size}") ~> api.routes ~> check {
      status shouldBe OK
      val response = responseAs[SearchResult]

      response.dataSets.size should equal(allDataSets.size)

      val bothDataSets = response.dataSets
        .map(resDataSet => (resDataSet, allDataSets.find {
          case (inputDataSet, interfaceConfig) => resDataSet.identifier == inputDataSet.identifier
        }))
        .map {
          case (resDataSet, Some((inputDataSet, interfaceConfig))) => (resDataSet, inputDataSet, interfaceConfig)
          case (resDataSet, _) => withClue(s"${resDataSet.identifier} could not be found in ${allDataSets.map(_._1.identifier)}") {
            fail
          }
        }

      bothDataSets.foreach {
        case (resDataSet, inputDataSet, interfaceConfig) =>
          // Everything except publisher and catalog should be the same between input/output
          def removeDynamicFields(dataSet: DataSet) = dataSet.copy(publisher = None, catalog = "", indexed = None)
          removeDynamicFields(resDataSet) should equal(removeDynamicFields(inputDataSet))

          // The indexer should set the catalog field to the name of the source
          resDataSet.catalog should equal(interfaceConfig.name)

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