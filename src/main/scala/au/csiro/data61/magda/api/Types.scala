package au.csiro.data61.magda.api

import spray.json.DefaultJsonProtocol
import spray.json._

object Types {
  case class SearchResult(
    hitCount: Int,
    dataSets: List[DataSet])

  case class DataSet(
    title: String,
    description: String)

  trait Protocols extends DefaultJsonProtocol {
    implicit val dataSetFormat = jsonFormat2(DataSet.apply)
    implicit val searchResultFormat = jsonFormat2(SearchResult.apply)
  }
}