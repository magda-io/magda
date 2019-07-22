package au.csiro.data61.magda.model

import java.time.{OffsetDateTime, ZoneOffset}

import akka.event.LoggingAdapter
import au.csiro.data61.magda.model.Registry.{AspectDefinition, EventType, QualityRatingAspect, Record, RecordSummary, RecordType, RegistryCountResponse, RegistryEvent, RegistryRecordsResponse, WebHook, WebHookAcknowledgement, WebHookAcknowledgementResponse, WebHookConfig, WebHookPayload}
import au.csiro.data61.magda.model.Temporal.{ApiDate, PeriodOfTime, Periodicity}
import au.csiro.data61.magda.model.misc.{Protocols => ModelProtocols, _}
import au.csiro.data61.magda.util.DateParser
import enumeratum.values.{IntEnum, IntEnumEntry}
import io.swagger.annotations.{ApiModel, ApiModelProperty}
import spray.json.lenses.JsonLenses._
import spray.json.{DefaultJsonProtocol, JsArray, JsObject, JsString, JsValue, RootJsonFormat, _}

import scala.annotation.meta.field
import scala.util.{Failure, Success, Try}

trait RegistryProtocols extends DefaultJsonProtocol with au.csiro.data61.magda.model.Temporal.Protocols with ModelProtocols {
  implicit object EventTypeFormat extends RootJsonFormat[EventType] {
    def write(e: EventType) = JsString(e.toString)
    def read(value: JsValue) = EventType.values.find(e => e.toString == value.asInstanceOf[JsString].value).get
  }

  implicit val recordFormat = jsonFormat5(Record.apply)
  implicit val registryEventFormat = jsonFormat5(RegistryEvent.apply)
  implicit val aspectFormat = jsonFormat3(AspectDefinition.apply)
  implicit val webHookPayloadFormat = jsonFormat6(WebHookPayload.apply)
  implicit val webHookConfigFormat = jsonFormat6(WebHookConfig.apply)
  implicit val webHookFormat = jsonFormat14(WebHook.apply)
  implicit val registryRecordsResponseFormat = jsonFormat3(RegistryRecordsResponse.apply)
  implicit def qualityRatingAspectFormat = jsonFormat2(QualityRatingAspect.apply)
  implicit val webHookAcknowledgementFormat = jsonFormat3(WebHookAcknowledgement.apply)
  implicit val webHookAcknowledgementResponse = jsonFormat1(WebHookAcknowledgementResponse.apply)
  implicit val recordSummaryFormat = jsonFormat4(RecordSummary.apply)
  implicit val recordPageFormat = jsonFormat1(RegistryCountResponse.apply)

  implicit object RecordTypeFormat extends RootJsonFormat[RecordType] {
    def write(obj: RecordType) = obj match {
      case x: Record        ⇒ x.toJson
      case y: RecordSummary ⇒ y.toJson
      case unknown @ _      => serializationError(s"Marshalling issue with ${unknown}")
    }

    def read(value: JsValue): RecordType = {
      value.asJsObject.getFields("aspects") match {
        case Seq(aspectMap: JsObject) => value.convertTo[Record]
        case Seq(aspectList: JsArray) => value.convertTo[RecordSummary]
        case unknown @ _              => deserializationError(s"Unmarshalling issue with ${unknown} ")
      }
    }
  }
}

trait RegistryConverters extends RegistryProtocols {

  def getAcronymFromPublisherName(publisherName: Option[String]): Option[String] = {
    publisherName
      .map("""[^a-zA-Z\s]""".r.replaceAllIn(_, ""))
      .map("""\s""".r.split(_).map(_.trim.toUpperCase).filter(!List("", "AND", "THE", "OF").contains(_)).map(_.take(1)).mkString)
  }

  private def convertPublisher(publisher: Record): Agent = {
    val organizationDetails = publisher.aspects.getOrElse("organization-details", JsObject())
    val jurisdiction = organizationDetails.extract[String]('jurisdiction.?)
    val name = organizationDetails.extract[String]('title.?)
    Agent(
      identifier = Some(publisher.id),
      name = name,
      jurisdiction = jurisdiction,
      aggKeywords = if (jurisdiction.isEmpty) Some(name.getOrElse(publisher.id).toLowerCase) else jurisdiction.map(name.getOrElse(publisher.id) + ":" + _).map(_.toLowerCase),
      description = organizationDetails.extract[String]('description.?),
      acronym = getAcronymFromPublisherName(organizationDetails.extract[String]('title.?)),
      imageUrl = organizationDetails.extract[String]('imageUrl.?),
      phone = organizationDetails.extract[String]('phone.?),
      email = organizationDetails.extract[String]('email.?),
      addrStreet = organizationDetails.extract[String]('addrStreet.?),
      addrSuburb = organizationDetails.extract[String]('addrSuburb.?),
      addrState = organizationDetails.extract[String]('addrState.?),
      addrPostCode = organizationDetails.extract[String]('addrPostCode.?),
      addrCountry = organizationDetails.extract[String]('addrCountry.?),
      website = organizationDetails.extract[String]('website.?),
      source = publisher.aspects.get("source").map(_.convertTo[DataSouce]))
  }

  def getNullableStringField(data:JsObject, field:String):Option[String] = {
    data.fields.get(field) match {
      case None => None
      case Some(JsNull) => None
      case Some(JsString(str)) => Some(str)
      case _ => deserializationError(s"Invalid nullableString field: ${field}")
    }
  }

  def convertRegistryDataSet(hit: Record, logger: Option[LoggingAdapter] = None)(implicit defaultOffset: ZoneOffset): DataSet = {
    val dcatStrings = hit.aspects.getOrElse("dcat-dataset-strings", JsObject())
    val source = hit.aspects.getOrElse("source", JsObject())
    val temporalCoverage = hit.aspects.getOrElse("temporal-coverage", JsObject())
    val distributions = hit.aspects.getOrElse("dataset-distributions", JsObject("distributions" -> JsArray()))
    val publisher: Option[Record] = hit.aspects.getOrElse("dataset-publisher", JsObject()).extract[JsObject]('publisher.?)
      .map((dataSet: JsObject) => {
        val theDataSet = JsObject(dataSet.fields + ("tenantId" -> JsNumber(hit.tenantId.get)))
        val record = theDataSet.convertTo[Record]
        record
      })

    val accessControl = hit.aspects.get("dataset-access-control") match {
      case Some(JsObject(accessControlData)) => Some(AccessControl(
        ownerId = accessControlData.get("ownerId") match {
          case Some(JsString(ownerId)) => Some(ownerId)
          case _ => None
        },
        orgUnitOwnerId = accessControlData.get("orgUnitOwnerId") match {
          case Some(JsString(orgUnitOwnerId)) => Some(orgUnitOwnerId)
          case _ => None
        },
        preAuthorisedPermissionIds = accessControlData.get("preAuthorisedPermissionIds") match {
          case Some(JsArray(preAuthorisedPermissionIds)) => Some(preAuthorisedPermissionIds.toArray.flatMap{
            case JsString(permissionId) => Some(permissionId)
            case _ => None
          })
          case _ => None
        }
      ))
      case _ => None
    }


    val qualityAspectOpt = hit.aspects.get("dataset-quality-rating")

    var hasQuality: Boolean = false

    val quality: Double = qualityAspectOpt match {
      case Some(qualityAspect) if !qualityAspect.fields.isEmpty =>
        hasQuality = true
        val ratings = qualityAspect.fields.map {
          case (key, value) =>
            value.convertTo[QualityRatingAspect]
        }
        val totalWeighting = ratings.map(_.weighting).reduce(_ + _)

        val score = if (totalWeighting > 0) {
          ratings.map(rating =>
            (rating.score) * (rating.weighting / totalWeighting)).reduce(_ + _)
        } else 0d

        // Make sure no quality score is set to zero, otherwise it results in relevance being * by 0 which makes
        // results come back in a random order
        if (score > 0) score else 0.01
      case _ => 1d
    }

    // --- intervals could be an empty array
    // --- put in a Try to avoid exceptions
    val coverageStart = ApiDate(tryParseDate(
      Try[Option[String]]{
        temporalCoverage.extract[String]('intervals.? / element(0) / 'start.?)
      } match {
        case Success(Some(v)) => Some(v)
        case _ => None
      }
    ), dcatStrings.extract[String]('temporal.? / 'start.?).getOrElse(""))

    val coverageEnd = ApiDate(tryParseDate(
      Try[Option[String]]{
        temporalCoverage.extract[String]('intervals.? / element(0) / 'end.?)
      } match {
        case Success(Some(v)) => Some(v)
        case _ => None
      }
    ), dcatStrings.extract[String]('temporal.? / 'end.?).getOrElse(""))

    val temporal = (coverageStart, coverageEnd) match {
      case (ApiDate(None, ""), ApiDate(None, "")) => None
      case (ApiDate(None, ""), end)               => Some(PeriodOfTime(None, Some(end)))
      case (start, ApiDate(None, ""))             => Some(PeriodOfTime(Some(start), None))
      case (start, end)                           => Some(PeriodOfTime(Some(start), Some(end)))
    }

    val spatialData = Try(dcatStrings.extract[String]('spatial.?).map(Location(_))) match {
      case Success(location) => location
      case Failure(e) =>
        if(logger.isDefined) {
          logger.get.error(s"Failed to parse spatial data for dataset ${hit.id}: ${e.getMessage}")
        }
        None
    }

    val publishing = hit.aspects.getOrElse("publishing", JsObject())

    DataSet(
      identifier = hit.id,
      tenantId = hit.tenantId.get,
      title = dcatStrings.extract[String]('title.?),
      catalog = source.extract[String]('name.?),
      description = getNullableStringField(dcatStrings, "description"),
      issued = tryParseDate(dcatStrings.extract[String]('issued.?)),
      modified = tryParseDate(dcatStrings.extract[String]('modified.?)),
      languages = dcatStrings.extract[String]('languages.? / *).toSet,
      publisher = publisher.map(convertPublisher),
      accrualPeriodicity = dcatStrings.extract[String]('accrualPeriodicity.?).map(Periodicity.fromString(_)),
      accrualPeriodicityRecurrenceRule = dcatStrings.extract[String]('accrualPeriodicityRecurrenceRule.?),
      spatial = spatialData, // TODO: move this to the CKAN Connector
      temporal = temporal,
      themes = dcatStrings.extract[String]('themes.? / *),
      keywords = dcatStrings.extract[String]('keywords.? / *),
      contactPoint = dcatStrings.extract[String]('contactPoint.?).map(cp => Agent(Some(cp))),
      distributions = distributions.extract[JsObject]('distributions.? / *).map(convertDistribution(_, hit)),
      landingPage = dcatStrings.extract[String]('landingPage.?),
      quality = quality,
      hasQuality = hasQuality,
      score = None,
      source = hit.aspects.get("source").map(_.convertTo[DataSouce]),
      creation = dcatStrings.getFields("creation").headOption.filter{
        case JsNull => false
        case _ => true
      }.map(_.convertTo[DcatCreation]),
      publishingState = Some(publishing.extract[String]('state.?).getOrElse("published")), // assume not set means published
      accessControl = accessControl)
  }

  private def convertDistribution(distribution: JsObject, hit: Record)(implicit defaultOffset: ZoneOffset): Distribution = {
    val theDistribution = JsObject(distribution.fields + ("tenantId" -> JsNumber(hit.tenantId.get)))
    val distributionRecord: Record = theDistribution.convertTo[Record]
    val dcatStrings = distributionRecord.aspects.getOrElse("dcat-distribution-strings", JsObject())
    val datasetFormatAspect = distributionRecord.aspects.getOrElse("dataset-format", JsObject())

    val mediaTypeString = dcatStrings.extract[String]('mediaType.?)
    val formatString = dcatStrings.extract[String]('format.?)
    val urlString = dcatStrings.extract[String]('downloadURL.?)
    val descriptionString = dcatStrings.extract[String]('description.?)
    val betterFormatString = datasetFormatAspect.extract[String]('format.?)

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
      format = betterFormatString match {
        case Some(format) => Some(format)
        case None         => formatString
      },
      source = distributionRecord.aspects.get("source").map(_.convertTo[DataSouce]))
  }

  private def tryParseDate(dateString: Option[String])(implicit defaultOffset: ZoneOffset): Option[OffsetDateTime] = {
    val YEAR_100 = OffsetDateTime.of(100, 1, 1, 0, 0, 0, 0, defaultOffset)
    val YEAR_1000 = OffsetDateTime.of(1000, 1, 1, 0, 0, 0, 0, defaultOffset)

    dateString
      .flatMap(s => DateParser.parseDateDefault(s, false))
      .map {
        //FIXME: Remove this hackiness when we get a proper temporal minion
        case date if date.isBefore(YEAR_100)  => date.withYear(date.getYear + 2000)
        case date if date.isBefore(YEAR_1000) => date.withYear(Integer.parseInt(date.getYear.toString() + "0"))
        case date                             => date
      }
  }
}

object Registry extends RegistryConverters {
  /**
  * == MAGDA_ADMIN_PORTAL_ID and MAGDA_SYSTEM_ID play different roles. ==
  * 
  * === 1. Role of MAGDA_ADMIN_PORTAL_ID in single tenant mode===
  * Tenant IDs are foreign keys in many tables. When migrating the existing DB, all existing entries in table aspects,
  * records, recordaspects and events must have non-null values in field of tenantId. They are all set to
  * MAGDA_ADMIN_PORTAL_ID. MAGDA_ADMIN_PORTAL_ID is the tenant id in single tenant deployment (default deployment).
  * <p/>
  * === 2. Role of MAGDA_ADMIN_PORTAL_ID in multi-tenant mode ===
  * It manages tenants only. It creates, enables or disable tenants.
  * <p/>
  * === 3. Role of MAGDA_SYSTEM_ID ===
  * It is not important in single tenant mode but necessary in multi-tenant mode. It is mainly used to perform global
  * operations. For example, when re-indexing datasets, it will retrieve records and record aspects of all tenants from
  * DB. Many minions also take this role, e.g. a broken link minion.
 */
  val MAGDA_ADMIN_PORTAL_ID: BigInt = 0

  /**
    * Request with this tenant ID can perform global operations on registry.
    *
    * @see [[au.csiro.data61.magda.model.Registry.MAGDA_ADMIN_PORTAL_ID]]
    */
  val MAGDA_SYSTEM_ID: BigInt = -1

  /**
    * The header name of tenant ID.
    */
  val MAGDA_TENANT_ID_HEADER: String = "X-Magda-Tenant-Id"

  @ApiModel(description = "A type of aspect in the registry, unique for a tenant.")
  case class AspectDefinition(
    @(ApiModelProperty @field)(value = "The identifier for the aspect type.", required = true) id: String,

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

  object RegistryEvent {
    def getTenantId(event: RegistryEvent): BigInt = {
      // Events created in the old system (single tenant) do not have tenantId field in the data object.
      // Newly created events always have tenantId field in the data object.
      val maybeTenantId = event.data.getFields("tenantId")

      if (maybeTenantId.nonEmpty)
        ModelProtocols.convertField[BigInt]( fieldName = "tenantId", jsData = event.data)
      else
        MAGDA_ADMIN_PORTAL_ID
    }
  }

  sealed trait RecordType {
    val id: String
    val name: String
    val tenantId: Option[BigInt]
  }

  @ApiModel(description = "A record in the registry, usually including data for one or more aspects, unique for a tenant.")
  case class Record(
    @(ApiModelProperty @field)(value = "The identifier of the record", required = true) id: String,

    @(ApiModelProperty @field)(value = "The name of the record", required = true) name: String,

    @(ApiModelProperty @field)(value = "The aspects included in this record", required = true, dataType = "object") aspects: Map[String, JsObject],

    @(ApiModelProperty @field)(value = "A tag representing the action by the source of this record " +
      "(e.g. an id for a individual crawl of a data portal).", required = false, allowEmptyValue = true) sourceTag: Option[String] = None,

    @(ApiModelProperty @field)(value = "The identifier of a tenant", required = false) tenantId: Option[BigInt] = None) extends RecordType

  @ApiModel(description = "A summary of a record in the registry.  Summaries specify which aspects are available, but do not include data for any aspects.")
  case class RecordSummary(
    @(ApiModelProperty @field)(value = "The identifier of the record", required = true) id: String,

    @(ApiModelProperty @field)(value = "The name of the record", required = true) name: String,

    @(ApiModelProperty @field)(value = "The list of aspect IDs for which this record has data", required = true) aspects: List[String],

    @(ApiModelProperty @field)(value = "The identifier of the tenant", required = false) tenantId: Option[BigInt]) extends RecordType

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
    config: WebHookConfig,
    enabled: Boolean = true,
    lastRetryTime: Option[OffsetDateTime] = None,
    retryCount: Int = 0,
    isRunning: Option[Boolean] = None,
    isProcessing: Option[Boolean] = None)

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
  case class RegistryCountResponse(
    count: Long)

  case class RegistryRecordsResponse(
    hasMore: Boolean,
    nextPageToken: Option[String],
    records: List[Record])

  case class QualityRatingAspect(score: Double, weighting: Double)

  @ApiModel(description = "Asynchronously acknowledges receipt of a web hook notification.")
  case class WebHookAcknowledgement(
    @(ApiModelProperty @field)(value = "True if the web hook was received successfully and the listener is ready for further notifications.  False if the web hook was not received and the same notification should be repeated.", required = true) succeeded: Boolean,

    @(ApiModelProperty @field)(value = "The ID of the last event received by the listener.  This should be the value of the `lastEventId` property of the web hook payload that is being acknowledged.  This value is ignored if `succeeded` is false.", required = true) lastEventIdReceived: Option[Long] = None,

    @(ApiModelProperty @field)(value = "Should the webhook be active or inactive?", required = false) active: Option[Boolean] = None)

  @ApiModel(description = "The response to an asynchronous web hook acknowledgement.")
  case class WebHookAcknowledgementResponse(
    @(ApiModelProperty @field)(value = "The ID of the last event successfully received by the listener.  Further notifications will start after this event.", required = true) lastEventIdReceived: Long)

  object RegistryConstants {
    val aspects = List(
      "dcat-dataset-strings")

    val optionalAspects = List(
      "dataset-distributions",
      "source",
      "temporal-coverage",
      "dataset-publisher",
      "dataset-quality-rating",
      "dataset-format",
      "publishing",
      "spatial-coverage",
      "dataset-access-control")
  }
}
