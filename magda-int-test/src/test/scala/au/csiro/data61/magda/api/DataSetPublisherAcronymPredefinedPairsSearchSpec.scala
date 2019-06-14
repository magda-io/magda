package au.csiro.data61.magda.api

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.OK
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.search.SearchStrategy.MatchAll
import au.csiro.data61.magda.test.util.Generators
import org.scalacheck.Gen


class DataSetPublisherAcronymPredefinedPairsSearchSpec extends DataSetSearchSpecBase {

  describe("searching for a dataset publisher's acronym should return that dataset eventually") {
      it("for pre-defined pairs") {
        case class GenResult(acronym: String, datasetWithPublisher: DataSet)

        val pairs = Seq(
          ("Australian Charities and Not-for-profits Commission", "ACNC"),
          ("Department of Foreign Affairs and Trade", "DFAT"),
          ("Department of Industry, Innovation and Science", "DIIS"))

        val cache = scala.collection.mutable.HashMap.empty[String, List[_]]
        val randomDatasets = Gen.listOfN(20, Generators.dataSetGen(cache)).retryUntil(_ => true).sample.get
        val publisherPairs = pairs.map {
          case (fullName, acronym) =>
            val gen = for {
              pair <- Gen.oneOf(pairs)
              randomCaseFullName <- Generators.randomCaseGen(pair._1)
              dataset <- Generators.dataSetGen(scala.collection.mutable.HashMap.empty)
              datasetWithPublisher = dataset.copy(publisher = Some(Agent(name = Some(randomCaseFullName))))
            } yield GenResult(pair._2, datasetWithPublisher)

            gen.retryUntil(_ => true).sample.get
        }
        val publisherDatasets = publisherPairs.map(_.datasetWithPublisher)

        val randomCaseAcronymGen = for {
          pair <- Gen.oneOf(publisherPairs)
          acronym = pair.acronym
          randomCaseAcronym <- Generators.randomCaseGen(acronym)
        } yield GenResult(randomCaseAcronym, pair.datasetWithPublisher)

        val allDatasets = randomDatasets ++ publisherDatasets

        val (indexName, _, routes) = putDataSetsInIndex(allDatasets)
        val indices = FakeIndices(indexName)

        try {
          blockUntilExactCount(allDatasets.size, indexName)

          forAll(randomCaseAcronymGen) {
            case GenResult(randomCaseAcronym, datasetWithPublisher) =>
              Get(s"""/v0/datasets?query=$randomCaseAcronym&limit=${allDatasets.size}""") ~> addSingleTenantIdHeader ~> routes ~> check {
                status shouldBe OK
                val response = responseAs[SearchResult]

                withClue(s"acronym $randomCaseAcronym and dataset publisher ${datasetWithPublisher.publisher}") {
                  response.strategy.get shouldBe MatchAll
                  response.dataSets.size should be > 0
                  response.dataSets.exists(_.identifier == datasetWithPublisher.identifier) shouldBe true
                }
              }
              Get(s"""/v0/datasets?query=$randomCaseAcronym&limit=${allDatasets.size}""") ~> addTenantIdHeader(tenant_1) ~> routes ~> check {
                status shouldBe OK
                val response = responseAs[SearchResult]
                response.hitCount shouldBe 0
              }
          }
        } finally {
          this.deleteIndex(indexName)
        }

        deleteAllIndexes()
      }
    }
}
