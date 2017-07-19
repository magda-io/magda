package au.csiro.data61.magda.indexer.external.registry

import java.time.format.DateTimeParseException
import java.time.{ OffsetDateTime, ZoneOffset }

import au.csiro.data61.magda.indexer.external.InterfaceConfig
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.model.Registry.{ Record, Protocols => RegistryProtocols }
import au.csiro.data61.magda.model.Temporal.{ ApiDate, PeriodOfTime, Periodicity }
import spray.json.{ DefaultJsonProtocol, JsArray, JsObject }
import spray.json.lenses.JsonLenses._
import spray.json.DefaultJsonProtocol._
import spray.json._
import au.csiro.data61.magda.model.misc.{ Protocols => ModelProtocols }

import scala.util.Try
import java.time.format.DateTimeFormatter
import au.csiro.data61.magda.util.DateParser

case class RegistryRecordsResponse(
  totalCount: Long,
  nextPageToken: Option[String],
  records: List[Record])

case class QualityRatingAspect(percentage: Int, weighting: Int)

trait RegistryIndexerProtocols extends DefaultJsonProtocol with RegistryProtocols {
  implicit val registryRecordsResponseFormat = jsonFormat3(RegistryRecordsResponse.apply)
}

trait RegistryConverters extends RegistryProtocols with ModelProtocols {
  implicit def qualityRatingAspectFormat = jsonFormat2(QualityRatingAspect.apply)

  implicit def registryDataSetConv(interface: InterfaceConfig)(hit: Record)(implicit defaultOffset: ZoneOffset): DataSet = {
    val dcatStrings = hit.aspects("dcat-dataset-strings")
    val source = hit.aspects("source")
    val temporalCoverage = hit.aspects.getOrElse("temporal-coverage", JsObject())
    val distributions = hit.aspects.getOrElse("dataset-distributions", JsObject("distributions" -> JsArray()))
    val publisher = hit.aspects.getOrElse("dataset-publisher", JsObject()).extract[JsObject]('publisher.?).map(_.convertTo[Record])

    val qualityAspectOpt = hit.aspects.get("dataset-quality-rating")
    val quality = qualityAspectOpt match {
      case Some(qualityAspect) =>
        val ratings = qualityAspect.fields.map {
          case (key, value) =>
            val rating = value.convertTo[QualityRatingAspect]

            (rating.percentage.toDouble / 100) * (rating.weighting.toDouble / 100)
        }

        ratings.reduce(_ + _) / ratings.size
      case None => 1
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

  private def convertPublisher(publisher: Record): Agent = {
    val organizationDetails = publisher.aspects.getOrElse("organization-details", JsObject())
    Agent(
      identifier = Some(publisher.id),
      name = organizationDetails.extract[String]('title.?),
      imageUrl = organizationDetails.extract[String]('imageUrl.?))
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

object RegistryConverters extends RegistryConverters {

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