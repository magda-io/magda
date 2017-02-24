package au.csiro.data61.magda.external.csw

import java.io.IOException
import scala.concurrent.Future
import scala.xml.NodeSeq
import akka.actor.ActorSystem
import akka.event.Logging
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.marshallers.xml.ScalaXmlSupport
import akka.http.scaladsl.model.StatusCodes._
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.unmarshalling.Unmarshal
import akka.stream.Materializer
import scala.concurrent.ExecutionContext
import au.csiro.data61.magda.model.temporal._
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.util.DateParser._
import com.monsanto.labs.mwundo.GeoJson.Coordinate
import com.monsanto.labs.mwundo.GeoJson.Polygon
import com.monsanto.labs.mwundo.GeoJson.MultiPolygon
import com.monsanto.labs.mwundo.GeoJson.Point
import com.monsanto.labs.mwundo.GeoJson.MultiPoint
import scala.xml.Node
import au.csiro.data61.magda.external.ExternalInterface
import au.csiro.data61.magda.external.HttpFetcher
import au.csiro.data61.magda.external.InterfaceConfig
import scala.BigDecimal
import au.csiro.data61.magda.util.Xml._
import java.time.OffsetDateTime
import com.typesafe.config.Config
import java.time.ZoneOffset

class DefaultCSWImplementation(interfaceConfig: InterfaceConfig, implicit val config: Config, implicit val system: ActorSystem) extends CSWImplementation with ScalaXmlSupport {
  val logger = Logging(system, getClass)
  
  override def typeName = "csw:Record"

  def schema = "http://www.opengis.net/cat/csw/2.0.2"
  implicit val defaultOffset = ZoneOffset.of(config.getString("time.defaultOffset"))

  override def responseConv(res: NodeSeq): List[DataSet] = {
    dataSetConv(res \ "SearchResults" \ "Record")
  }

  implicit def dataSetConv(res: NodeSeq) =
    res map { summaryRecord =>
      val modified = nodeToStringOption(summaryRecord \ "date").flatMap(parseDateDefault(_, false))

      val identifier = summaryRecord \ "identifier" text

      DataSet(
        identifier = identifier,
        catalog = interfaceConfig.name,
        title = nodeToStringOption(summaryRecord \ "title"),
        description = nodeToStringOption(summaryRecord \ "description")
          .orElse(nodeToStringOption(summaryRecord \ "abstract")),
        modified = modified,
        language = nodeToStringOption(summaryRecord \ "language"),
        publisher = nodeToStringOption(summaryRecord \ "publisher")
          .orElse(nodeToStringOption(summaryRecord \ "custodian"))
          .map(name => Agent(name = Some(name))),
        spatial = nodeToOption(summaryRecord \ "BoundingBox", Some.apply).flatMap(locationFromBoundingBox),
        temporal = nodeToOption(summaryRecord \ "coverage", Some.apply).flatMap(temporalFromString(modified)),
        keyword = (summaryRecord \ "subject").map(_.text.trim),
        distributions = buildDistributions(summaryRecord \ "URI", summaryRecord \ "rights"),
        landingPage = interfaceConfig.landingPageUrl(identifier)
      )
    } toList
  //
  def nodesWithAttribute(sourceNodes: NodeSeq, name: String, value: String): NodeSeq = {
    sourceNodes
      .filter(node =>
        node.attribute(name)
          .exists(
            _.exists { x =>
              x.text.trim.equals(value)
            }
          ))
  }

  def buildDistributions(uriNodes: NodeSeq, rightsNodes: NodeSeq): Seq[Distribution] = {
    val rights = rightsNodes.map(_.text.trim).distinct match {
      case Seq(x) => Some(x)
      case _      => None
    }

    def buildBasicDist(node: Node): (Node, String, Distribution) = {
      val url = node.text.trim
      val desc = node \@ "description"
      val format = Distribution.parseFormat(None, Some(url), None, Some(desc))

      (node, url, Distribution(
        title = "",
        description = if (desc.isEmpty()) None else Some(desc),
        format = format,
        rights = rights
      ))
    }

    val metadataLinks = nodesWithAttribute(uriNodes, "protocol", "WWW:LINK-1.0-http--metadata-URL")
      .map(buildBasicDist)
      .map {
        case (_, url, dist) =>
          dist.copy(
            title = "Metadata Link",
            accessURL = Some(url)
          )
      }
    val links = nodesWithAttribute(uriNodes, "protocol", "WWW:LINK-1.0-http--link")
      .map(buildBasicDist)
      .map {
        case (node, url, dist) =>
          dist.copy(
            title = node \@ "name",
            accessURL = Some(url)
          )
      }
    val files = nodesWithAttribute(uriNodes, "name", "File download")
      .map(buildBasicDist)
      .map {
        case (_, url, dist) => dist.copy(
          title = dist.format match {
            case Some(formatString) => s"Download as $formatString"
            case None               => "Download"
          },
          downloadURL = Some(url)
        )
      }

    metadataLinks ++ links ++ files
  }

  val temporalCoveragePattern = """.*start="(.*)"; end="(.*)"""".r
  def temporalFromString(modified: Option[OffsetDateTime])(nodes: NodeSeq): Option[PeriodOfTime] = {
    val dates = nodes.map { node =>
      val text = node.text.trim
      text match {
        case temporalCoveragePattern(startTime, endTime) => PeriodOfTime.parse(Some(startTime), Some(endTime), modified)
        case "" => None
        case _ => Some(PeriodOfTime(start = Some(ApiDate(text = text))))
      }
    }.flatMap {
      case Some(periodOfTime) => Seq(periodOfTime.start, periodOfTime.end)
      case None               => Seq()
    }.flatten
      .filter(_.date.isDefined)
      .sortBy(_.date.get.toEpochSecond())

    dates match {
      case Seq()             => None
      case Seq(date)         => Some(PeriodOfTime(start = Some(date)))
      case Seq(date1, date2) => Some(PeriodOfTime(start = Some(date1), end = Some(date2)))
      case seq               => Some(PeriodOfTime(start = Some(seq.head), end = Some(seq.last)))
    }
  }

  def locationFromBoundingBox(node: NodeSeq): Option[Location] = {
    def toCoord(array: Array[String]) = Coordinate(BigDecimal(array(0)), BigDecimal(array(1)))
    def toCoords(node: NodeSeq): (Coordinate, Coordinate) = {
      val upperLeftCorner = toCoord((node \ "UpperCorner" text).split(" "))
      val lowerRightCorner = toCoord((node \ "LowerCorner" text).split(" "))
      (upperLeftCorner, lowerRightCorner)
    }
    def toPolygonCoords(upperLeftCorner: Coordinate, lowerRightCorner: Coordinate): Seq[Seq[Coordinate]] = {
      val upperRightCorner = Coordinate(lowerRightCorner.x, upperLeftCorner.y)
      val lowerLeftCorner = Coordinate(upperLeftCorner.x, lowerRightCorner.y)

      Seq(
        Seq(
          upperLeftCorner,
          upperRightCorner,
          lowerRightCorner,
          lowerLeftCorner,
          upperLeftCorner
        )
      )
    }

    try {
      val geometry =
        if (node.size == 1) {
          val (upperLeftCorner, lowerRightCorner) = toCoords(node)
          Polygon(toPolygonCoords(upperLeftCorner, lowerRightCorner))
        } else {
          val (coords, polygons) = node.foldRight((List[Coordinate](), List[Seq[Seq[Coordinate]]]())) {
            case (innerNode, (coords, polygons)) =>
              val (upperLeftCorner, lowerRightCorner) = toCoords(innerNode)

              if (upperLeftCorner.equals(lowerRightCorner)) {
                (upperLeftCorner :: coords, polygons)
              } else {
                (coords, toPolygonCoords(upperLeftCorner, lowerRightCorner) :: polygons)
              }
          }

          if (!polygons.isEmpty) MultiPolygon(polygons)
          else {
            coords.distinct match {
              case Seq(singleCoord)                => Point(singleCoord)
              case Seq(coord1, coord2)             => Polygon(toPolygonCoords(coord1, coord2))
              case distinctCoords: Seq[Coordinate] => MultiPoint(distinctCoords)
            }
          }
        }

      Some(Location.applySanitised(
        text = node.text.trim,
        geoJson = Some(geometry)
      ))
    } catch {
      case e: Throwable =>
        logger.warning("Could not parse bounding box '{}'", node.text.trim)
        Some(Location(
          text = nodeToStringOption(node),
          geoJson = None
        ))
    }
  }
}