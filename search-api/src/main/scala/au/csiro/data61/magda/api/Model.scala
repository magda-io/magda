package au.csiro.data61.magda.api

import au.csiro.data61.magda.model.misc.{DataSet, Facet, Region}
import au.csiro.data61.magda.model.temporal
import au.csiro.data61.magda.model.misc
import au.csiro.data61.magda.search.SearchStrategy
import spray.json.{DefaultJsonProtocol, JsString, JsValue, JsonFormat}

package Model {
  case class SearchResult(
    query: Query,
    hitCount: Long,
    facets: Option[Seq[Facet]] = None,
    dataSets: List[DataSet],
    errorMessage: Option[String] = None,
    strategy: Option[SearchStrategy] = None
  )

  case class RegionSearchResult(
    query: String,
    hitCount: Long,
    regions: List[Region]
  )

  trait Protocols extends DefaultJsonProtocol with temporal.Protocols with misc.Protocols {
    implicit object SearchStrategyFormat extends JsonFormat[SearchStrategy] {
      override def write(strat: SearchStrategy): JsString = JsString.apply(strat.name)

      override def read(json: JsValue): SearchStrategy = SearchStrategy.parse(json.convertTo[String])
    }
    implicit val queryFormat = jsonFormat8(Query.apply)
    implicit val searchResultFormat = jsonFormat6(SearchResult.apply)
    implicit val regionSearchResultFormat = jsonFormat3(RegionSearchResult.apply)
  }
}
