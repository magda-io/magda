package au.csiro.data61.magda.model

import io.swagger.annotations.{ ApiModel, ApiModelProperty }
import enumeratum.values.{ IntEnum, IntEnumEntry }

import scala.annotation.meta.field
import spray.json.{ DefaultJsonProtocol, JsNumber, JsObject, JsString, JsValue, RootJsonFormat }
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException
import java.time.{ OffsetDateTime, ZoneOffset }
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.model.Temporal.{ ApiDate, PeriodOfTime, Periodicity }
import spray.json.{ DefaultJsonProtocol, JsArray, JsObject }
import spray.json.lenses.JsonLenses._
import spray.json.DefaultJsonProtocol._
import spray.json._
import au.csiro.data61.magda.model.misc.{ Protocols => ModelProtocols }

import scala.util.Try
import java.time.format.DateTimeFormatter
import au.csiro.data61.magda.util.DateParser

object Registry {
  @ApiModel(description = "A type of aspect in the registry.")
  case class AspectDefinition(
    @(ApiModelProperty @field)(value = "The unique identifier for the aspect type.", required = true) id: String,

    @(ApiModelProperty @field)(value = "The name of the aspect.", required = true) name: String,

    @(ApiModelProperty @field)(value = "The JSON Schema of this aspect.", required = false, dataType = "object") jsonSchema: Option[JsObject])

  case class WebHookPayload(
    action: String,
    lastEventId: Long,
    events: Option[List[RegistryEvent]],
    records: Option[List[Record]],
    aspectDefinitions: Option[List[AspectDefinition]],
    deferredResponseUrl: Option[String])

  case class RegistryEvent(
    id: Option[Long],
    eventTime: Option[OffsetDateTime],
    eventType: EventType,
    userId: Int,
    data: JsObject)

  @ApiModel(description = "A record in the registry, usually including data for one or more aspects.")
  case class Record(
    @(ApiModelProperty @field)(value = "The unique identifier of the record", required = true) id: String,

    @(ApiModelProperty @field)(value = "The name of the record", required = true) name: String,

    @(ApiModelProperty @field)(value = "The aspects included in this record", required = true, dataType = "object") aspects: Map[String, JsObject])

  // This is used for the Swagger documentation, but not in the code.
  @ApiModel(description = "The JSON data for an aspect of a record.")
  case class Aspect()

  @ApiModel(description = "The type of a registry modification event.")
  sealed abstract class EventType(val value: Int, val name: String) extends IntEnumEntry {
    def isRecordEvent = this == EventType.CreateRecord || this == EventType.DeleteRecord || this == EventType.PatchRecord
    def isAspectDefinitionEvent = this == EventType.CreateAspectDefinition || this == EventType.PatchAspectDefinition || this == EventType.DeleteAspectDefinition
    def isRecordAspectEvent = this == EventType.CreateRecordAspect || this == EventType.DeleteRecordAspect || this == EventType.PatchRecordAspect
    def isCreateEvent = this == EventType.CreateRecord || this == EventType.CreateRecordAspect || this == EventType.CreateAspectDefinition
    def isDeleteEvent = this == EventType.DeleteRecord || this == EventType.DeleteRecordAspect || this == EventType.DeleteAspectDefinition
    def isPatchEvent = this == EventType.PatchRecord || this == EventType.PatchRecordAspect || this == EventType.PatchAspectDefinition
  }

  case class WebHook(
    id: Option[String] = None,
    userId: Option[Int],
    name: String,
    active: Boolean,
    lastEvent: Option[Long] = None,
    url: String,
    eventTypes: Set[EventType],
    isWaitingForResponse: Option[Boolean],
    config: WebHookConfig)

  case class WebHookConfig(
    aspects: Option[List[String]] = None,
    optionalAspects: Option[List[String]] = None,
    includeEvents: Option[Boolean] = None,
    includeRecords: Option[Boolean] = None,
    includeAspectDefinitions: Option[Boolean] = None,
    dereference: Option[Boolean] = None)

  case object EventType extends IntEnum[EventType] {
    case object CreateRecord extends EventType(0, "Create Record")
    case object CreateAspectDefinition extends EventType(1, "Create Aspect Definition")
    case object CreateRecordAspect extends EventType(2, "Create Record Aspect")
    case object PatchRecord extends EventType(3, "Patch Record")
    case object PatchAspectDefinition extends EventType(4, "Patch Aspect Definition")
    case object PatchRecordAspect extends EventType(5, "Patch Record Aspect")
    case object DeleteRecord extends EventType(6, "Delete Record")
    case object DeleteAspectDefinition extends EventType(7, "Delete Aspect Definition")
    case object DeleteRecordAspect extends EventType(8, "Delete Record Aspect")

    val values = findValues
  }

  case class RegistryRecordsResponse(
    totalCount: Long,
    nextPageToken: Option[String],
    records: List[Record])

  case class QualityRatingAspect(score: Double, weighting: Double)

  trait RegistryProtocols extends DefaultJsonProtocol with au.csiro.data61.magda.model.Temporal.Protocols with ModelProtocols {
    implicit object EventTypeFormat extends RootJsonFormat[EventType] {
      def write(e: EventType) = JsString(e.toString)
      def read(value: JsValue) = EventType.values.find(e => e.toString == value.asInstanceOf[JsString].value).get
    }

    implicit val recordFormat = jsonFormat3(Record.apply)
    implicit val registryEventFormat = jsonFormat5(RegistryEvent.apply)
    implicit val aspectFormat = jsonFormat3(AspectDefinition.apply)
    implicit val webHookPayloadFormat = jsonFormat6(WebHookPayload.apply)
    implicit val webHookConfigFormat = jsonFormat6(WebHookConfig.apply)
    implicit val webHookFormat = jsonFormat9(WebHook.apply)
    implicit val registryRecordsResponseFormat = jsonFormat3(RegistryRecordsResponse.apply)
    implicit def qualityRatingAspectFormat = jsonFormat2(QualityRatingAspect.apply)
  }

  trait RegistryConverters extends RegistryProtocols {

    private def convertPublisher(publisher: Record): Agent = {
      val organizationDetails = publisher.aspects.getOrElse("organization-details", JsObject())
      Agent(
        identifier = Some(publisher.id),
        name = organizationDetails.extract[String]('title.?),
        imageUrl = organizationDetails.extract[String]('imageUrl.?))
    }

    def convertRegistryDataSet(hit: Record)(implicit defaultOffset: ZoneOffset): DataSet = {
      val dcatStrings = hit.aspects("dcat-dataset-strings")
      val source = hit.aspects("source")
      val temporalCoverage = hit.aspects.getOrElse("temporal-coverage", JsObject())
      val distributions = hit.aspects.getOrElse("dataset-distributions", JsObject("distributions" -> JsArray()))
      val publisher = hit.aspects.getOrElse("dataset-publisher", JsObject()).extract[JsObject]('publisher.?).map(_.convertTo[Record])

      val qualityAspectOpt = hit.aspects.get("dataset-quality-rating")

      val quality: Double = qualityAspectOpt match {
        case Some(qualityAspect) if !qualityAspect.fields.isEmpty =>
          val ratings = qualityAspect.fields.map {
            case (key, value) =>
              value.convertTo[QualityRatingAspect]
          }
          val totalWeighting = ratings.map(_.weighting).reduce(_ + _)

          if (totalWeighting > 0) {
            ratings.map(rating =>
              (rating.score) * (rating.weighting / totalWeighting)).reduce(_ + _)
          } else 1d
        case _ => 1d
      }

      val coverageStart = ApiDate(tryParseDate(temporalCoverage.extract[String]('intervals.? / element(0) / 'start.?)), dcatStrings.extract[String]('temporal.? / 'start.?).getOrElse(""))
      val coverageEnd = ApiDate(tryParseDate(temporalCoverage.extract[String]('intervals.? / element(0) / 'end.?)), dcatStrings.extract[String]('temporal.? / 'end.?).getOrElse(""))
      val temporal = (coverageStart, coverageEnd) match {
        case (ApiDate(None, ""), ApiDate(None, "")) => None
        case (ApiDate(None, ""), end)               => Some(PeriodOfTime(None, Some(end)))
        case (start, ApiDate(None, ""))             => Some(PeriodOfTime(Some(start), None))
        case (start, end)                           => Some(PeriodOfTime(Some(start), Some(end)))
      }

      DataSet(
        identifier = hit.id,
        title = dcatStrings.extract[String]('title.?),
        catalog = source.extract[String]('name.?),
        description = dcatStrings.extract[String]('description.?),
        issued = tryParseDate(dcatStrings.extract[String]('issued.?)),
        modified = tryParseDate(dcatStrings.extract[String]('modified.?)),
        languages = dcatStrings.extract[String]('languages.? / *).toSet,
        publisher = publisher.map(convertPublisher),
        accrualPeriodicity = dcatStrings.extract[String]('accrualPeriodicity.?).map(Periodicity.fromString(_)),
        spatial = dcatStrings.extract[String]('spatial.?).map(Location(_)), // TODO: move this to the CKAN Connector
        temporal = temporal,
        themes = dcatStrings.extract[String]('themes.? / *),
        keywords = dcatStrings.extract[String]('keywords.? / *),
        contactPoint = dcatStrings.extract[String]('contactPoint.?).map(cp => Agent(Some(cp))),
        distributions = distributions.extract[JsObject]('distributions.? / *).map(convertDistribution(_, hit)),
        landingPage = dcatStrings.extract[String]('landingPage.?),
        quality = quality)
    }

    private def convertDistribution(distribution: JsObject, hit: Record)(implicit defaultOffset: ZoneOffset): Distribution = {
      val distributionRecord = distribution.convertTo[Record]
      val dcatStrings = distributionRecord.aspects.getOrElse("dcat-distribution-strings", JsObject())

      val mediaTypeString = dcatStrings.extract[String]('mediaType.?)
      val formatString = dcatStrings.extract[String]('format.?)
      val urlString = dcatStrings.extract[String]('downloadURL.?)
      val descriptionString = dcatStrings.extract[String]('description.?)

      Distribution(
        identifier = Some(distributionRecord.id),
        title = dcatStrings.extract[String]('title.?).getOrElse(distributionRecord.name),
        description = descriptionString,
        issued = tryParseDate(dcatStrings.extract[String]('issued.?)),
        modified = tryParseDate(dcatStrings.extract[String]('modified.?)),
        license = dcatStrings.extract[String]('license.?).map(name => License(Some(name))),
        rights = dcatStrings.extract[String]('rights.?),
        accessURL = dcatStrings.extract[String]('accessURL.?),
        downloadURL = urlString,
        byteSize = dcatStrings.extract[Int]('byteSize.?).flatMap(bs => Try(bs.toInt).toOption),
        mediaType = Distribution.parseMediaType(mediaTypeString, None, None),
        format = formatString)
    }

    private def tryParseDate(dateString: Option[String])(implicit defaultOffset: ZoneOffset): Option[OffsetDateTime] = {
      dateString.flatMap(s => DateParser.parseDateDefault(s, false))
    }
  }

  object RegistryConstants {
    val aspects = List(
      "dcat-dataset-strings",
      "dataset-distributions",
      "source")

    val optionalAspects = List(
      "temporal-coverage",
      "dataset-publisher",
      "dataset-quality-rating")
  }
}
