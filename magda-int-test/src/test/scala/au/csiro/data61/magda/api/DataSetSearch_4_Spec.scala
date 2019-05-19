package au.csiro.data61.magda.api

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.OK
import au.csiro.data61.magda.api.model.SearchResult
import org.scalacheck.Gen


class DataSetSearch_4_Spec extends DataSetSearchSpecBase {

  override def beforeAll() = {
    println("Testing DataSetSearch_4_Spec")
    super.beforeAll()
  }

  describe("pagination") {
    println("Testing pagination")
    it("should match the result of getting all datasets and using .drop(start).take(limit) to select a subset") {
      println("  - Testing should match the result of getting all datasets and using .drop(start).take(limit) to select a subset")
      val gen = for {
        (indexName, dataSets, routes) <- indexGen
        dataSetCount = dataSets.size
        start <- Gen.choose(0, dataSetCount)
        limit <- Gen.choose(0, dataSetCount)
      } yield (indexName, dataSets, routes, start, limit)

      forAll(gen) {
        case (indexName, dataSets, routes, start, limit) =>
          whenever(start >= 0 && start <= dataSets.size && limit >= 0 && limit <= dataSets.size) {
            val sortedDataSets =

              Get(s"/v0/datasets?query=*&start=${start}&limit=${limit}") ~> addSingleTenantIdHeader ~> routes ~> check {
                status shouldBe OK
                val result = responseAs[SearchResult]
                val sortedDataSets = sortByQuality(dataSets)

                val expectedResultIdentifiers = sortedDataSets.drop(start).take(limit).map(_.identifier)
                expectedResultIdentifiers shouldEqual result.dataSets.map(_.identifier)
              }
          }
      }
    }
  }
}
