package au.csiro.data61.magda.registry

import javax.ws.rs.Path

import akka.actor.{ActorRef, ActorSystem}
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
import au.csiro.data61.magda.opa.OpaQueryer
import scala.concurrent.{ExecutionContext, Future}
import au.csiro.data61.magda.directives.AuthDirectives.getJwt

@Path("/records/{recordId}/aspects")
@io.swagger.annotations.Api(
  value = "record aspects",
  produces = "application/json"
)
class RecordAspectsServiceRO(
    implicit val system: ActorSystem,
    implicit val materializer: Materializer,
    implicit val config: Config
) extends Protocols
    with SprayJsonSupport {
  private val recordPersistence = DefaultRecordPersistence
  implicit val ec: ExecutionContext = system.dispatcher

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
  @ApiOperation(
    value = "Get a record aspect by ID",
    nickname = "getById",
    httpMethod = "GET",
    response = classOf[Aspect]
  )
  @ApiImplicitParams(
    Array(
      new ApiImplicitParam(
        name = "recordId",
        required = true,
        dataType = "string",
        paramType = "path",
        value = "ID of the record for which to fetch an aspect."
      ),
      new ApiImplicitParam(
        name = "aspectId",
        required = true,
        dataType = "string",
        paramType = "path",
        value = "ID of the aspect to fetch."
      )
    )
  )
  @ApiResponses(
    Array(
      new ApiResponse(
        code = 404,
        message = "No record or aspect exists with the given IDs.",
        response = classOf[BadRequest]
      )
    )
  )
  def getById = get {
    getJwt() { jwt =>
      path(Segment / "aspects" / Segment) {
        (recordId: String, aspectId: String) =>
          {
            val queryer = new RegistryOpaQueryer()

            val policyIds = DB readOnly { session =>
              recordPersistence.getPolicyIds(session, Seq(aspectId), Some(recordId))
            }

            if (policyIds.size > 1) {
              throw new Exception(
                s"Multiple policy ids ($policyIds) found for a single aspect $aspectId on record $recordId"
              )
            }

            val policyId = policyIds.head
            val policyFuture = queryer.queryPolicy(jwt, policyId + ".view")

            onSuccess(policyFuture) { opaResult =>
              DB readOnly { session =>
                recordPersistence
                  .getRecordAspectById(session, recordId, aspectId, opaResult) match {
                  case Some(recordAspect) =>
                    complete(recordAspect)
                  case None =>
                    complete(
                      StatusCodes.NotFound,
                      BadRequest("No record aspect exists with that ID.")
                    )
                }
              }
            }
          }
      }
    }
  }

  def route =
    getById
}
