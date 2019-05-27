package au.csiro.data61.magda.api

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.OK
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.search.SearchStrategy.MatchAll
import au.csiro.data61.magda.test.util.Generators
import org.scalacheck.Gen


class DataSetSearch_0_Spec extends DataSetSearchSpecBase {

  override def beforeAll() = {
    super.beforeAll()
  }


  describe("searching") {
    describe("searching for a dataset should return that datasets contains the keyword & it's synonyms") {
      it("for synonyms group 300032733 `agile`, `nimble`, `quick` & `spry`") {
        case class GenResult(searchKeyword: String, synonym: String, datasetWithSynonym: DataSet)

        val synonyms = List("agile", "nimble", "quick", "spry")

        val cache = scala.collection.mutable.HashMap.empty[String, List[_]]
        val randomDatasets = Gen.listOfN(20, Generators.dataSetGen(cache)).retryUntil(_ => true).sample.get

        val synonymTestData = synonyms.map {
          case (searchKeyword) =>
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
              Get(s"""/v0/datasets?query=${searchKeyword}&limit=${allDatasets.size}""") ~> addSingleTenantIdHeader ~> routes ~> check {
                status shouldBe OK
                val response = responseAs[SearchResult]

                withClue(s"term $searchKeyword and dataset description ${datasetWithSynonym.description}") {
                  response.strategy.get shouldBe MatchAll
                  response.dataSets.size should be > 0
                  response.dataSets.exists(_.identifier == datasetWithSynonym.identifier) shouldBe true
                }
              }
              Get(s"""/v0/datasets?query=${searchKeyword}&limit=${allDatasets.size}""") ~> addTenantIdHeader(tenant_1) ~> routes ~> check {
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
        val indices = new FakeIndices(indexName)

        try {
          blockUntilExactCount(allDatasets.size, indexName)

          forAll(randomCaseAcronymGen) {
            case GenResult(randomCaseAcronym, datasetWithPublisher) =>
              Get(s"""/v0/datasets?query=${randomCaseAcronym}&limit=${allDatasets.size}""") ~> addSingleTenantIdHeader ~> routes ~> check {
                status shouldBe OK
                val response = responseAs[SearchResult]

                withClue(s"acronym $randomCaseAcronym and dataset publisher ${datasetWithPublisher.publisher}") {
                  response.strategy.get shouldBe MatchAll
                  response.dataSets.size should be > 0
                  response.dataSets.exists(_.identifier == datasetWithPublisher.identifier) shouldBe true
                }
              }
              Get(s"""/v0/datasets?query=${randomCaseAcronym}&limit=${allDatasets.size}""") ~> addTenantIdHeader(tenant_1) ~> routes ~> check {
                status shouldBe OK
                val response = responseAs[SearchResult]
                response.hitCount shouldBe 0
              }
          }
        } finally {
          this.deleteIndex(indexName)
        }
      }

      it("for auto-generated publishers") {
        def dataSetToQuery(dataSet: DataSet) = {
          dataSet.publisher
            .flatMap(d => getAcronymFromPublisherName(d.name))
            .map(acronym => Generators.randomCaseGen(acronym)) match {
              case Some(randomCaseAcronymGen) => randomCaseAcronymGen.flatMap(acronym => Query(freeText = Some(acronym)))
              case None                       => Gen.const(Query())
            }
        }

        doDataSetFilterTest(dataSetToQuery) { (query, response, dataSet) =>
          whenever(query != Query()) {

            withClue(s"query ${query.freeText} and dataSet publisher ${dataSet.publisher.flatMap(_.name)}") {
              response.strategy.get should be(MatchAll)
              response.dataSets.isEmpty should be(false)
              response.dataSets.exists(_.identifier == dataSet.identifier) should be(true)
            }
          }
        }
      }
    }
  }
}
