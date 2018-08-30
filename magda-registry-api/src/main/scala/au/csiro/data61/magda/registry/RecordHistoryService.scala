package au.csiro.data61.magda.registry

import akka.actor.ActorSystem
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.Directives._
import akka.stream.Materializer
import akka.stream.scaladsl.Sink
import au.csiro.data61.magda.model.Registry._
import io.swagger.annotations._
import javax.ws.rs.Path
import scala.concurrent.Await
import scala.concurrent.duration._
import scalikejdbc.DB

/**
  * @apiGroup Registry Record History
  * @api {get} /v0/registry/records/{recordId}/history/{eventId} Get the version of a record that existed after a given event was applied
  *
  * @apiDescription Get the version of a record that existed after a given event was applied
  * @apiParam (path) {string} recordId ID of the record to fetch.
  * @apiParam (path) {string} eventId The ID of the last event to be applied to the record. The event with this ID need not actually apply to the record, in which case that last event prior to this even that does apply will be used.
  *
  * @apiSuccess (Success 200) {json} Response the record detail
  * @apiSuccessExample {json} Response:
  *  {
  *      "id": "string",
  *      "name": "string",
  *      "aspects": {},
  *      "sourceTag": "string"
  *  }
  * @apiUse GenericError
  */
@Path("/records/{recordId}/history")
@io.swagger.annotations.Api(value = "record history", produces = "application/json")
class RecordHistoryService(system: ActorSystem, materializer: Materializer) extends Protocols with SprayJsonSupport {
  val recordPersistence = DefaultRecordPersistence

  @ApiOperation(value = "Get a list of all events affecting this record", nickname = "history", httpMethod = "GET", response = classOf[EventsPage])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "recordId", required = true, dataType = "string", paramType = "path", value = "ID of the record for which to fetch history.")
  ))
  def history = get { path(Segment / "history") { id => { parameters('pageToken.as[Long].?, 'start.as[Int].?, 'limit.as[Int].?) { (pageToken, start, limit) =>
    complete {
      DB readOnly { session =>
        EventPersistence.getEvents(session, recordId = Some(id), pageToken = pageToken, start = start, limit = limit)
      }
    }
  } } } }

  /**
    * @apiGroup Registry Record History
    * @api {get} /v0/registry/records/{recordId}/history Get a list of all events affecting this record
    *
    * @apiDescription Get a list of all aspects of a record
    * @apiParam (path) {string} recordId ID of the record to fetch.
    *
    * @apiSuccess (Success 200) {json} Response the event list
    * @apiSuccessExample {json} Response:
    *  {
    *    "hasMore": true,
    *    "nextPageToken": "string",
    *    "events": [
    *        {
    *            "id": {},
    *            "eventTime": "2018-08-29T07:45:48.011Z",
    *            "eventType": "CreateRecord",
    *            "userId": 0,
    *            "data": {
    *                "fields": {
    *                  "additionalProp1": {},
    *                  "additionalProp2": {},
    *                  "additionalProp3": {}
    *                }
    *            }
    *        }
    *    ]
    *  }
    * @apiUse GenericError
    */
  @Path("/{eventId}")
  @ApiOperation(value = "Get the version of a record that existed after a given event was applied", nickname = "version", httpMethod = "GET", response = classOf[Record])
  @ApiImplicitParams(Array(
    new ApiImplicitParam(name = "recordId", required = true, dataType = "string", paramType = "path", value = "ID of the record to fetch."),
    new ApiImplicitParam(name = "eventId", required = true, dataType = "string", paramType = "path", value = "The ID of the last event to be applied to the record.  The event with this ID need not actually apply to the record, in which case that last event prior to this even that does apply will be used.")
  ))
  @ApiResponses(Array(
    new ApiResponse(code = 404, message = "No record exists with the given ID, it does not have a CreateRecord event, or it has been deleted.", response = classOf[BadRequest])
  ))
  def version = get { path(Segment / "history" / Segment) { (id, version) => { parameters('aspect.*, 'optionalAspect.*) { (aspects: Iterable[String], optionalAspects: Iterable[String]) =>
    DB readOnly { session =>
      val events = EventPersistence.streamEventsUpTo(version.toLong, recordId = Some(id))
      val recordSource = recordPersistence.reconstructRecordFromEvents(id, events, aspects, optionalAspects)
      val sink = Sink.head[Option[Record]]
      val future = recordSource.runWith(sink)(materializer)
      Await.result[Option[Record]](future, 5 seconds) match {
        case Some(record) => complete(record)
        case None => complete(StatusCodes.NotFound, BadRequest("No record exists with that ID, it does not have a CreateRecord event, or it has been deleted."))
      }
    }
  } } } }

  val route =
    history ~
    version
}
