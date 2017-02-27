package au.csiro.data61.magda.api.model

import au.csiro.data61.magda.model.misc.{ DataSet, Facet, Region }
import au.csiro.data61.magda.model.temporal
import au.csiro.data61.magda.model.misc
import au.csiro.data61.magda.search.SearchStrategy
import spray.json.{ DefaultJsonProtocol, JsString, JsValue, JsonFormat }
import au.csiro.data61.magda.api.{ Query, FilterValue, Specified, Unspecified }
import au.csiro.data61.magda.model.misc.{ QueryRegion }
import java.time.OffsetDateTime
import com.typesafe.config.Config

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
  class FilterValueFormat[T](implicit t: JsonFormat[T], implicit val config: Config) extends JsonFormat[FilterValue[T]] {
    override def write(filterValue: FilterValue[T]): JsValue = filterValue match {
      case Specified(inner) => t.write(inner)
      case Unspecified()    => JsString(filterValue.toString)
    }

    override def read(json: JsValue): FilterValue[T] = json match {
      case JsString(string) =>
        if (string.toLowerCase.equals(Unspecified().toString.toLowerCase()))
          Unspecified() else Specified(t.read(json))
      case other => Specified(t.read(other))
    }
  }
  implicit def stringFilterValueFormat(implicit config: Config) = new FilterValueFormat[String]
  implicit def offsetDateFilterValueFormat(implicit config: Config) = new FilterValueFormat[OffsetDateTime]
  implicit def queryRegionFilterValueFormat(implicit config: Config) = new FilterValueFormat[Region]
  implicit def queryFormat(implicit config: Config) = jsonFormat8(Query.apply)
  implicit def searchResultFormat(implicit config: Config) = jsonFormat6(SearchResult.apply)
  implicit val regionSearchResultFormat = jsonFormat3(RegionSearchResult.apply)
}
