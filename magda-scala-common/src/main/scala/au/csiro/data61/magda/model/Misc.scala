package au.csiro.data61.magda.model

import java.time.OffsetDateTime

import com.monsanto.labs.mwundo.GeoJson._

import akka.http.scaladsl.model.MediaType
import akka.http.scaladsl.model.MediaTypes
import au.csiro.data61.magda.model.GeoJsonFormats._
import au.csiro.data61.magda.model.Temporal._
import spray.json._
import scala.runtime.ScalaRunTime

package misc {
  sealed trait FacetType {
    def id: String
  }

  object FacetType {
    val all = Seq(Publisher, Year, Format)

    private val idToFacet = all.groupBy(_.id.toLowerCase).mapValues(_.head)

    def fromId(id: String): Option[FacetType] = idToFacet get id.toLowerCase
  }

  case object Publisher extends FacetType {
    override def id = "Publisher"
  }

  case object Year extends FacetType {
    override def id = "Year"
  }

  case object Format extends FacetType {
    override def id = "Format"
  }

  case class FacetSearchResult(
    hitCount: Long,
    options: Seq[FacetOption])

  case class Facet(
    id: String,
    options: Seq[FacetOption])

  case class FacetOption(
    identifier: Option[String], // = None
    value: String,
    hitCount: Long,
    upperBound: Option[Int] = None,
    lowerBound: Option[Int] = None,
    matched: Boolean = false)

  case class DataSet(
      identifier: String,
      title: Option[String] = None,
      catalog: Option[String],
      description: Option[String] = None,
      issued: Option[OffsetDateTime] = None,
      modified: Option[OffsetDateTime] = None,
      languages: Set[String] = Set(),
      publisher: Option[Agent] = None,
      accrualPeriodicity: Option[Periodicity] = None,
      spatial: Option[Location] = None,
      temporal: Option[PeriodOfTime] = None,
      themes: Seq[String] = List(),
      keywords: Seq[String] = List(),
      contactPoint: Option[Agent] = None,
      distributions: Seq[Distribution] = Seq(),
      landingPage: Option[String] = None,
      years: Option[String] = None,
      indexed: Option[OffsetDateTime] = None,
      quality: Double) {

    def uniqueId: String = java.net.URLEncoder.encode(catalog.getOrElse("nocatalog") + "/" + identifier, "UTF-8")

    override def toString: String = s"Dataset(identifier = $identifier, title=$title)"

    def normalToString: String = ScalaRunTime._toString(this)
  }

  case class Agent(
    identifier: Option[String] = None,
    name: Option[String] = None,
    homePage: Option[String] = None,
    email: Option[String] = None,
    imageUrl: Option[String] = None)

  case class Location(
    text: Option[String] = None,
    geoJson: Option[Geometry] = None)

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
              val Array(x, y) = stringCoords.trim.split("\\s").map(_.toDouble)
              Coordinate(x, y)
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
            southEast)
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

  case class QueryRegion(
      regionType: String,
      regionId: String) {

    override def toString = s"$regionType:$regionId"
  }

  case class Region(
    queryRegion: QueryRegion,
    regionName: Option[String] = None,
    boundingBox: Option[BoundingBox] = None)

  case class Distribution(
    identifier: Option[String] = None,
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
    format: Option[String] = None)

  object Distribution {
    private val extensionRegex = new scala.util.matching.Regex("\\.([^./]+)$", "extension")
    // TODO: Push into config
    private val formatToMimeType: Map[String, MediaType] = Map(
      "GeoJSON" -> MediaTypes.`application/json`,
      "KML" -> MediaTypes.`application/vnd.google-earth.kml+xml`,

      "CSV" -> MediaTypes.`text/csv`,
      "JSON" -> MediaTypes.`application/json`,
      "SHP" -> MediaTypes.`application/octet-stream`)

    private val caseInsensitiveFormatToMimeType = formatToMimeType.map {
      case (key: String, mediaType: MediaType) =>
        Map(
          key.toUpperCase -> mediaType,
          key.toLowerCase -> mediaType,
          key -> mediaType)
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
      ".*\\.(html|xhtml|php|asp|aspx|jsp)(\\?.*)?".r -> "HTML")

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

  trait Protocols extends DefaultJsonProtocol with Temporal.Protocols {

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
        case point: Point           => GeoJsonFormats.PointFormat.write(point)
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

    implicit object CoordinateFormat extends JsonFormat[Coordinate] {
      def write(obj: Coordinate): JsValue = JsArray(
        JsNumber(obj.x),
        JsNumber(obj.y))

      def read(json: JsValue): Coordinate = json match {
        case JsArray(is) =>
          Coordinate(is(0).convertTo[BigDecimal], is(1).convertTo[BigDecimal])
      }
    }

    object EsBoundingBoxFormat extends JsonFormat[BoundingBox] {
      override def write(region: BoundingBox): JsValue = {
        JsObject(
          "type" -> JsString("envelope"),
          "coordinates" -> JsArray(Vector(
            JsArray(Vector(JsNumber(region.west), JsNumber(region.north))),
            JsArray(Vector(JsNumber(region.east), JsNumber(region.south))))))
      }

      override def read(jsonRaw: JsValue): BoundingBox = {
        jsonRaw.asJsObject match {
          case JsObject(fields) => (fields("type"), fields("coordinates")) match {
            case (JsString("envelope"), JsArray(Vector(
              JsArray(Vector(JsNumber(west), JsNumber(north))),
              JsArray(Vector(JsNumber(east), JsNumber(south)))
              ))) => BoundingBox(north, east, south, west)
          }
        }
      }
    }

    val apiBoundingBoxFormat = jsonFormat4(BoundingBox)

    implicit val queryRegionFormat = jsonFormat2(QueryRegion.apply)

    class RegionFormat(bbFormat: JsonFormat[BoundingBox]) extends JsonFormat[Region] {
      override def write(region: Region): JsValue = JsObject(Map(
        "regionId" -> region.queryRegion.regionId.toJson,
        "regionType" -> region.queryRegion.regionType.toJson,
        "regionName" -> region.regionName.toJson,
        "boundingBox" -> region.boundingBox.map(_.toJson(bbFormat)).toJson).filter(x => !x._2.equals(JsNull)))

      override def read(jsonRaw: JsValue): Region = {
        val json = jsonRaw.asJsObject

        Region(
          QueryRegion(
            regionId = json.getFields("regionId").head.convertTo[String],
            regionType = json.getFields("regionType").head.convertTo[String]),
          regionName = json.getFields("regionName").headOption.map(_.convertTo[String]),
          boundingBox = json.getFields("boundingBox").headOption.map(_.convertTo[BoundingBox](bbFormat)))
      }
    }

    val apiRegionFormat = new RegionFormat(apiBoundingBoxFormat)
    val esRegionFormat = new RegionFormat(EsBoundingBoxFormat)

    implicit val distributionFormat = jsonFormat12(Distribution.apply)
    implicit val locationFormat = jsonFormat2(Location.apply)
    implicit val agentFormat = jsonFormat5(Agent.apply)
    implicit val dataSetFormat = jsonFormat19(DataSet.apply)
    implicit val facetOptionFormat = jsonFormat6(FacetOption.apply)
    implicit val facetFormat = jsonFormat2(Facet.apply)
    implicit val facetSearchResultFormat = jsonFormat2(FacetSearchResult.apply)
  }

  object Protocols extends Protocols {
  }

}