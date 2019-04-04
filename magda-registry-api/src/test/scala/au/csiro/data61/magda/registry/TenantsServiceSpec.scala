package au.csiro.data61.magda.registry

import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.ValidationRejection
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
      it("can get all tenants if the request is from magda admin portal") { param =>
        Get("/v0/tenants") ~> addAdminPortalIdHeader ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[List[Tenant]].length shouldEqual 3
        }
      }

      it("can get a tenant if the request is from magda admin portal") { param =>
        Get(s"/v0/tenants/$domain_name_1") ~> addAdminPortalIdHeader ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          responseAs[Tenant].id shouldEqual tenant_1
        }
      }

      it("returns 404 if the given ID does not exist") { param =>
        Get("/v0/tenants/foo") ~> addAdminPortalIdHeader ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.NotFound
          responseAs[BadRequest].message should include("exist")
        }
      }

      it("should reject get all tenants request from non magda admin portal"){ param =>
        Get("/v0/tenants") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          rejection shouldEqual ValidationRejection(s"The operation is not allowed because $tenant_1 is not a magda admin ID.")
        }
      }

      it("should reject get a tenant request from non magda admin portal") { param =>
        Get(s"/v0/tenants/$domain_name_1") ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          rejection shouldEqual ValidationRejection(s"The operation is not allowed because $tenant_1 is not a magda admin ID.")
        }
      }
    }
  }

  def writeTests(role: Role) {
    describe("POST") {
      it("can add a new tenant") { param =>
        val tenant = Tenant(domainName = "web1", id = 0, enabled = true)
        param.asAdmin(Post("/v0/tenants", tenant)) ~> addAdminPortalIdHeader ~> param.api(role).routes ~> check {
          status shouldEqual StatusCodes.OK
          val actualTenant = responseAs[Tenant]
          actualTenant.domainName shouldEqual "web1"
          actualTenant.id shouldEqual 3
          actualTenant.enabled shouldEqual true

          Get("/v0/tenants") ~> addAdminPortalIdHeader ~> param.api(role).routes ~> check {
            status shouldEqual StatusCodes.OK

            val tenants = responseAs[List[Tenant]]
            tenants.length shouldEqual 4
          }
        }
      }

      it("should reject add new tenant request from non magda admin portal") { param =>
        val tenant = Tenant(domainName = "web1", id = 0, enabled = true)
        param.asAdmin(Post("/v0/tenants", tenant)) ~> addTenantIdHeader(tenant_1) ~> param.api(role).routes ~> check {
          rejection shouldEqual ValidationRejection(s"The operation is not allowed because $tenant_1 is not a magda admin ID.")
        }
      }

      checkMustBeAdmin(role) {
        val tenant = Tenant(domainName = "web2", id = 0, enabled = true)
        Post("/v0/tenants", tenant) ~> addAdminPortalIdHeader
      }
    }
  }
}
