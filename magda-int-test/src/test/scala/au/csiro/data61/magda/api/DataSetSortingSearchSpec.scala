package au.csiro.data61.magda.api

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.ContentTypes.`application/json`
import akka.http.scaladsl.model.StatusCodes.OK
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.test.util.MagdaMatchers

import scala.concurrent.Await


class DataSetSortingSearchSpec extends DataSetSearchSpecBase {

  describe("searching") {
    describe("*") {
      it("should sort results by pure quality") {
        forAll(indexGen) {
          indexTuple ⇒
            val resultF = indexTuple._1.map(tuple => {
              val dataSets = tuple._2
              val routes = tuple._3
              Get(s"/v0/datasets?query=*&limit=${dataSets.length}") ~> addSingleTenantIdHeader ~> routes ~> check {
                status shouldBe OK
                contentType shouldBe `application/json`
                val response = responseAs[SearchResult]

                response.hitCount shouldEqual dataSets.length
                MagdaMatchers.dataSetsEqual(response.dataSets, sortByQuality(dataSets))
              }
              Get(s"/v0/datasets?query=*&limit=${dataSets.length}") ~> addTenantIdHeader(tenant1) ~> routes ~> check {
                status shouldBe OK
                val response = responseAs[SearchResult]
                response.hitCount shouldEqual 0
              }
            })
            Await.result(resultF, SINGLE_TEST_WAIT_TIME)
        }
      }
    }
  }
}
