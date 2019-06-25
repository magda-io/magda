package au.csiro.data61.magda.api.longrun

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.OK
import au.csiro.data61.magda.api.DataSetSearchSpecBase
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.test.util.MagdaMatchers

import scala.concurrent.Await


class DataSetHitCountSearchSpec extends DataSetSearchSpecBase {

  describe("searching") {
    describe("*") {
      it("hitCount should reflect all hits in the system, not just what is returned") {
        forAll(indexGen) {
          indexTuple ⇒
            val future = indexTuple._1
            val resultF = future.map(tuple => {
              val dataSets = tuple._2
              val routes = tuple._3
              Get(s"/v0/datasets?query=*&limit=${dataSets.length / 2}") ~> addSingleTenantIdHeader ~> routes ~> check {
                status shouldBe OK
                val response = responseAs[SearchResult]

                response.hitCount shouldEqual dataSets.length
                MagdaMatchers.dataSetsEqualIgnoreOrder(response.dataSets, dataSets.take(dataSets.length / 2))
              }
              Get(s"/v0/datasets?query=*&limit=${dataSets.length / 2}") ~> addTenantIdHeader(tenant1) ~> routes ~> check {
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
