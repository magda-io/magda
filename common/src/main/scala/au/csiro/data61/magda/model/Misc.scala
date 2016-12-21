package au.csiro.data61.magda.model

import spray.json._
import au.csiro.data61.magda.model.temporal._
import akka.http.scaladsl.model.MediaType
import akka.http.scaladsl.model.MediaTypes
import com.monsanto.labs.mwundo.GeoJson._
import com.monsanto.labs.mwundo.GeoJsonFormats._
import java.time.OffsetDateTime

package misc {
  sealed trait FacetType {
    def id: String
  }

  object FacetType {
    val all = Seq(Publisher, Year, Format)

    private val idToFacet = all.groupBy(_.id).mapValues(_.head)

    def fromId(id: String): Option[FacetType] = idToFacet get id
  }

  case object Publisher extends FacetType {
    override def id = "publisher"
  }

  case object Year extends FacetType {
    override def id = "year"
  }

  case object Format extends FacetType {
    override def id = "format"
  }

  case class FacetSearchResult(
    hitCount: Long,
    options: Seq[FacetOption]
  )

  case class Facet(
    id: FacetType,
    options: Seq[FacetOption]
  )

  case class FacetOption(
    value: String,
    hitCount: Long,
    upperBound: Option[String] = None,
    lowerBound: Option[String] = None,
    matched: Option[Boolean] = None
  )

  case class DataSet(
    identifier: String,
    catalog: String,
    title: Option[String] = None,
    description: Option[String] = None,
    issued: Option[OffsetDateTime] = None,
    modified: Option[OffsetDateTime] = None,
    language: Option[String] = None,
    publisher: Option[Agent] = None,
    accrualPeriodicity: Option[Periodicity] = None,
    spatial: Option[Location] = None,
    temporal: Option[PeriodOfTime] = None,
    theme: Seq[String] = List(),
    keyword: Seq[String] = List(),
    contactPoint: Option[Agent] = None,
    distributions: Seq[Distribution] = Seq(),
    landingPage: Option[String] = None,
    years: Option[String] = None
  ) {

    def uniqueId: String = java.net.URLEncoder.encode(catalog + "/" + identifier, "UTF-8")
  }

  case class Agent(
    name: Option[String] = None,
    homePage: Option[String] = None,
    email: Option[String] = None,
    extraFields: Map[String, String] = Map()
  )

  case class Location(
    text: Option[String] = None,
    geoJson: Option[Geometry] = None
  )

  object Location {
    val geoJsonPattern = "\\{\"type\": \".+\",.*\\}".r
    val emptyPolygonPattern = "POLYGON \\(\\(0 0, 0 0, 0 0, 0 0\\)\\)".r
    val polygonPattern = "POLYGON \\(\\(((-?\\d+ -?\\d+\\,?\\s?)+)\\)\\)".r
    val csvPattern = "^(-?\\d+\\.?\\d*\\,){3}-?\\d+\\.?\\d*$".r

    def applySanitised(text: String, geoJson: Option[Geometry] = None) = {
      val processedGeoJson: Option[Geometry] = geoJson match {
        case Some(Polygon(Seq(coords: Seq[Coordinate]))) =>
          coords.distinct match {
            case Seq(coord)          => Some(Point(coords.head))
            case Seq(coord1, coord2) => Some(MultiPoint(Seq(coord1, coord2)))
            case _                   => Some(Polygon(Seq(coords)))
          }
        case x => x
      }

      new Location(Some(text), processedGeoJson)
    }

    def apply(stringWithNewLines: String): Location = {
      val string = stringWithNewLines.replace("\n", " ")
      Location.applySanitised(string, string match {
        case geoJsonPattern() => {
          Some(Protocols.GeometryFormat.read(string.parseJson))
        }
        case emptyPolygonPattern() => None
        case csvPattern(a) =>
          val latLongs = string.split(",").map(BigDecimal.apply)
          fromBoundingBox(Seq(BoundingBox(latLongs(0), latLongs(1), latLongs(2), latLongs(3))))
        case polygonPattern(polygonCoords, _) =>
          val coords = polygonCoords.split(",")
            .map { stringCoords =>
              try {
                val Array(x, y) = stringCoords.trim.split("\\s").map(_.toDouble)
                Coordinate(x, y)
              } catch {
                case e: Throwable => println(stringCoords); throw e
              }
            }.toSeq

          Some(Polygon(Seq(coords)))
        case _ => None
      })
    }


    def fromBoundingBox(boundingBoxList: Seq[BoundingBox]): Option[Geometry] = {
      val bBoxPoints = boundingBoxList
        .map { boundingBox =>
          val BoundingBox(north, east, south, west) = boundingBox
          val northEast = Coordinate(east, north)
          val northWest = Coordinate(west, north)
          val southWest = Coordinate(west, south)
          val southEast = Coordinate(east, south)

          Seq(
            northEast,
            northWest,
            southWest,
            southEast
          )
        }
        .map { seq => seq.distinct }
        .distinct

      if (bBoxPoints.size == 0) {
        None
      } else if (bBoxPoints.size == 1) {
        val coords = bBoxPoints.head
        Some(coords.size match {
          case 1     => Point(coords.head)
          case 2 | 3 => LineString(coords)
          case _     => Polygon(Seq(coords.toList :+ coords.head))
        })
      } else if (!bBoxPoints.exists(_.size != 2)) {
        Some(MultiLineString(bBoxPoints))
      } else if (!bBoxPoints.exists(_.size < 3))
        Some(MultiPolygon(Seq(bBoxPoints)))
      else
        Some(MultiPoint(bBoxPoints.flatten))

    }
  }

  case class BoundingBox(north: BigDecimal, east: BigDecimal, south: BigDecimal, west: BigDecimal)

  case class Region(
    regionType: String,
    regionId: String,
    regionName: String,
    boundingBox: Option[BoundingBox]
  )

  case class Distribution(
    title: String,
    description: Option[String] = None,
    issued: Option[OffsetDateTime] = None,
    modified: Option[OffsetDateTime] = None,
    license: Option[License] = None,
    rights: Option[String] = None,
    accessURL: Option[String] = None,
    downloadURL: Option[String] = None,
    byteSize: Option[Int] = None,
    mediaType: Option[MediaType] = None,
    format: Option[String] = None
  )

  object Distribution {
    private val extensionRegex = new scala.util.matching.Regex("\\.([^./]+)$", "extension")
    // TODO: Push into config
    private val formatToMimeType: Map[String, MediaType] = Map(
      "GeoJSON" -> MediaTypes.`application/json`,
      "KML" -> MediaTypes.`application/vnd.google-earth.kml+xml`,

      "CSV" -> MediaTypes.`text/csv`,
      "JSON" -> MediaTypes.`application/json`,
      "SHP" -> MediaTypes.`application/octet-stream`
    )

    private val caseInsensitiveFormatToMimeType = formatToMimeType.map {
      case (key: String, mediaType: MediaType) =>
        Map(
          key.toUpperCase -> mediaType,
          key.toLowerCase -> mediaType,
          key -> mediaType
        )
    }.reduce(_ ++ _)

    private val urlToFormat = Map(
      ".*\\.geojson$".r -> "GeoJSON",
      ".*?.*service=wms.*".r -> "WMS",
      ".*?.*service=wfs.*".r -> "WFS",
      ".*\\.(shp|shz|dbf)(\\.zip)?$".r -> "SHP",
      ".*\\.(pdf)(\\.zip)?$".r -> "PDF",
      ".*\\.(xls|xlsx)(\\.zip)?$".r -> "Excel",
      ".*\\.(json)(\\.zip)?$".r -> "JSON",
      ".*\\.(xml)(\\.zip)?$".r -> "XML",
      ".*\\.(tif)(\\.zip)?$".r -> "TIFF",
      ".*\\.(zip)$".r -> "ZIP",
      ".*\\.(html|xhtml|php|asp|aspx|jsp)(\\?.*)?".r -> "HTML"
    )

    private def mediaTypeFromMimeType(mimeType: String): Option[MediaType] = MediaType.parse(mimeType) match {
      case Right(mediaType) => Some(mediaType)
      case Left(_)          => None
    }

    def mediaTypeFromFormat(format: String): Option[MediaType] = caseInsensitiveFormatToMimeType.get(format)
      .orElse(MediaTypes.forExtensionOption(format.toLowerCase()))

    private def mediaTypeFromExtension(url: String): Option[MediaType] = extensionRegex
      .findFirstIn(url)
      .flatMap { case extensionRegex(extension) => MediaTypes.forExtensionOption(extension) }

    def parseMediaType(mimeType: Option[String], rawFormat: Option[String], url: Option[String]) = mimeType
      .flatMap(mediaTypeFromMimeType(_))
      .orElse(rawFormat flatMap (mediaTypeFromFormat(_)))
      .orElse(url flatMap (mediaTypeFromExtension(_)))

    def formatFromUrl(url: String) = {
      urlToFormat
        .view
        .filter {
          case (regex, _) =>
            regex.findFirstIn(url).isDefined
        }
        .map { case (_, format) => format }
        .headOption
    }

    def parseFormat(rawFormat: Option[String], url: Option[String], parsedMediaType: Option[MediaType], description: Option[String]): Option[String] = {
      rawFormat
        .orElse(url.flatMap(Distribution.formatFromUrl(_)))
        .orElse(parsedMediaType.map(_.subType))
        .orElse(description.flatMap(desc =>
          urlToFormat.values.filter(format =>
            desc.toLowerCase.contains(format.toLowerCase())).headOption))
    }

    def isDownloadUrl(url: String, title: String, description: Option[String], format: Option[String]): Boolean = {
      title.toLowerCase.contains("download") ||
        description.map(_.toLowerCase.contains("download")).getOrElse(false) ||
        format.map(_.equals("HTML")).getOrElse(false)
    }
  }

  case class License(name: Option[String] = None, url: Option[String] = None)

  trait Protocols extends DefaultJsonProtocol with temporal.Protocols {

    implicit val licenseFormat = jsonFormat2(License.apply)

    implicit object FacetTypeFormat extends JsonFormat[FacetType] {
      override def write(facetType: FacetType): JsString = JsString.apply(facetType.id)

      override def read(json: JsValue): FacetType = FacetType.fromId(json.convertTo[String]).get
    }

    implicit object MediaTypeFormat extends JsonFormat[MediaType] {
      override def write(mediaType: MediaType): JsString = JsString.apply(mediaType.value)

      override def read(json: JsValue): MediaType = MediaType.parse(json.convertTo[String]).right.get
    }

    implicit object GeometryFormat extends JsonFormat[Geometry] {
      override def write(geometry: Geometry): JsValue = geometry match {
        case point: Point           => PointFormat.write(point)
        case point: MultiPoint      => MultiPointFormat.write(point)
        case point: LineString      => LineStringFormat.write(point)
        case point: MultiLineString => MultiLineStringFormat.write(point)
        case point: Polygon         => PolygonFormat.write(point)
        case point: MultiPolygon    => MultiPolygonFormat.write(point)
      }

      override def read(json: JsValue): Geometry = json match {
        case JsObject(jsObj) => jsObj.get("type") match {
          case Some(JsString("Point"))           => PointFormat.read(json)
          case Some(JsString("MultiPoint"))      => MultiPointFormat.read(json)
          case Some(JsString("LineString"))      => LineStringFormat.read(json)
          case Some(JsString("MultiLineString")) => MultiLineStringFormat.read(json)
          case Some(JsString("Polygon"))         => PolygonFormat.read(json)
          case Some(JsString("MultiPolygon"))    => MultiPolygonFormat.read(json)
          case _                                 => deserializationError(s"'$json' is not a valid geojson shape")
        }
        case _ => deserializationError(s"'$json' is not a valid geojson shape")
      }
    }

    implicit val boundingBoxFormat = jsonFormat4(BoundingBox.apply)
    implicit val regionFormat = jsonFormat4(Region.apply)
    implicit val distributionFormat = jsonFormat11(Distribution.apply)
    implicit val locationFormat = jsonFormat2(Location.apply)
    implicit val agentFormat = jsonFormat4(Agent.apply)
    implicit val dataSetFormat = jsonFormat17(DataSet.apply)
    implicit val facetOptionFormat = jsonFormat5(FacetOption.apply)
    implicit val facetFormat = jsonFormat2(Facet.apply)
    implicit val facetSearchResultFormat = jsonFormat2(FacetSearchResult.apply)
  }

  object Protocols extends Protocols {

  }

}