package au.csiro.data61.magda.registry

import javax.ws.rs.Path

import akka.actor.{ ActorRef, ActorSystem }
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.stream.Materializer
import akka.http.scaladsl.server.Directives._
import scalikejdbc.DB
import akka.http.scaladsl.model.StatusCodes
import io.swagger.annotations._
import gnieh.diffson.sprayJson._
import spray.json.JsObject
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.directives.AuthDirectives.requireIsAdmin

import scala.util.Failure
import scala.util.Success
import au.csiro.data61.magda.client.AuthApiClient
import com.typesafe.config.Config

@Path("/records/{recordId}/aspects")
@io.swagger.annotations.Api(value = "record aspects", produces = "application/json")
class RecordAspectsServiceRO(system: ActorSystem, materializer: Materializer, config: Config) extends Protocols with SprayJsonSupport {
  private val recordPersistence = DefaultRecordPersistence

  /**
   * @apiGroup Registry Record Aspects
   * @api {get} /v0/registry/records/{recordId}/aspects/{aspectId} Get a record aspect by ID
   *
   * @apiDescription Get a list of all aspects of a record
   * @apiParam (path) {string} recordId ID of the record for which to fetch an aspect
   * @apiParam (path) {string} aspectId ID of the aspect to fetch
   * @apiSuccess (Success 200) {json} Response the aspect detail
   * @apiSuccessExample {json} Response:
   *    {
   *      "format": "text/csv",
   *      "mediaType": "text/csv",
   *      "name": "qcat-outdoor~AIR_TEMP~9.csv",
   *      "downloadURL": "https://data.csiro.au/dap/ws/v2/collections/17914/data/103023",
   *      "licence": "CSIRO Data Licence",
   *      "id": 103023,
   *      "accessURL": "https://data.csiro.au/dap/ws/v2/collections/17914/data"
   *    }
   * @apiUse GenericError
   */
  @Path("/{aspectId}")
  @ApiOperation(value = "Get a record aspect by ID", nickname = "getById", httpMethod = "GET", response = classOf[Aspect])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "recordId", required = true, dataType = "string", paramType = "path", value = "ID of the record for which to fetch an aspect."),
    new ApiImplicitParam(name = "aspectId", required = true, dataType = "string", paramType = "path", value = "ID of the aspect to fetch.")))
  @ApiResponses(Array(
    new ApiResponse(code = 404, message = "No record or aspect exists with the given IDs.", response = classOf[BadRequest])))
  def getById = get {
    path(Segment / "aspects" / Segment) { (recordId: String, aspectId: String) =>
      {
        DB readOnly { session =>
          recordPersistence.getRecordAspectById(session, recordId, aspectId) match {
            case Some(recordAspect) => complete(recordAspect)
            case None               => complete(StatusCodes.NotFound, BadRequest("No record aspect exists with that ID."))
          }
        }
      }
    }
  }

  def route =
      getById
}
