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
import java.time.Instant
import com.monsanto.labs.mwundo.GeoJson.Coordinate
import com.monsanto.labs.mwundo.GeoJson.Polygon
import com.monsanto.labs.mwundo.GeoJson.MultiPolygon
import com.monsanto.labs.mwundo.GeoJson.Point
import com.monsanto.labs.mwundo.GeoJson.MultiPoint
import scala.xml.Node
import au.csiro.data61.magda.external.ExternalInterface
import au.csiro.data61.magda.external.HttpFetcher
import au.csiro.data61.magda.external.InterfaceConfig
import au.csiro.data61.magda.util.Xml._
import scala.BigDecimal
import com.monsanto.labs.mwundo.GeoJson.LineString
import com.monsanto.labs.mwundo.GeoJson.MultiLineString

class GMDCSWImplementation(interfaceConfig: InterfaceConfig, implicit val system: ActorSystem) extends CSWImplementation with ScalaXmlSupport {
  implicit val logger = Logging(system, getClass)

  override def schema = "http://www.isotc211.org/2005/gmd"

  override def responseConv(res: NodeSeq): List[DataSet] = {
    dataSetConv(res \ "SearchResults" \ "MD_Metadata")
  }

  def dataSetConv(res: NodeSeq): List[DataSet] =
    res.toList.map { summaryRecord =>
      val identifier = summaryRecord \ "fileIdentifier" \ "CharacterString" text
      val identification = nodeToOption(summaryRecord \ "identificationInfo" \ "MD_DataIdentification")
        .getOrElse(summaryRecord \ "identificationInfo" \ "SV_ServiceIdentification")
      val citation = identification \ "citation" \ "CI_Citation"

      val dates = citation \ "date" \ "CI_Date"
      val publicationDate = parseDateFromNode(findDateWithType(dates, "creation") \ "date" \ "DateTime")
        .orElse(parseDateFromNode(findDateWithType(dates, "publication") \ "date" \ "DateTime"))
      val modifiedDate = parseDateFromNode(findDateWithType(dates, "revision") \ "date" \ "DateTime").orElse(publicationDate)

      val extent = identification \ "extent" \ "EX_Extent"

      DataSet(
        identifier = identifier,
        catalog = interfaceConfig.name,
        title = nodeToStringOption(citation \ "title" \ "CharacterString"),
        description = nodeToStringOption(identification \ "abstract" \ "CharacterString"),
        issued = publicationDate,
        modified = modifiedDate,
        language = Option(summaryRecord \ "language" \ "LanguageCode" \@ "codeListValue"),
        publisher = publisherFromNode(citation \ "citedResponsibleParty" \ "CI_ResponsibleParty")
          .orElse(publisherFromNode(summaryRecord \ "contact" \ "CI_ResponsibleParty"))
          .orElse(publisherFromNode(identification \ "pointOfContact" \ "CI_ResponsibleParty"))
          .orElse((summaryRecord \ "distributionInfo" \ "distributor" \ "MD_Distributor" \ "distributorContact" \ "CI_ResponsibleParty").headOption)
          .map(x => buildAgent(false)(x.head)),
        accrualPeriodicity = nodeToStringOption(
          identification \ "resourceMaintenance" \ "MD_MaintenanceInformation" \ "maintenanceAndUpdateFrequency" \ "MD_MaintenanceFrequencyCode"
        ).map(Periodicity.fromString(_)),
        spatial = buildLocation(extent \ "geographicElement" \ "EX_GeographicBoundingBox"),
        temporal = buildPeriodOfTime(modifiedDate)(extent \ "temporalElement" \ "EX_TemporalExtent"),
        theme = (identification \ "topicCategory" \ "TopicCategoryCode").map(_.text),
        keyword = (identification \ "descriptiveKeywords" \ "MD_Keywords" \ "keyword" \ "CharacterString").map(_.text),
        contactPoint = nodeToOption(summaryRecord \ "contact" \ "CI_ResponsibleParty")
          .orElse(nodeToOption(identification \ "pointOfContact" \ "CI_ResponsibleParty"))
          .map(nodeSeq => buildAgent(true)(nodeSeq.head)),
        distributions = buildDistributions(
          constraintNodes = identification \ "resourceConstraints",
          distNodes = summaryRecord \ "distributionInfo" \ "MD_Distribution" \ "transferOptions" \ "MD_DigitalTransferOptions"
            \ "onLine" \ "CI_OnlineResource"
        ),
        landingPage = Some(interfaceConfig.landingPageUrl(identifier))
      )
    }

  def findDateWithType(nodes: NodeSeq, dateType: String) = nodes.filter(node => (node \ "dateType" \ "CI_DateTypeCode").text.equals(dateType))

  def buildDistributions(constraintNodes: NodeSeq, distNodes: NodeSeq): Seq[Distribution] = {
    val licenseName = nodeToStringOption(constraintNodes \\ "licenseName")
    val licenseUrl = nodeToStringOption(constraintNodes \\ "licenseLink")
    val license = ((licenseName, licenseUrl) match {
      case (None, None) => None
      case (name, url)  => Some(License(name, url))
    }).orElse(
      (constraintNodes \ "MD_LegalConstraints")
        .filter(constraintNode => (constraintNode \ "useConstraints" \ "MD_RestrictionCode").text.trim.equals("license"))
        .map(licenseConstraint => nodeToStringOption(licenseConstraint \ "otherConstraints" \ "CharacterString"))
        .flatten
        .map(licenseText => License(Some(licenseText)))
        .headOption
    )

    val rights = nodeToStringOption(constraintNodes \ "MD_LegalConstraints" \ "useLimitation"
      \ "CharacterString")

    distNodes.toList
      .filter(distNode => nodeToStringOption(distNode \ "linkage" \ "URL").isDefined)
      .map { distNode =>
        val url = nodeToStringOption(distNode \ "linkage" \ "URL").get
        val title = distNode \ "name" \ "CharacterString" text
        val description = nodeToStringOption(distNode \ "description" \ "CharacterString")
        val format = Distribution.parseFormat(None, Some(url), None, description)
        val isDownload = Distribution.isDownloadUrl(url, title, description, format) || ((distNode \ "function" \ "CI_OnlineFunctionCode" text) match {
          case "download" => true
          case _          => false
        })

        Distribution(
          title = title,
          description = description,
          accessURL = if (!isDownload) Some(url) else None,
          downloadURL = if (isDownload) Some(url) else None,
          format = format,
          mediaType = Distribution.parseMediaType(None, format, Some(url)),
          license = license,
          rights = rights
        )
      }
  }

  def buildAgent(preferIndividual: Boolean = false)(node: Node): Agent = {
    val contactInfo = node \ "contactInfo" \ "CI_Contact"
    val address = contactInfo \ "address" \ "CI_Address"
    val individual = nodeToStringOption(node \ "individualName" \ "CharacterString")
    val organisation = nodeToStringOption(node \ "organisationName" \ "CharacterString")

    new Agent(
      name = if (preferIndividual) individual.orElse(organisation) else organisation.orElse(individual),
      homePage = nodeToStringOption(contactInfo \ "onlineResource" \ "CI_OnlineResource" \ "linkage" \ "URL"),
      email = nodeToStringOption(address \ "electronicMailAddress" \ "CharacterString"),
      extraFields =
        (
          nodesToMap(address, "deliveryPoint", "city", "administrativeArea", "postalCode", "country") ++
          Map(
            "hoursOfService" -> nodeToStringOption(contactInfo \ "hoursOfService" \ "CharacterString"),
            "phone" -> nodeToStringOption(contactInfo \ "phone" \ "CI_Telephone" \ "voice" \ "CharacterString"),
            "fax" -> nodeToStringOption(contactInfo \ "phone" \ "CI_Telephone" \ "facsimile" \ "CharacterString")
          ).filter { case (_, value) => value.isDefined }.mapValues(_.get)
        ).filter(x => !x._2.isEmpty())
    )
  }

  def buildPeriodOfTime(modified: Option[Instant])(temporalElements: NodeSeq): Option[PeriodOfTime] = {
    val sortedInstants = temporalElements.toList
      .map(timePeriod =>
        List(
          ApiInstant.parse(timePeriod \ "beginPosition" text, modified, false),
          ApiInstant.parse(timePeriod \ "endPosition" text, modified, true)
        )
      )
      .flatten
      .flatten
      .filter(instant => instant.date.isDefined)
      .sortWith { case (instant1, instant2) => instant1.date.get.isAfter(instant2.date.get) }

    if (!sortedInstants.isEmpty) {
      Some(PeriodOfTime(
        start = Some(sortedInstants.head),
        end = Some(sortedInstants.last)
      ))
    } else {
      None
    }
  }

  def buildLocation(boundingBoxes: NodeSeq): Option[Location] =
    boundingBoxes.toList match {
      case Nil => None
      case boundingBoxList =>
        val bBoxPoints = boundingBoxList
          .map { boundingBox =>
            val north = BigDecimal(boundingBox \ "northBoundLatitude" \ "Decimal" text)
            val east = BigDecimal(boundingBox \ "eastBoundLongitude" \ "Decimal" text)
            val south = BigDecimal(boundingBox \ "southBoundLatitude" \ "Decimal" text)
            val west = BigDecimal(boundingBox \ "westBoundLongitude" \ "Decimal" text)

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

        val geometry =
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

        Some(Location(
          text = Some(boundingBoxes.head.toString()),
          geoJson = geometry
        ))
    }

  def publisherFromNode(responsibleParties: NodeSeq) = {
    val grouped = responsibleParties.groupBy(party => (party \ "role" \ "CI_RoleCode").text.trim)

    grouped.get("publisher").headOption
      .orElse(grouped.get("owner").headOption)
      .orElse(grouped.get("custodian").headOption)
  }

}