package au.csiro.data61.magda.registry

import akka.actor.ActorSystem
import akka.event.Logging
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.Route
import akka.stream.Materializer
import au.csiro.data61.magda.directives.TenantDirectives.requiredTenantId
import au.csiro.data61.magda.model.Registry.{MAGDA_ADMIN_PORTAL_ID, Tenant}
import com.typesafe.config.Config
import io.swagger.annotations._
import javax.ws.rs.Path
import scalikejdbc.DB

import scala.concurrent.ExecutionContext

@Path("/tenants")
@io.swagger.annotations.Api(value = "tenants", produces = "application/json")
class TenantsServiceRO(config: Config, system: ActorSystem, materializer: Materializer, tenantPersistence: TenantPersistence = DefaultTenantPersistence)
  extends Protocols with SprayJsonSupport {

  private val logger = Logging(system, getClass)
  implicit private val ec: ExecutionContext = system.dispatcher


  /**
    * @apiGroup Registry Tenant Service
    * @api {get} /v0/registry/tenants Get all tenants.
    *
    * @apiDescription Get all tenants.
    *
    *
    * @apiSuccess (Success 200) {json} Response all the tenants
    * @apiSuccessExample {json} Response:
    * [
    *   {"domainName":"default","id":0},
    *   {"domainName":"demo1.terria.magda","id":1},
    *   {"domainName":"demo2.terria.magda","id":2}
    * ]
    *
    * @apiUse GenericError
    */
  @ApiOperation(value = "Get all tenants", nickname = "getAll", httpMethod = "GET", response = classOf[Tenant], responseContainer = "List")
  @ApiResponses(Array(
    new ApiResponse(code = 404, message = "Don't know anything about tenants.", response = classOf[BadRequest])))
  def getAll: Route = get {
    pathEnd {
      requiredTenantId { tenantId =>
        if (tenantId == MAGDA_ADMIN_PORTAL_ID) {
          DB readOnly { session =>
            tenantPersistence.getTenants(session) match {
              case tenants: List[Tenant] => complete(tenants)
              case _ => complete(StatusCodes.NotFound, BadRequest("*****Don't know anything about tenants."))
            }
          }
        }
        else {
          complete(StatusCodes.BadRequest, BadRequest(s"Operation not allowed for tenantId of $tenantId."))
        }
      }
    }
  }

  /**
    * @apiGroup Registry Tenant Service
    * @api {get} /v0/registry/tenants/{domainName} Get a tenant ID by its domain name
    *
    * @apiDescription Get a tenant ID by its domain name
    *
    * @apiParam (path) {string} domainName Domain name of the tenant whose ID to be fetched.
    *
    * @apiSuccess (Success 200) {json} Response the tenant ID
    * @apiSuccessExample {json} Response:
    *      {
    *          "tenantId": "string"
    *      }
    * @apiUse GenericError
    */
  @Path("/{domainName}")
  @ApiOperation(value = "Get a tenant by its domain name", nickname = "getByDomainName", httpMethod = "GET",
    response = classOf[Tenant], notes = "Get all info about the tenant.")
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "domainName", required = true, dataType = "string",
      paramType = "path", value = "Domain name of the tenant to be fetched.")))
  @ApiResponses(Array(
    new ApiResponse(code = 404, message = "No tenant exists with that domain name.", response = classOf[BadRequest])))
  def getByDomainName: Route = get {
    path(Segment) { domainName =>
      requiredTenantId { tenantId =>
        if (tenantId == MAGDA_ADMIN_PORTAL_ID) {
          DB readOnly { session =>
            tenantPersistence.getByDomainName(session, domainName) match {
              case Some(tenant) => complete(tenant)
              case None => complete(StatusCodes.NotFound, BadRequest("No tenant exists with that domain name."))
            }
          }
        }
        else {
          complete(StatusCodes.BadRequest, BadRequest(s"Operation not allowed tenantId of $tenantId."))
        }
      }
    }
  }

  def route: Route =
    getAll ~
    getByDomainName
}
