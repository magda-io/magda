package au.csiro.data61.magda.registry

import javax.ws.rs.Path

import akka.actor.ActorSystem
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.stream.Materializer
import akka.http.scaladsl.server.Directives._
import scalikejdbc._
import akka.http.scaladsl.model.StatusCodes
import io.swagger.annotations._
import spray.json._
import gnieh.diffson.sprayJson._
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.directives.AuthDirectives.requireIsAdmin

import scala.util.{ Failure, Success }
import com.typesafe.config.Config
import au.csiro.data61.magda.client.AuthApiClient
import akka.actor.ActorRef

/**
 * @apiGroup Registry Aspects
 * @api {get} /v0/registry/aspects Get a list of all aspects
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
@io.swagger.annotations.Api(value = "aspect definitions", produces = "application/json")
class AspectsServiceRO(config: Config, authClient: AuthApiClient, system: ActorSystem, materializer: Materializer) extends Protocols with SprayJsonSupport {

  @ApiOperation(value = "Get a list of all aspects", nickname = "getAll", httpMethod = "GET", response = classOf[AspectDefinition], responseContainer = "List")
  def getAll = get {
    pathEnd {
      complete {
        DB readOnly { session =>
          AspectPersistence.getAll(session)
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
  @ApiOperation(value = "Get an aspect by ID", nickname = "getById", httpMethod = "GET", response = classOf[AspectDefinition])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "id", required = true, dataType = "string", paramType = "path", value = "ID of the aspect to be fetched.")))
  def getById = get {
    path(Segment) { (id: String) =>
      {
        DB readOnly { session =>
          AspectPersistence.getById(session, id) match {
            case Some(aspect) => complete(aspect)
            case None         => complete(StatusCodes.NotFound, BadRequest("No aspect exists with that ID."))
          }
        }
      }
    }
  }

  def route =
    getAll ~
      getById
}
