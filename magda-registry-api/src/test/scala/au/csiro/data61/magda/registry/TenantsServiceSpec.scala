package au.csiro.data61.magda.registry

import akka.http.scaladsl.model.StatusCodes
import au.csiro.data61.magda.model.Registry._

class TenantsServiceSpec extends ApiSpec {

  describe("with role Full") {
    readOnlyTests(Full)
    writeTests(Full)
  }

  describe("with role ReadOnly") {
    readOnlyTests(ReadOnly)
  }

  routesShouldBeNonExistentWithRole(ReadOnly, List((
    "POST", Post.apply, "/v0/tenants")))

  def readOnlyTests(role: Role) {
    describe("GET") {
      it("starts with three tenants") { param =>
        Get("/v0/tenants") ~> addSingleTenantIdHeader ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[List[Tenant]].length shouldEqual 3
        }
      }

      it("returns 404 if the given ID does not exist") { param =>
        Get("/v0/tenants/foo") ~> addSingleTenantIdHeader ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.NotFound
          responseAs[BadRequest].message should include("exist")
        }
      }
    }
  }

  def writeTests(role: Role) {
    describe("POST") {
      it("can add a new tenant") { param =>
        val tenant = Tenant(domainName = "web1", id = 0, enabled = true)
        param.asAdmin(Post("/v0/tenants", tenant)) ~> addSingleTenantIdHeader ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          val actualTenant = responseAs[Tenant]
          actualTenant.domainName shouldEqual "web1"
          actualTenant.id shouldEqual 3
          actualTenant.enabled shouldEqual true

          Get("/v0/tenants") ~> addSingleTenantIdHeader ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK

            val tenants = responseAs[List[Tenant]]
            tenants.length shouldEqual 4
          }
        }
      }

      checkMustBeAdmin(role) {
        val tenant = Tenant(domainName = "web2", id = 0, enabled = true)
        Post("/v0/tenants", tenant) ~> addSingleTenantIdHeader
      }
    }
  }
}
