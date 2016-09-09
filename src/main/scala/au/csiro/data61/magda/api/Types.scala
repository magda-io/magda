package au.csiro.data61.magda.api

import spray.json.DefaultJsonProtocol
import spray.json._
import java.time.{ Instant, Period, Duration }

object Types {
  //  import Periodicity.jsonConv

  case class SearchResult(
    hitCount: Int,
    facets: Option[Seq[Facet]] = None,
    dataSets: List[DataSet])

  case class FacetSearchResult(
    hitCount: Int,
    options: Seq[FacetOption])

  case class Facet(
    id: String,
    name: String,
    options: Seq[FacetOption])

  case class FacetOption(
    id: String,
    name: String,
    hitCount: Option[Int] = None)

  object Periodicity {
    val asNeeded: Periodicity = new Periodicity("As Needed")
    implicit object JSONConv extends JsonFormat[Periodicity] {
      override def write(periodicity: Periodicity): JsString = JsString(periodicity.toString)
      override def read(json: JsValue) = ???
    }
  }

  class Periodicity private (name: Option[String] = None, duration: Option[Duration] = None) {
    def this(name: String) = this(name = Some(name))
    def this(duration: Duration) = this(duration = Some(duration))

    override def toString() = duration match {
      case Some(duration) => duration.toString()
      case None => name match {
        case Some(name) => name
        case None       => ""
      }
    }
  }

  case class DataSet(
    identifier: String,
    catalog: String,
    title: Option[String] = None,
    description: Option[String] = None,
    issued: Option[Instant] = None,
    modified: Option[Instant] = None,
    language: Option[String] = None,
    publisher: Option[Agent] = None,
    accrualPeriodicity: Option[Periodicity] = None,
    spatial: Option[Location] = None,
    temporal: Option[PeriodOfTime] = None,
    theme: Seq[String] = List(),
    keyword: Seq[String] = List(),
    contactPoint: Option[Agent] = None,
    distribution: Option[Seq[Distribution]] = None,
    landingPage: Option[String] = None)

  case class PeriodOfTime(
    start: Option[ApiInstant] = None,
    end: Option[ApiInstant] = None)

  case class ApiInstant(
    date: Option[Instant] = None,
    text: Option[String] = None)

  case class Agent(
    name: Option[String] = None,
    homePage: Option[String] = None,
    email: Option[String] = None,
    extraFields: Map[String, String] = Map())

  case class Location(
    name: Option[String] = None,
    // This is supposed to be able to define shapes and stuff too, god knows how to do that yet...
    latLong: Option[LatLong] = None)

  case class LatLong(latitude: Double, longitude: Double)

  case class Distribution(
    title: String,
    description: Option[String] = None,
    issued: Option[Instant] = None,
    modified: Option[Instant] = None,
    license: Option[License] = None,
    rights: Option[License] = None,
    accessURL: Option[String] = None,
    downloadURL: Option[String] = None,
    byteSize: Option[Int] = None,
    mediaType: Option[String] = None,
    format: Option[String] = None)

  case class License(name: String, url: String)

  trait Protocols extends DefaultJsonProtocol {
    implicit val licenseFormat = jsonFormat2(License.apply)
    implicit object InstantFormat extends JsonFormat[Instant] {
      override def write(instant: Instant): JsString = JsString.apply(instant.toString())
      override def read(json: JsValue): Instant = Instant.parse(json.convertTo[String])
    }
    implicit val distributionFormat = jsonFormat11(Distribution.apply)
    implicit val apiInstant = jsonFormat2(ApiInstant.apply)
    implicit val periodOfTimeFormat = jsonFormat2(PeriodOfTime.apply)
    implicit object DurationFormat extends JsonFormat[Duration] {
      override def write(duration: Duration): JsNumber = JsNumber(duration.toMillis())
      override def read(json: JsValue): Duration = Duration.ofMillis(json.convertTo[Long])
    }
    implicit val latLngFormat = jsonFormat2(LatLong.apply)
    implicit val locationFormat = jsonFormat2(Location.apply)
    implicit val agentFormat = jsonFormat4(Agent.apply)
    implicit val dataSetFormat = jsonFormat16(DataSet.apply)
    implicit val facetOptionFormat = jsonFormat3(FacetOption.apply)
    implicit val facetFormat = jsonFormat3(Facet.apply)
    implicit val searchResultFormat = jsonFormat3(SearchResult.apply)
    implicit val facetSearchResultFormat = jsonFormat2(FacetSearchResult.apply)
  }
  
  object Protocols extends Protocols {
    
  }
}