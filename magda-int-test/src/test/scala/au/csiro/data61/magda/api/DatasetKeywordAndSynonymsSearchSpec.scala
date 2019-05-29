package au.csiro.data61.magda.api

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.OK
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.search.SearchStrategy.MatchAll
import au.csiro.data61.magda.test.util.Generators
import org.scalacheck.Gen


class DatasetKeywordAndSynonymsSearchSpec extends DataSetSearchSpecBase {

  describe("searching for a dataset should return that datasets contains the keyword & it's synonyms") {
      it("for synonyms group 300032733 `agile`, `nimble`, `quick` & `spry`") {
        case class GenResult(searchKeyword: String, synonym: String, datasetWithSynonym: DataSet)

        val synonyms = List("agile", "nimble", "quick", "spry")

        val cache = scala.collection.mutable.HashMap.empty[String, List[_]]
        val randomDatasets = Gen.listOfN(20, Generators.dataSetGen(cache)).retryUntil(_ => true).sample.get

        val synonymTestData = synonyms.map {
          case searchKeyword =>
            val gen = for {
              synonym <- Gen.oneOf(synonyms.filter(_ !== searchKeyword))
              dataset <- Generators.dataSetGen(scala.collection.mutable.HashMap.empty)
              datasetWithSynonym = dataset.copy(description = Some(synonym))
            } yield GenResult(searchKeyword, synonym, datasetWithSynonym)
            gen.retryUntil(_ => true).sample.get
        }

        val synonymDataset = synonymTestData.map(_.datasetWithSynonym)

        val searchKeywordGen = for {
          genResult <- Gen.oneOf(synonymTestData)
        } yield genResult

        val allDatasets = randomDatasets ++ synonymDataset

        val (indexName, _, routes) = putDataSetsInIndex(allDatasets)
        val indices = new FakeIndices(indexName)

        try {
          blockUntilExactCount(allDatasets.size, indexName)

          forAll(searchKeywordGen) {
            case GenResult(searchKeyword, synonym, datasetWithSynonym) =>
              Get(s"""/v0/datasets?query=$searchKeyword&limit=${allDatasets.size}""") ~> addSingleTenantIdHeader ~> routes ~> check {
                status shouldBe OK
                val response = responseAs[SearchResult]

                withClue(s"term $searchKeyword and dataset description ${datasetWithSynonym.description}") {
                  response.strategy.get shouldBe MatchAll
                  response.dataSets.size should be > 0
                  response.dataSets.exists(_.identifier == datasetWithSynonym.identifier) shouldBe true
                }
              }
              Get(s"""/v0/datasets?query=$searchKeyword&limit=${allDatasets.size}""") ~> addTenantIdHeader(tenant_1) ~> routes ~> check {
                status shouldBe OK
                val response = responseAs[SearchResult]
                response.hitCount shouldBe 0
              }
          }
        } finally {
          this.deleteIndex(indexName)
        }

      }
    }
}
