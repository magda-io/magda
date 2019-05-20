package au.csiro.data61.magda.api

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.ContentTypes.`application/json`
import akka.http.scaladsl.model.StatusCodes.OK
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.search.SearchStrategy.MatchAll
import au.csiro.data61.magda.test.util.Generators.{coordGen, geometryGen, regionGen}
import au.csiro.data61.magda.test.util.{Generators, MagdaMatchers}
import au.csiro.data61.magda.util.MwundoJTSConversions.GeometryConverter
import com.monsanto.labs.mwundo.GeoJson._
import org.locationtech.jts.geom.GeometryFactory
import org.scalacheck.Gen



class DataSetSearchSpec extends DataSetSearchSpecBase {

  override def beforeAll() = {
    println("Testing DataSetSearchSpec")
    super.beforeAll()
  }

  describe("meta") {
    println("Testing meta")
    it("Mwundo <--> JTS conversions should work") {
      println("  - Testing Mwundo <--> JTS conversions should work")
      val geoFactory = new GeometryFactory()
      forAll(regionGen(geometryGen(5, coordGen()))) { regionRaw =>
        val preConversion = regionRaw._2.fields("geometry").convertTo[Geometry]

        val jts = GeometryConverter.toJTSGeo(preConversion, geoFactory)
        val postConversion = GeometryConverter.fromJTSGeo(jts)

        preConversion should equal(postConversion)
      }
    }
  }

  describe("searching") {
    println("Testing searching")
    describe("*") {
      println("  - Testing *")
      it("should return all results") {
        println("    -- Testing should return all results")
        forAll(indexGen) {
          case (_, dataSets, routes) ⇒
            Get(s"/v0/datasets?query=*&limit=${dataSets.length}") ~> addSingleTenantIdHeader ~> routes ~> check {
              status shouldBe OK
              contentType shouldBe `application/json`
              val response = responseAs[SearchResult]

              response.hitCount shouldEqual dataSets.length
              MagdaMatchers.dataSetsEqualIgnoreOrder(response.dataSets, dataSets)
            }
            Get(s"/v0/datasets?query=*&limit=${dataSets.length}") ~> addTenantIdHeader(tenant_1) ~> routes ~> check {
              status shouldBe OK
              val response = responseAs[SearchResult]
              response.hitCount shouldEqual 0
            }
        }
      }

      it("hitCount should reflect all hits in the system, not just what is returned") {
        println("    - Testing hitCount should reflect all hits in the system, not just what is returned")
        forAll(indexGen) {
          case (_, dataSets, routes) ⇒
            Get(s"/v0/datasets?query=*&limit=${dataSets.length / 2}") ~> addSingleTenantIdHeader ~> routes ~> check {
              status shouldBe OK
              val response = responseAs[SearchResult]

              response.hitCount shouldEqual dataSets.length
              MagdaMatchers.dataSetsEqualIgnoreOrder(response.dataSets, dataSets.take(dataSets.length / 2))
            }
            Get(s"/v0/datasets?query=*&limit=${dataSets.length / 2}") ~> addTenantIdHeader(tenant_1) ~> routes ~> check {
              status shouldBe OK
              val response = responseAs[SearchResult]
              response.hitCount shouldEqual 0
            }
        }
      }

      it("should sort results by pure quality") {
        println("    - Testing should sort results by pure quality")
        forAll(indexGen) {
          case (_, dataSets, routes) ⇒
            Get(s"/v0/datasets?query=*&limit=${dataSets.length}") ~> addSingleTenantIdHeader ~> routes ~> check {
              status shouldBe OK
              contentType shouldBe `application/json`
              val response = responseAs[SearchResult]

              response.hitCount shouldEqual dataSets.length
              MagdaMatchers.dataSetsEqual(response.dataSets, sortByQuality(dataSets))
            }
            Get(s"/v0/datasets?query=*&limit=${dataSets.length}") ~> addTenantIdHeader(tenant_1) ~> routes ~> check {
              status shouldBe OK
              val response = responseAs[SearchResult]
              response.hitCount shouldEqual 0
            }
        }
      }
    }

    describe("searching for a dataset should return that datasets contains the keyword & it's synonyms") {
      println("  - Testing searching for a dataset should return that datasets contains the keyword & it's synonyms")
      it("for synonyms group 300032733 `agile`, `nimble`, `quick` & `spry`") {
        println("    - Testing for synonyms group 300032733 `agile`, `nimble`, `quick` & `spry`")
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
      println("  - Testing searching for a dataset publisher's acronym should return that dataset eventually")
      it("for pre-defined pairs") {
        println("    - Testing for pre-defined pairs")
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
        println("    - Testing for auto-generated publishers")
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

  it("for a region in query text should boost results from that region") {
    println("  - Testing for a region in query text should boost results from that region")
    // 3 fake datasets. One that relates to Queensland, the other to all of Australia
    // (but one of those has `queensland` in title otherwise only one document will be matched)
    // The Austrlian one happens to be slightly more "relevant" due to the description, but the
    //  Queensland dataset should be boosted if a user searches for wildlife density in Queensland

    val qldGeometry = Location.fromBoundingBox(Seq(BoundingBox(-20.0, 147.0, -25.0, 139.0)))

    val qldDataset = DataSet(
        identifier="ds-region-in-query-test-1",
        tenantId="0",
        title=Some("Wildlife density in rural areas"),
        description=Some("Wildlife density as measured by the state survey"),
        catalog=Some("region-in-query-test-catalog"),
        spatial=Some(Location(geoJson=qldGeometry)),
        quality = 0.6,
        score = None)
    val nationalDataset1 = DataSet(
      identifier="ds-region-in-query-test-2",
      tenantId="0",
      title=Some("Wildlife density in rural areas"),
      description=Some("Wildlife density aggregated from states' measures of wildlife density."),
      catalog=Some("region-in-query-test-catalog"),
      quality = 0.6,
      score = None)

    val nationalDataset2 = DataSet(
      identifier="ds-region-in-query-test-3",
      tenantId="0",
      title=Some("Wildlife density in rural areas"),
      description=Some("Wildlife density aggregated from states' measures of wildlife density in queensland."),
      catalog=Some("region-in-query-test-catalog"),
      quality = 0.6,
      score = None)

    val datasets = List(nationalDataset1, nationalDataset2, qldDataset)

    val (indexName, _, routes) = putDataSetsInIndex(datasets)
    val indices = new FakeIndices(indexName)

    try {
      blockUntilExactCount(3, indexName)

      // Verify that national dataset is usually more relevant
      Get(s"""/v0/datasets?query=wildlife+density&limit=${datasets.size}""") ~> addSingleTenantIdHeader ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 3
        response.dataSets.head.identifier shouldEqual nationalDataset1.identifier
        response.dataSets(1).identifier shouldEqual nationalDataset2.identifier
        response.dataSets(2).identifier shouldEqual qldDataset.identifier

      }

      Get(s"""/v0/datasets?query=wildlife+density&limit=${datasets.size}""") ~> addTenantIdHeader(tenant_1) ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 0
      }

      Get(s"""/v0/datasets?query=wildlife+density+in+queensland&limit=${datasets.size}""") ~> addSingleTenantIdHeader ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 2
        response.dataSets.head.identifier shouldEqual qldDataset.identifier // Failed
        response.dataSets(1).identifier shouldEqual nationalDataset2.identifier
      }

      Get(s"""/v0/datasets?query=wildlife+density+in+queensland&limit=${datasets.size}""") ~> addTenantIdHeader(tenant_1) ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 0
      }

    } finally {
      this.deleteIndex(indexName)
    }
  }

  it("for a region in query text should boost results from that region by acronym") {
    println("  - Testing for a region in query text should boost results from that region by acronym")
    val saGeometry = Location.fromBoundingBox(Seq(BoundingBox(-27, 134, -30, 130)))

    val saDataset = DataSet(
      identifier="ds-region-in-query-test-1",
      tenantId="0",
      title=Some("Wildlife density in rural areas south"),
      description=Some("Wildlife density as measured by the state survey"),
      catalog=Some("region-in-query-test-catalog"),
      spatial=Some(Location(geoJson=saGeometry)),
      quality = 0.6,
      score = None)
    val nationalDataset1 = DataSet(
      identifier="ds-region-in-query-test-2",
      tenantId="0",
      title=Some("Wildlife density in rural areas south"),
      description=Some("Wildlife density aggregated from states' measures of wildlife density."),
      catalog=Some("region-in-query-test-catalog"),
      quality = 0.6,
      score = None)
    val nationalDataset2 = DataSet(
      identifier="ds-region-in-query-test-3",
      tenantId="0",
      title=Some("Wildlife density in rural areas south"),
      description=Some("Wildlife density aggregated from states' measures of wildlife density in SA."),
      catalog=Some("region-in-query-test-catalog"),
      quality = 0.6,
      score = None)

    val datasets = List(nationalDataset1, nationalDataset2, saDataset)

    val (indexName, _, routes) = putDataSetsInIndex(datasets)
    val indices = new FakeIndices(indexName)

    try {
      blockUntilExactCount(3, indexName)

      // Verify that national dataset is usually more relevant
      Get(s"""/v0/datasets?query=wildlife+density&limit=${datasets.size}""") ~> addSingleTenantIdHeader ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 3
        response.dataSets.head.identifier shouldEqual nationalDataset1.identifier
        response.dataSets(1).identifier shouldEqual nationalDataset2.identifier
        response.dataSets(2).identifier shouldEqual saDataset.identifier

      }

      Get(s"""/v0/datasets?query=wildlife+density+in+SA&limit=${datasets.size}""") ~> addSingleTenantIdHeader ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 2
        response.dataSets.head.identifier shouldEqual saDataset.identifier // Failed
        response.dataSets(1).identifier shouldEqual nationalDataset2.identifier
      }

      Get(s"""/v0/datasets?query=wildlife+density+in+SA&limit=${datasets.size}""") ~> addTenantIdHeader(tenant_1) ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 0
      }

      // Verify that half the name doesn't boost results
      Get(s"""/v0/datasets?query=wildlife+density+south&limit=${datasets.size}""") ~> addSingleTenantIdHeader ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 3
        response.dataSets.head.identifier shouldEqual nationalDataset1.identifier
        response.dataSets(1).identifier shouldEqual nationalDataset2.identifier
        response.dataSets(2).identifier shouldEqual saDataset.identifier

      }

      Get(s"""/v0/datasets?query=wildlife+density+south&limit=${datasets.size}""") ~> addTenantIdHeader(tenant_1) ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 0
      }

    } finally {
      this.deleteIndex(indexName)
    }
  }

  it("for a region in query text should boost results from that region in Alfredton") {
    println("  - Testing for a region in query text should boost results from that region in Alfredton")
    // 3 fake datasets. One that relates to Alfredton, the other to all of Australia
    // (but one of those has `Alfredton` in title otherwise only one document will be matched)
    // The Austrlian one happens to be slightly more "relevant" due to the description, but the
    //  Alfredton dataset should be boosted if a user searches for wildlife density in Alfredton

    val alfGeometry = Location.fromBoundingBox(Seq(BoundingBox(-37.555, 143.81, -37.56, 143.80)))

    val alfDataset = DataSet(
      identifier="ds-region-in-query-test-1",
      tenantId="0",
      title=Some("Wildlife density in rural areas"),
      description=Some("Wildlife density as measured by the state survey"),
      catalog=Some("region-in-query-test-catalog"),
      spatial=Some(Location(geoJson=alfGeometry)),
      quality = 0.6,
      score = None)
    val nationalDataset1 = DataSet(
      identifier="ds-region-in-query-test-2",
      tenantId="0",
      title=Some("Wildlife density in rural areas"),
      description=Some("Wildlife density aggregated from states' measures of wildlife density."),
      catalog=Some("region-in-query-test-catalog"),
      quality = 0.6,
      score = None)
    val nationalDataset2 = DataSet(
      identifier="ds-region-in-query-test-3",
      tenantId="0",
      title=Some("Wildlife density in rural areas"),
      description=Some("Wildlife density aggregated from states' measures of wildlife density in Alfredton."),
      catalog=Some("region-in-query-test-catalog"),
      quality = 0.6,
      score = None)

    val datasets = List(nationalDataset1, nationalDataset2, alfDataset)

    val (indexName, _, routes) = putDataSetsInIndex(datasets)
    val indices = new FakeIndices(indexName)

    try {
      blockUntilExactCount(3, indexName)

      // Verify that national dataset is usually more relevant
      Get(s"""/v0/datasets?query=wildlife+density&limit=${datasets.size}""") ~> addSingleTenantIdHeader ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 3
        response.dataSets.head.identifier shouldEqual nationalDataset1.identifier
        response.dataSets(1).identifier shouldEqual nationalDataset2.identifier
        response.dataSets(2).identifier shouldEqual alfDataset.identifier

      }

      Get(s"""/v0/datasets?query=wildlife+density&limit=${datasets.size}""") ~> addTenantIdHeader(tenant_1) ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 0
      }

      Get(s"""/v0/datasets?query=wildlife+density+in+Alfredton&limit=${datasets.size}""") ~> addSingleTenantIdHeader ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 2
        response.dataSets.head.identifier shouldEqual alfDataset.identifier
        response.dataSets(1).identifier shouldEqual nationalDataset2.identifier
      }

      Get(s"""/v0/datasets?query=wildlife+density+in+Alfredton&limit=${datasets.size}""") ~> addTenantIdHeader(tenant_1) ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 0
      }
    } finally {
      this.deleteIndex(indexName)
    }
  }

}
