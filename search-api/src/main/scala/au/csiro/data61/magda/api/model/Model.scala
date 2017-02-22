package au.csiro.data61.magda.api.model

import au.csiro.data61.magda.model.misc.{ DataSet, Facet, Region }
import au.csiro.data61.magda.model.temporal
import au.csiro.data61.magda.model.misc
import au.csiro.data61.magda.search.SearchStrategy
import spray.json.{ DefaultJsonProtocol, JsString, JsValue, JsonFormat }
import au.csiro.data61.magda.api.{ Query, FilterValue, Specified, Unspecified }
import au.csiro.data61.magda.model.misc.{ QueryRegion }
import java.time.OffsetDateTime

case class SearchResult(
  query: Query,
  hitCount: Long,
  facets: Option[Seq[Facet]] = None,
  dataSets: List[DataSet],
  errorMessage: Option[String] = None,
  strategy: Option[SearchStrategy] = None)

case class RegionSearchResult(
  query: String,
  hitCount: Long,
  regions: List[Region])

trait Protocols extends DefaultJsonProtocol with temporal.Protocols with misc.Protocols {
  implicit object SearchStrategyFormat extends JsonFormat[SearchStrategy] {
    override def write(strat: SearchStrategy): JsString = JsString.apply(strat.name)

    override def read(json: JsValue): SearchStrategy = SearchStrategy.parse(json.convertTo[String])
  }
  class FilterValueFormat[T](implicit t: JsonFormat[T]) extends JsonFormat[FilterValue[T]] {
    override def write(filterValue: FilterValue[T]): JsValue = filterValue match {
      case Specified(inner) => t.write(inner)
      case Unspecified      => JsString("Unspecified")
    }

    override def read(json: JsValue): FilterValue[T] = json match {
      case JsString("Unspecified") => Unspecified
      case other                   => Specified(t.read(other))
    }
  }
  implicit val stringFilterValueFormat = new FilterValueFormat[String]
  implicit val offsetDateFilterValueFormat = new FilterValueFormat[OffsetDateTime]
  implicit val queryRegionFilterValueFormat = new FilterValueFormat[QueryRegion]
  implicit val queryFormat = jsonFormat8(Query.apply)
  implicit val searchResultFormat = jsonFormat6(SearchResult.apply)
  implicit val regionSearchResultFormat = jsonFormat3(RegionSearchResult.apply)
}
