package au.csiro.data61.magda.api

import java.util.concurrent.TimeUnit

import akka.actor.ActorSystem
import akka.event.{ Logging, LoggingAdapter }
import akka.http.scaladsl.Http
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.{ HttpResponse, StatusCodes }
import akka.http.scaladsl.model.StatusCodes._
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.{ ExceptionHandler, MethodRejection, RejectionHandler }
import akka.stream.Materializer
import au.csiro.data61.magda.model.misc
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.api.{ model => apimodel }
import au.csiro.data61.magda.search.SearchQueryer
import au.csiro.data61.magda.search.elasticsearch.{ ClientProvider, ElasticSearchQueryer }
import ch.megard.akka.http.cors.{ CorsDirectives, CorsSettings }
import com.typesafe.config.Config

import scala.concurrent.ExecutionContext
import scala.concurrent.duration.FiniteDuration
import au.csiro.data61.magda.spatial.RegionSources
import au.csiro.data61.magda.api.QueryCompiler

class Api(val logger: LoggingAdapter, val searchQueryer: SearchQueryer)(implicit val config: Config) extends misc.Protocols with CorsDirectives with apimodel.Protocols {
  // Disallow credentials so that we return "Access-Control-Allow-Origin: *" instead of
  // "Access-Control-Allow-Origin: foo.com".  The latter is fine until Chrome decides to
  // cache the response and re-use it for other origins, causing a CORS failure.
  val corsSettings = CorsSettings.defaultSettings.copy(allowCredentials = false)

  implicit def rejectionHandler = RejectionHandler.newBuilder()
    .handleAll[MethodRejection] { rejections ⇒
      val methods = rejections map (_.supported)
      lazy val names = methods map (_.name) mkString ", "

      cors(corsSettings) {
        options {
          complete(s"Supported methods : $names.")
        } ~
          complete(
            MethodNotAllowed,
            s"HTTP method not allowed, supported methods: $names!"
          )
      }
    }
    .result()

  val myExceptionHandler = ExceptionHandler {
    case e: Exception ⇒ {
      logger.error(e, "Exception encountered")

      cors(corsSettings) {
        complete(HttpResponse(InternalServerError, entity = "Failure"))
      }
    }
  }

  val queryCompiler = new QueryCompiler(new RegionSources(config.getConfig("regionSources")))

  val routes =
    cors(corsSettings) {
      handleExceptions(myExceptionHandler) {
        pathPrefix("facets") {
          path(Segment / "options" / "search") { facetId ⇒
            (get & parameters("facetQuery" ? "", "start" ? 0, "limit" ? 10, "generalQuery" ? "*")) { (facetQuery, start, limit, generalQuery) ⇒
              FacetType.fromId(facetId) match {
                case Some(facetType) ⇒ complete(searchQueryer.searchFacets(facetType, facetQuery, queryCompiler.apply(generalQuery), start, limit))
                case None            ⇒ complete(NotFound)
              }
            }
          }
        } ~
          pathPrefix("datasets") {
            pathPrefix("search") {
              (get & parameters("query" ? "*", "start" ? 0, "limit" ? 10, "facetSize" ? 10)) { (query, start, limit, facetSize) ⇒
                println(queryCompiler.apply(query))
                onSuccess(searchQueryer.search(queryCompiler.apply(query), start, limit, facetSize)) { result =>

                  val status = if (result.errorMessage.isDefined) StatusCodes.InternalServerError else StatusCodes.OK

                  pathPrefix("datasets") {
                    complete(status, result.copy(facets = None))
                  } ~ pathPrefix("facets") {
                    complete(status, result.facets)
                  } ~ pathEnd {
                    complete(status, result)
                  }
                }
              }
            }
          } ~
          path("region-types") { get { getFromResource("regionMapping.json") } } ~
          path("regions" / "search") {
            (get & parameters("query" ? "*", "start" ? 0, "limit" ? 10)) { (query, start, limit) ⇒
              complete(searchQueryer.searchRegions(query, start, limit))
            }
          }
      }
    }
}