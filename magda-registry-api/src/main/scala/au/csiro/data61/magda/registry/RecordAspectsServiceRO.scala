package au.csiro.data61.magda.registry

import akka.actor.ActorSystem
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.Directives._
import akka.stream.Materializer
import au.csiro.data61.magda.directives.TenantDirectives.requiresTenantId
import au.csiro.data61.magda.model.Registry._
import com.typesafe.config.Config
import io.swagger.annotations._

import javax.ws.rs.Path
import scalikejdbc.DB
import au.csiro.data61.magda.model.Auth.{UnconditionalTrueDecision}
import au.csiro.data61.magda.registry.Directives.requireRecordPermission

@Path("/records/{recordId}/aspects")
@io.swagger.annotations.Api(
  value = "record aspects",
  produces = "application/json"
)
class RecordAspectsServiceRO(
    authApiClient: RegistryAuthApiClient,
    system: ActorSystem,
    materializer: Materializer,
    config: Config,
    recordPersistence: RecordPersistence
) extends Protocols
    with SprayJsonSupport {

  /**
    * @apiGroup Registry Record Aspects
    * @api {get} /v0/registry/records/{recordId}/aspects/{aspectId} Get a record aspect by ID
    * @apiDescription Get an aspects of a record specified by aspect ID
    * @apiParam (path) {string} recordId ID of the record for which to fetch an aspect
    * @apiParam (path) {string} aspectId ID of the aspect to fetch
    * @apiHeader {string} X-Magda-Session Magda internal session id
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
        name = "X-Magda-Tenant-Id",
        required = true,
        dataType = "number",
        paramType = "header",
        value = "0"
      ),
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
  @ApiResponses(
    Array(
      new ApiResponse(
        code = 404,
        message = "No record or aspect exists with the given IDs.",
        response = classOf[ApiError]
      )
    )
  )
  def getById = get {
    path(Segment / "aspects" / Segment) {
      (recordId: String, aspectId: String) =>
        requiresTenantId { tenantId =>
          requireRecordPermission(
            authApiClient,
            "object/record/read",
            recordId
          ) {
            DB readOnly { implicit session =>
              recordPersistence
                .getRecordAspectById(
                  tenantId,
                  UnconditionalTrueDecision,
                  recordId,
                  aspectId
                ) match {
                case Some(recordAspect) => complete(recordAspect)
                case _ =>
                  complete(
                    StatusCodes.NotFound,
                    ApiError(
                      "No record or aspect exists with the given IDs."
                    )
                  )
              }
            }
          }
        }
    }
  }

  /**
    * @apiGroup Registry Record Aspects
    * @api {get} /v0/registry/records/{recordId}/aspects Get a list of a record's aspects
    * @apiDescription Get a list of a record's aspects
    * @apiParam (path) {string} recordId ID of the record
    * @apiParam (query) {string} keyword Specify the keyword to search in the all aspects' aspectId & data fields.
    *   The two fields will be treated as string during the search.
    * @apiParam (query) {boolean} aspectIdOnly When set to true, will respond only an array contains aspect id only. Default to `false`.
    * @apiParam (query) {number} start The index of the first aspect to retrieve.
    * @apiParam (query) {number} limit The maximum number of aspects to receive.
    * @apiHeader {string} X-Magda-Session Magda internal session id
    * @apiSuccess (Success 200) {json} Response a list of the record's aspects
    * @apiSuccessExample {json} Response with Aspect Data
    *    [{
    *      "id": "aspect-abc",
    *      "data": {
    *        "format": "text/csv",
    *        "mediaType": "text/csv",
    *        "name": "qcat-outdoor~AIR_TEMP~9.csv",
    *        "downloadURL": "https://data.csiro.au/dap/ws/v2/collections/17914/data/103023",
    *        "licence": "CSIRO Data Licence",
    *        "id": 103023,
    *        "accessURL": "https://data.csiro.au/dap/ws/v2/collections/17914/data"
    *      }
    *    }]
    * @apiSuccessExample {json} Response with Aspect ID only
    *    ["aspect-id-1", "aspect-id-2", "aspect-id-3"]
    * @apiUse GenericError
    */
  @Path("/")
  @ApiOperation(
    value = "Get a list of a record's aspects",
    nickname = "getAspects",
    httpMethod = "GET",
    response = classOf[Aspect],
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
        name = "keyword",
        required = false,
        dataType = "string",
        paramType = "query",
        value =
          "Specify the keyword to search in the all aspects' aspectId & data fields."
      ),
      new ApiImplicitParam(
        name = "aspectIdOnly",
        required = false,
        dataType = "boolean",
        paramType = "query",
        value =
          "When set to true, will respond only an array contains aspect id only."
      ),
      new ApiImplicitParam(
        name = "start",
        required = false,
        dataType = "number",
        paramType = "query",
        value = "The index of the first record to retrieve."
      ),
      new ApiImplicitParam(
        name = "limit",
        required = false,
        dataType = "number",
        paramType = "query",
        value = "The maximum number of records to receive."
      ),
      new ApiImplicitParam(
        name = "recordId",
        required = true,
        dataType = "string",
        paramType = "path",
        value = "ID of the record for which to fetch aspects."
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
  @ApiResponses(
    Array(
      new ApiResponse(
        code = 404,
        message = "No record or aspect exists with the given IDs.",
        response = classOf[ApiError]
      )
    )
  )
  def getAspects = get {
    path(Segment / "aspects") { (recordId: String) =>
      parameters(
        'keyword.as[String].?,
        'aspectIdOnly.as[Boolean].?,
        'start.as[Int].?,
        'limit.as[Int].?
      ) { (keyword, aspectIdOnly, start, limit) =>
        requiresTenantId { tenantId =>
          requireRecordPermission(
            authApiClient,
            "object/record/read",
            recordId
          ) {
            complete(DB readOnly { implicit session =>
              recordPersistence
                .getRecordAspects(
                  tenantId,
                  UnconditionalTrueDecision,
                  recordId,
                  keyword,
                  aspectIdOnly,
                  start,
                  limit
                )
            })
          }
        }
      }
    }
  }

  /**
    * @apiGroup Registry Record Aspects
    * @api {get} /v0/registry/records/{recordId}/aspects/count Get the number of aspects that a record has
    * @apiDescription Get the number of aspects that a record has
    * @apiParam (path) {string} recordId ID of the record to count aspects
    * @apiParam (query) {string} keyword Specify the keyword to search in the all aspects' aspectId & data fields.
    *   The two fields will be treated as string during the search.
    * @apiHeader {string} X-Magda-Session Magda internal session id
    * @apiSuccess (Success 200) {json} Response the aspect detail
    * @apiSuccessExample {json} Response:
    *    {
    *      "count": 5
    *    }
    * @apiUse GenericError
    */
  @Path("/count")
  @ApiOperation(
    value = "Get the number of aspects that a record has",
    nickname = "getAspectsCount",
    httpMethod = "GET",
    response = classOf[CountResponse]
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
        name = "recordId",
        required = true,
        dataType = "string",
        paramType = "path",
        value = "ID of the record for which to fetch an aspect."
      ),
      new ApiImplicitParam(
        name = "keyword",
        required = false,
        dataType = "string",
        paramType = "query",
        value =
          "Specify the keyword to search in the all aspects' aspectId & data fields."
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
  @ApiResponses(
    Array(
      new ApiResponse(
        code = 404,
        message = "No record or aspect exists with the given IDs.",
        response = classOf[ApiError]
      )
    )
  )
  def getAspectsCount = get {
    path(Segment / "aspects" / "count") { (recordId: String) =>
      parameters(
        'keyword.as[String].?
      ) { (keyword) =>
        requiresTenantId { tenantId =>
          requireRecordPermission(
            authApiClient,
            "object/record/read",
            recordId
          ) {
            complete(DB readOnly { implicit session =>
              CountResponse(
                recordPersistence
                  .getRecordAspectsCount(
                    tenantId,
                    UnconditionalTrueDecision,
                    recordId,
                    keyword
                  )
              )
            })
          }
        }
      }
    }
  }

  def route =
    getAspects ~
      getAspectsCount ~
      getById
}
