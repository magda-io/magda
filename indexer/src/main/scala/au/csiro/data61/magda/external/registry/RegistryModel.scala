package au.csiro.data61.magda.external.registry

import java.time.format.DateTimeParseException
import java.time.{OffsetDateTime, ZoneOffset}

import au.csiro.data61.magda.external.InterfaceConfig
import au.csiro.data61.magda.model.misc.{DataSet, Distribution}
import au.csiro.data61.magda.model.temporal.{ApiDate, PeriodOfTime}
import spray.json.{DefaultJsonProtocol, JsArray, JsObject}
import spray.json.lenses.JsonLenses._
import spray.json.DefaultJsonProtocol._

import scala.util.Try

case class RegistryRecordsResponse(
  totalCount: Long,
  nextPageToken: Option[String],
  records: List[RegistryRecord])

case class RegistryRecord(
  id: String,
  name: String,
  aspects: Map[String, JsObject]
)

trait RegistryProtocols extends DefaultJsonProtocol {
  implicit val registryRecordFormat = jsonFormat3(RegistryRecord.apply)
  implicit val registryRecordsResponseFormat = jsonFormat3(RegistryRecordsResponse.apply)
}

trait RegistryConverters extends RegistryProtocols {
  implicit def registryDataSetConv(interface: InterfaceConfig)(hit: RegistryRecord): DataSet = {
    val dcatStrings = hit.aspects("dcat-dataset-strings")
    val temporalCoverage = hit.aspects.getOrElse("temporal-coverage", JsObject())
    val distributions = hit.aspects.getOrElse("dataset-distributions", JsObject("distributions" -> JsArray()))

    val coverageStart = ApiDate(tryParseDate(temporalCoverage.extract[String]('intervals.? / element(0) / 'start.?)), dcatStrings.extract[String]('temporal.? / 'start.?).getOrElse(""))
    val coverageEnd = ApiDate(tryParseDate(temporalCoverage.extract[String]('intervals.? / element(0) / 'end.?)), dcatStrings.extract[String]('temporal.? / 'end.?).getOrElse(""))
    val temporal = (coverageStart, coverageEnd) match {
      case (ApiDate(None, ""), ApiDate(None, "")) => None
      case (ApiDate(None, ""), end) => Some(PeriodOfTime(None, Some(end)))
      case (start, ApiDate(None, "")) => Some(PeriodOfTime(Some(start), None))
      case (start, end) => Some(PeriodOfTime(Some(start), Some(end)))
    }

    DataSet(
      identifier = hit.id,
      title = dcatStrings.extract[String]('title.?),
      catalog = interface.name,
      description = dcatStrings.extract[String]('description.?),
      issued = tryParseDate(dcatStrings.extract[String]('issued.?)),
      modified = tryParseDate(dcatStrings.extract[String]('modified.?)),
      language = None, // TODO: dcatStrings.extract[String]('languages.? / element(0)),
      publisher = None, //dcatStrings.extract[String]('publisher.?),
      accrualPeriodicity = None, // dcatStrings.extract[String]('accrualPeriodicity.?),
      spatial = None, // TODO
      temporal = temporal,
      theme = dcatStrings.extract[String]('themes.? / *),
      keyword = dcatStrings.extract[String]('keywords.? / *),
      contactPoint = None, // TODO
      distributions = distributions.extract[JsObject]('distributions.? / *).map(convertDistribution(_, hit)),
      landingPage = dcatStrings.extract[String]('landingPage.?)
    )
  }

  private def convertDistribution(distribution: JsObject, hit: RegistryRecord): Distribution = {
    val distributionRecord = distribution.convertTo[RegistryRecord]
    val dcatStrings = distributionRecord.aspects.getOrElse("dcat-distribution-strings", JsObject())

    Distribution(
      title = dcatStrings.extract[String]('title.?).getOrElse(distributionRecord.name),
      description = dcatStrings.extract[String]('description.?),
      issued = tryParseDate(dcatStrings.extract[String]('issued.?)),
      modified = tryParseDate(dcatStrings.extract[String]('modified.?)),
      license = None, //TODO dcatStrings.extract[String]('license.?),
      rights = dcatStrings.extract[String]('rights.?),
      accessURL = dcatStrings.extract[String]('accessURL.?),
      downloadURL = dcatStrings.extract[String]('downloadURL.?),
      byteSize = dcatStrings.extract[String]('byteSize.?).flatMap(bs => Try(bs.toInt).toOption),
      mediaType = None, // TODO
      format = dcatStrings.extract[String]('format.?)
    )
  }

  private def tryParseDate(dateString: Option[String]): Option[OffsetDateTime] = {
    try {
      dateString.map(OffsetDateTime.parse(_))
    } catch {
      case _: DateTimeParseException => None
    }
  }
}
