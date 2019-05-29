package au.csiro.data61.magda.api

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.ContentTypes.`application/json`
import akka.http.scaladsl.model.StatusCodes.OK
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.Registry.RegistryConverters
import au.csiro.data61.magda.test.util.MagdaMatchers

class TenantDataSetSearchSpec extends BaseSearchApiSpec with RegistryConverters {

  describe("searching") {
    describe("*") {
      it("should return all datasets of the specified tenant") {

        val tenants = List(tenant_1, tenant_2)
        forAll(tenantsIndexGen(tenants)) {
          case (_, dataSets, route) ⇒
            tenants.flatMap( theTenant =>
              Get(s"/v0/datasets?query=*&limit=${dataSets.length}") ~> addTenantIdHeader(theTenant) ~> route ~> check {
                status shouldBe OK
                contentType shouldBe `application/json`
                val response = responseAs[SearchResult]
                val expected = dataSets.filter(_.tenantId == theTenant)
                response.hitCount shouldEqual expected.length
                MagdaMatchers.dataSetsEqualIgnoreOrder(response.dataSets, expected)
              }
            )
        }
      }
    }
  }
}
