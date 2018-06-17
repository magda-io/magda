package au.csiro.data61.magda.api

import akka.event.LoggingAdapter
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.{ StatusCodes }
import akka.http.scaladsl.model.StatusCodes._
import akka.http.scaladsl.server.Directives._
import au.csiro.data61.magda.model.misc
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.api.{ model => apimodel }
import au.csiro.data61.magda.search.SearchQueryer
import com.typesafe.config.Config

class SearchApi(val searchQueryer: SearchQueryer)(implicit val config: Config, implicit val logger: LoggingAdapter) extends misc.Protocols with BaseMagdaApi with apimodel.Protocols {
  override def getLogger = logger

  val routes =
    magdaRoute {
      pathPrefix("v0") {
        pathPrefix("facets") {
          path(Segment / "options") { facetId ⇒
            (get & parameters(
              'facetQuery?,
              "start" ? 0,
              "limit" ? 10,
              'generalQuery?,
              'publisher*,
              'dateFrom?,
              'dateTo?,
              'region*,
              'format*)) { (facetQuery, start, limit, generalQuery, publishers, dateFrom, dateTo, regions, formats) =>
                val query = Query.fromQueryParams(generalQuery, publishers, dateFrom, dateTo, regions, formats)

                FacetType.fromId(facetId) match {
                  case Some(facetType) ⇒ complete(searchQueryer.searchFacets(facetType, facetQuery, query, start, limit))
                  case None            ⇒ complete(NotFound)
                }
              }
          }
        } ~
          pathPrefix("datasets") {
            (get & parameters(
              'query?,
              "start" ? 0,
              "limit" ? 10,
              "facetSize" ? 10,
              'publisher*,
              'dateFrom?,
              'dateTo?,
              'region*,
              'format*)) { (generalQuery, start, limit, facetSize, publishers, dateFrom, dateTo, regions, formats) ⇒
                val query = Query.fromQueryParams(generalQuery, publishers, dateFrom, dateTo, regions, formats)

                onSuccess(searchQueryer.search(query, start, limit, facetSize)) { result =>
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
          } ~
          pathPrefix("organisations") {
            (get & parameters(
              'query?,
              "start" ? 0,
              "limit" ? 10
              )) { (generalQuery, start, limit) ⇒
              onSuccess(searchQueryer.searchOrganisations(generalQuery, start, limit)) { result =>
                val status = if (result.errorMessage.isDefined) StatusCodes.InternalServerError else StatusCodes.OK
                complete(status, result)
              }
            }
          } ~
          path("region-types") { get { getFromResource("regionMapping.json") } } ~
          path("regions") {
            (get & parameters('query?, "start" ? 0, "limit" ? 10)) { (query, start, limit) ⇒
              complete(searchQueryer.searchRegions(query, start, limit))
            }
          }
      }
    }
}
