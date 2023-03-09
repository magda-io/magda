package au.csiro.data61.magda.registry

import akka.actor.ActorSystem
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.Route
import akka.stream.Materializer
import au.csiro.data61.magda.client.{AuthApiClient, AuthDecisionReqConfig}
import au.csiro.data61.magda.directives.TenantDirectives.requiresTenantId
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.directives.AuthDirectives.withAuthDecision
import com.typesafe.config.Config
import io.swagger.annotations._

import javax.ws.rs.Path
import scalikejdbc._

/**
  * @apiGroup Registry Aspects
  * @api {get} /v0/registry/aspects Get a list of all aspects
  * @apiHeader {string} X-Magda-Session Magda internal session id
  * @apiSuccess (Success 200) {json} Response The aspect definitions.
  * @apiSuccessExample {json} Response:
  *
  *  [
  *    {
  *      "id": "string",
  *      "name": "string",
  *      "jsonSchema": {}
  *    }
  *    ...
  *  ]
  *
  * @apiUse GenericError
  */
@Path("/aspects")
@io.swagger.annotations.Api(
  value = "aspect definitions",
  produces = "application/json"
)
class AspectsServiceRO(
    config: Config,
    authClient: AuthApiClient,
    system: ActorSystem,
    materializer: Materializer
) extends Protocols
    with SprayJsonSupport {

  @ApiOperation(
    value = "Get a list of all aspects",
    nickname = "getAll",
    httpMethod = "GET",
    response = classOf[AspectDefinition],
    responseContainer = "List"
  )
  @ApiImplicitParams(
    Array(
      new ApiImplicitParam(
        name = "X-Magda-Tenant-Id",
        required = true,
        dataType = "number",
        paramType = "header",
        value = "0"
      ),
      new ApiImplicitParam(
        name = "X-Magda-Session",
        required = false,
        dataType = "String",
        paramType = "header",
        value = "Magda internal session id"
      )
    )
  )
  def getAll: Route = get {
    pathEnd {
      withAuthDecision(authClient, AuthDecisionReqConfig("object/aspect/read")) {
        authDecision =>
          requiresTenantId { tenantId =>
            complete {
              DB readOnly { session =>
                AspectPersistence.getAll(tenantId, authDecision)(session)
              }
            }
          }
      }
    }
  }

  /**
    * @apiGroup Registry Aspects
    * @api {get} /v0/registry/aspects/{id} Get an aspect by ID
    *
    * @apiDescription Get an aspect by ID
    *
    * @apiHeader {string} X-Magda-Session Magda internal session id
    * @apiParam (path) {string} id ID of the aspect to be fetched.
    *
    * @apiSuccess (Success 200) {json} Response The details of the aspect.
    * @apiSuccessExample {json} Response:
    *
    *    {
    *      "id": "string",
    *      "name": "string",
    *      "jsonSchema": {}
    *    }
    *
    * @apiUse GenericError
    */
  @Path("/{id}")
  @ApiOperation(
    value = "Get an aspect by ID",
    nickname = "getById",
    httpMethod = "GET",
    response = classOf[AspectDefinition]
  )
  @ApiImplicitParams(
    Array(
      new ApiImplicitParam(
        name = "X-Magda-Tenant-Id",
        required = true,
        dataType = "number",
        paramType = "header",
        value = "0"
      ),
      new ApiImplicitParam(
        name = "id",
        required = true,
        dataType = "string",
        paramType = "path",
        value = "ID of the aspect to be fetched."
      ),
      new ApiImplicitParam(
        name = "X-Magda-Session",
        required = false,
        dataType = "String",
        paramType = "header",
        value = "Magda internal session id"
      )
    )
  )
  def getById: Route = get {
    path(Segment) { id: String =>
      withAuthDecision(authClient, AuthDecisionReqConfig("object/aspect/read")) {
        authDecision =>
          requiresTenantId { tenantId =>
            DB readOnly { session =>
              AspectPersistence
                .getById(id, tenantId, authDecision)(session) match {
                case Some(aspect) => complete(aspect)
                case None =>
                  complete(
                    StatusCodes.NotFound,
                    ApiError("No aspect exists with that ID.")
                  )
              }
            }
          }
      }
    }
  }

  def route: Route =
    getAll ~
      getById
}
