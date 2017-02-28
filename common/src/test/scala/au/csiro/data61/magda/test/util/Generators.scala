package au.csiro.data61.magda.test.util

import java.util.concurrent.atomic.AtomicInteger

import org.scalacheck.Gen
import au.csiro.data61.magda.model.misc.DataSet
import org.scalacheck.Arbitrary._
import java.time.Duration
import java.time.temporal.ChronoUnit

import org.scalacheck.{ Gen, Shrink }
import org.scalacheck.Gen.Choose._
import org.scalacheck.Arbitrary._
import com.monsanto.labs.mwundo.GeoJson._
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.model.temporal._
import java.time.ZonedDateTime

import com.fortysevendeg.scalacheck.datetime.instances.jdk8._
import com.fortysevendeg.scalacheck.datetime.GenDateTime.genDateTimeWithinRange
import java.time.ZoneOffset

import com.vividsolutions.jts.geom
import com.vividsolutions.jts.operation.valid.IsValidOp
import java.time.Instant

import akka.http.scaladsl.model.MediaTypes
import java.util.concurrent.atomic.AtomicInteger

import akka.http.scaladsl.server.Route
import au.csiro.data61.magda.util.Regex._
import org.scalacheck.Shrink.shrink
import au.csiro.data61.magda.spatial.RegionSource
import spray.json.JsObject
import java.net.URL
import spray.json._
import com.vividsolutions.jts.geom.GeometryFactory
import com.monsanto.labs.mwundo.GeoJson._
import au.csiro.data61.magda.util.MwundoJTSConversions._
import com.typesafe.config.Config
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.model.temporal._
import au.csiro.data61.magda.model.misc.Protocols._

object Generators {
  def someBiasedOption[T](inner: Gen[T]) = Gen.frequency((4, Gen.some(inner)), (1, None))
  def noneBiasedOption[T](inner: Gen[T]) = Gen.frequency((1, Gen.some(inner)), (20, None))

  val defaultStartTime = ZonedDateTime.parse("1850-01-01T00:00:00Z").toInstant
  val defaultTightStartTime = ZonedDateTime.parse("2000-01-01T00:00:00Z").toInstant
  val defaultEndTime = ZonedDateTime.parse("2020-01-01T00:00:00Z").toInstant
  val defaultTightEndTime = ZonedDateTime.parse("2015-01-01T00:00:00Z").toInstant

  def genInstant(start: Instant, end: Instant) =
    Gen.choose(start.toEpochMilli(), end.toEpochMilli())
      .flatMap(Instant.ofEpochMilli(_))

  def offsetDateTimeGen(start: Instant = defaultStartTime, end: Instant = defaultEndTime) = for {
    dateTime <- genInstant(start, end)
    offsetHours <- Gen.chooseNum(-17, 17)
    offsetMinutes <- Gen.chooseNum(0, 59).map(_ * offsetHours.signum)
    offsetSeconds <- Gen.chooseNum(0, 59).map(_ * offsetHours.signum)
  } yield dateTime.atOffset(
    ZoneOffset.ofHoursMinutesSeconds(offsetHours, offsetMinutes, offsetSeconds)
  )

  def apiDateGen(start: Instant, end: Instant) = for {
    date <- someBiasedOption(offsetDateTimeGen(start, end))
    text <- if (date.isDefined) Gen.const(date.get.toString) else arbitrary[String]
  } yield ApiDate(date, text)

  val periodOfTimeGen = (for {
    startTime <- Gen.frequency((9, Gen.const(defaultTightStartTime)), (1, defaultStartTime))
    endTime <- Gen.frequency((9, Gen.const(defaultTightEndTime)), (1, defaultEndTime))
    start <- someBiasedOption(apiDateGen(startTime, endTime))
    end <- someBiasedOption(apiDateGen(start.flatMap(_.date).map(_.toInstant).getOrElse(startTime), endTime))
  } yield new PeriodOfTime(start, end)).suchThat {
    case PeriodOfTime(Some(ApiDate(Some(start), _)), Some(ApiDate(Some(end), _))) => start.isBefore(end)
    case _ => true
  }

  def agentGen(nameGen: Gen[String]) = for {
    name <- someBiasedOption(nameGen)
    homePage <- someBiasedOption(arbitrary[String])
    email <- someBiasedOption(arbitrary[String])
    //    extraFields <- Gen.mapOf(Gen.zip(keyGen, arbitrary[String]))
  } yield new Agent(name, homePage, email)

  val durationGen = for {
    number <- Gen.chooseNum(0l, 100l)
    unit <- Gen.oneOf(ChronoUnit.DAYS, ChronoUnit.HOURS, ChronoUnit.MINUTES)
  } yield Duration.of(number, unit)

  val periodicityGen = for {
    text <- someBiasedOption(arbitrary[String])
    duration <- someBiasedOption(durationGen)
  } yield Periodicity(text, duration)

  val xGen =
    Gen.chooseNum(-180, 180).map(BigDecimal.apply)

  val yGen =
    Gen.chooseNum(-90, 90).map(BigDecimal.apply)

  val coordGen = for {
    x <- xGen
    y <- yGen
  } yield Coordinate(x, y)

  def nonConsecutiveDuplicates[T](min: Int, max: Int, gen: Gen[T]) = listSizeBetween(min, max, gen)
    .suchThat(list => list.sliding(2).forall {
      case Seq(before, after) => !before.equals(after)
    })

  val regionSourceGenInner = for {
    name <- Gen.nonEmptyListOf(Gen.alphaNumChar).map(_.mkString)
    idProperty <- Gen.nonEmptyListOf(Gen.alphaNumChar).map(_.mkString)
    nameProperty <- Gen.nonEmptyListOf(Gen.alphaNumChar).map(_.mkString)
    includeIdInName <- arbitrary[Boolean]
    order <- Gen.posNum[Int]
  } yield RegionSource(
    name = name,
    url = new URL("http://example.com"),
    idProperty = idProperty,
    nameProperty = nameProperty,
    includeIdInName = includeIdInName,
    disabled = false,
    order = order
  )

  val regionSourceGen = cachedListGen(regionSourceGenInner, 3)

  val regionGen = for {
    regionSource <- regionSourceGen.flatMap(Gen.oneOf(_))
    id <- Gen.nonEmptyListOf(Gen.alphaNumChar).map(_.mkString)
    name <- Gen.alphaNumStr
    geometry <- geometryGen
    order <- Gen.posNum[Int]
  } yield (regionSource, JsObject(
    "type" -> JsString("Feature"),
    "geometry" -> GeometryFormat.write(geometry),
    "order" -> JsNumber(order),
    "properties" -> JsObject(
      regionSource.idProperty -> JsString(id),
      regionSource.nameProperty -> JsString(name)
    )
  ))

  def listSizeBetween[T](min: Int, max: Int, gen: Gen[T]) = Gen.chooseNum(min, max)
    .flatMap(x => Gen.listOfN(x, gen))

  val pointGen = coordGen.map(Point.apply)
  val multiPointGen = listSizeBetween(1, 5, coordGen).map(MultiPoint.apply)
  val lineStringGenInner = nonConsecutiveDuplicates(2, 5, coordGen)
  val lineStringGen = lineStringGenInner.map(LineString.apply)
  val multiLineStringGen = listSizeBetween(1, 4, lineStringGenInner)
    .map(MultiLineString.apply)
  val polygonGenInner = listSizeBetween(3, 6, Gen.zip(Gen.choose(1, 90)))
    .map(_.sorted)
    .map(list => list.zipWithIndex.map {
      case (hypotenuse, index) =>
        val angle = (Math.PI / list.size) * (index + 1)
        Coordinate(hypotenuse * Math.cos(angle), hypotenuse * Math.sin(angle))
    })
    .map(x => (x :+ x.head))
  val polygonStringGen = Gen.listOfN(1, polygonGenInner) // FIXME: Do we need a hole generator?
    .map(Polygon.apply)
  val multiPolygonStringGen =
    Gen.chooseNum(1, 3).flatMap(Gen.listOfN(_, polygonStringGen.map(_.coordinates)))
      .map(MultiPolygon.apply)

  val geoFactory = new GeometryFactory()
  val geometryGen = Gen.oneOf(
    pointGen,
    multiPointGen,
    lineStringGen,
    multiLineStringGen,
    polygonStringGen,
    multiPolygonStringGen
  ).suchThat(geometry => GeometryConverter.toJTSGeo(geometry, geoFactory).isValid)

  val locationGen = for {
    text <- someBiasedOption(Gen.alphaNumStr)
    geoJson <- someBiasedOption(geometryGen)
  } yield new Location(text, geoJson)

  val nonEmptyString = Gen.choose(1, 20).flatMap(Gen.listOfN(_, Gen.alphaNumChar).map(_.mkString))

  def cachedListGen[T](gen: Gen[T], size: Int) = {
    var cache: Option[List[T]] = None

    Gen.delay {
      cache match {
        case Some(cacheInner) =>
          Gen.const(cacheInner)
        case None =>
          Gen.listOfN(size, gen).map { words =>
            cache = Some(words)
            words
          }
      }
    }
  }

  val descWordGen = cachedListGen(nonEmptyString, 1000)
  val publisherGen = cachedListGen(nonEmptyString, 50)
  val mediaTypeGen = Gen.oneOf(Seq(
    MediaTypes.`application/json`,
    MediaTypes.`application/vnd.google-earth.kml+xml`,
    MediaTypes.`text/csv`,
    MediaTypes.`application/json`,
    MediaTypes.`application/octet-stream`
  ))
  val randomFormatGen = cachedListGen(nonEmptyString, 50)

  def textGen(inner: Gen[List[String]]) = inner
    .flatMap(Gen.someOf(_))
    .map {
      case Nil => ""
      case seq => seq.reduce(_ + " " + _)
    }

  val licenseGen = for {
    name <- someBiasedOption(arbitrary[String])
    url <- someBiasedOption(arbitrary[String])
  } yield License(name, url)

  val formatGen = for {
    mediaType <- Gen.option(mediaTypeGen)
    randomFormat <- randomFormatGen.flatMap(Gen.oneOf(_))
  } yield (mediaType, mediaType.flatMap(_.fileExtensions.headOption).getOrElse(randomFormat))

  val distGen = for {
    title <- arbitrary[String]
    description <- someBiasedOption(arbitrary[String])
    issued <- someBiasedOption(offsetDateTimeGen())
    modified <- someBiasedOption(offsetDateTimeGen())
    license <- someBiasedOption(licenseGen)
    rights <- someBiasedOption(arbitrary[String])
    accessURL <- someBiasedOption(arbitrary[String])
    byteSize <- someBiasedOption(arbitrary[Int])
    format <- someBiasedOption(formatGen)
  } yield Distribution(
    title = title,
    description = description,
    issued = issued,
    modified = modified,
    license = license,
    rights = rights,
    accessURL = accessURL,
    byteSize = byteSize,
    mediaType = format.flatMap(_._1),
    format = format.map(_._2)
  )

  val incrementer: AtomicInteger = new AtomicInteger(0)

  val dataSetGen = for {
    identifier <- Gen.delay {
      incrementer.incrementAndGet()
    }
    title <- someBiasedOption(Gen.alphaNumStr)
    catalog <- arbitrary[String]
    description <- someBiasedOption(textGen(descWordGen))
    issued <- someBiasedOption(offsetDateTimeGen())
    modified <- someBiasedOption(offsetDateTimeGen())
    language <- someBiasedOption(arbitrary[String])
    publisher <- someBiasedOption(agentGen(publisherGen.flatMap(Gen.oneOf(_))))
    accrualPeriodicity <- someBiasedOption(periodicityGen)
    spatial <- noneBiasedOption(locationGen)
    temporal <- someBiasedOption(periodOfTimeGen)
    theme <- Gen.listOf(arbitrary[String])
    keyword <- Gen.listOf(arbitrary[String])
    contactPoint <- someBiasedOption(agentGen(arbitrary[String]))
    distributions <- Gen.choose(1, 5).flatMap(size => Gen.listOfN(size, distGen)) //.map(_.groupBy(_.format).mapValues(_.head).values.toList)//.map(distributions => distributions.map(_.copy(format = distributions.head.format)))
    landingPage <- someBiasedOption(arbitrary[String])
  } yield DataSet(
    identifier = identifier.toString,
    catalog = catalog,
    title = title,
    description = description,
    issued = issued,
    modified = modified,
    language = language,
    publisher = publisher,
    accrualPeriodicity = accrualPeriodicity,
    spatial = spatial,
    temporal = temporal,
    theme = theme,
    keyword = keyword,
    contactPoint = contactPoint,
    distributions = distributions,
    landingPage = landingPage
  )
}