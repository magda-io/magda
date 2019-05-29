package au.csiro.data61.magda.api

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.OK
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.test.util.MagdaMatchers


class DataSetHitCountSearchSpec extends DataSetSearchSpecBase {

  describe("searching") {
    describe("*") {
      it("hitCount should reflect all hits in the system, not just what is returned") {
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
    }
  }
}
