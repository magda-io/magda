package au.csiro.data61.magda.registry

import akka.actor.{ActorRef, ActorSystem}
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.Directives.{as, complete, entity, pathEnd, post}
import akka.http.scaladsl.server.Route
import akka.stream.Materializer
import au.csiro.data61.magda.client.AuthApiClient
import au.csiro.data61.magda.directives.AuthDirectives.requireIsAdmin
import au.csiro.data61.magda.directives.TenantDirectives.requiredTenantId
import au.csiro.data61.magda.model.Registry.{MAGDA_ADMIN_PORTAL_ID, Tenant}
import com.typesafe.config.Config
import io.swagger.annotations._
import javax.ws.rs.Path
import scalikejdbc.DB

import scala.util.{Failure, Success}

@Path("/tenants")
@io.swagger.annotations.Api(value = "tenants", produces = "application/json")
class TenantsService(config: Config, webHookActor: ActorRef, authClient: AuthApiClient,
                     system: ActorSystem, materializer: Materializer,
                     tenantPersistence: TenantPersistence = DefaultTenantPersistence)
  extends Protocols with SprayJsonSupport {
  /**
    * @apiGroup Registry Tenant Service
    * @api {post} /v0/registry/tenants Create a new tenant
    *
    * @apiDescription Create a new tenant
    *
    * @apiParam (body) {json} tenant The definition of the new tenant.
    * @apiParamExample {json} Request-Example
    * {
    *    "id": "bigint",
    *    "domainName": "string"
    * }
    * @apiHeader {string} X-Magda-Session Magda internal session id
    *
    * @apiSuccess (Success 200) {json} Response the tenant created
    * @apiSuccessExample {json} Response:
    *      {
    *          "id": "bigint",
    *          "domainName": "string"
    *      }
    * @apiError (Error 400) {string} Response could not create
    * @apiUse GenericError
    */
  @ApiOperation(value = "Create a new tenant", nickname = "create", httpMethod = "POST", response = classOf[Tenant])
//  @ApiImplicitParams(Array(
//    new ApiImplicitParam(name = "X-Magda-Session", required = true, dataType = "String", paramType = "header", value = "Magda internal session id")))
  @ApiResponses(Array(
    new ApiResponse(code = 400, message = "A tenant already exists with the supplied domainName", response = classOf[BadRequest])))
  def create: Route = post {
    requireIsAdmin(authClient)(system, config) { _ =>
      pathEnd {
        requiredTenantId { tenantId =>
          if ( tenantId == MAGDA_ADMIN_PORTAL_ID) {
            entity(as[Tenant]) { tenant =>
              val theResult = DB localTx { session =>
                tenantPersistence.createTenant(session, tenant) match {
                  case Success(result) => complete(result)
                  case Failure(exception) => complete(StatusCodes.BadRequest, BadRequest(exception.getMessage))
                }
              }
              webHookActor ! WebHookActor.Process(ignoreWaitingForResponse = false, None)
              theResult
            }
          } else {
            complete(StatusCodes.BadRequest, BadRequest(s"Operation not allowed for tenant id of $tenantId."))
          }
        }
      }
    }
  }

  def route: Route =
      create
}
