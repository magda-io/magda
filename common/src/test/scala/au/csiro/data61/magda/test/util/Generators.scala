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
import com.vividsolutions.jts.geom
import com.monsanto.labs.mwundo.GeoJson._
import au.csiro.data61.magda.util.MwundoJTSConversions._
import com.typesafe.config.Config
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.model.temporal._
import au.csiro.data61.magda.model.misc.Protocols._
import scala.util.Try

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

  def longGen(min: Double = -180, max: Double = 180) = Gen.chooseNum(min, max).map(BigDecimal.apply)
  def latGen(min: Double = -90, max: Double = 90) = Gen.chooseNum(min, max).map(BigDecimal.apply)

  def coordGen(xGen: Gen[BigDecimal] = longGen(), yGen: Gen[BigDecimal] = latGen()) = for {
    x <- xGen
    y <- yGen
  } yield Coordinate(x, y)

  def nonConsecutiveDuplicates[T](min: Int, max: Int, gen: Gen[T]) =
    listSizeBetween(min, max, gen)
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

  def nonEmptyListOf[T](gen: Gen[T]) = Gen.size.flatMap { maybeZeroSize =>
    val size = Math.max(maybeZeroSize, 1)
    listSizeBetween(1, size, gen)
  }

  def listSizeBetween[T](min: Int, max: Int, gen: Gen[T]) = Gen.chooseNum(min, max).map { size =>
    (for { i <- 1 to size } yield gen.sample).flatten
  }.suchThat(_.size > min)

  val regionSourceGen = cachedListGen(regionSourceGenInner, 3)

  def regionGen(max: Int) = for {
    regionSource <- regionSourceGen.flatMap(Gen.oneOf(_))
    id <- Gen.nonEmptyListOf(Gen.alphaNumChar).map(_.mkString.take(500))
    name <- Gen.alphaNumStr
    geometry <- geometryGen(max)
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

  def pointGen(thisCoordGen: Gen[Coordinate] = coordGen()) = thisCoordGen.map(Point.apply)
  def multiPointGen(max: Int, thisCoordGen: Gen[Coordinate] = coordGen()) = listSizeBetween(1, max, thisCoordGen).map(MultiPoint.apply)
  def lineStringGenInner(max: Int, thisCoordGen: Gen[Coordinate] = coordGen()) = nonConsecutiveDuplicates(2, max, thisCoordGen)
  def lineStringGen(max: Int, thisCoordGen: Gen[Coordinate] = coordGen()) = lineStringGenInner(max, thisCoordGen).map(LineString.apply)
  def multiLineStringGen(max: Int, thisCoordGen: Gen[Coordinate] = coordGen()) = listSizeBetween(1, max, lineStringGenInner(max, thisCoordGen))
    .map(MultiLineString.apply)
  //  def polygonGenInner(thisCoordGen: Gen[Coordinate] = coordGen(), max: Int) =
  //    listSizeBetween(3, max, Gen.zip(Gen.choose(1, 90)))
  //      .map(_.sorted)
  //      .map(list => list.zipWithIndex.map {
  //        case (hypotenuse, index) =>
  //          val angle = (Math.PI / list.size) * (index + 1)
  //          Coordinate(hypotenuse * Math.cos(angle), hypotenuse * Math.sin(angle))
  //      })
  //      .map(x => (x :+ x.head))
  def polygonGenInner(thisCoordGen: Gen[Coordinate] = coordGen(), max: Int) =
    listSizeBetween(4, max, thisCoordGen)
      .map { coords =>
        LineString(coords).toJTSGeo().convexHull().fromJTSGeo() match {
          case Polygon(Seq(innerSeq)) => innerSeq
          case LineString(innerSeq)   => innerSeq :+ innerSeq.head
        }
      }

  def polygonStringGen(max: Int, thisCoordGen: Gen[Coordinate] = coordGen()) = polygonGenInner(thisCoordGen, max).flatMap { shell =>
    val jts = Polygon(Seq(shell)).toJTSGeo
    val envelope = jts.getEnvelopeInternal
    val holeGen = listSizeBetween(0, 500,
      polygonGenInner(
        coordGen(longGen(envelope.getMinX, envelope.getMaxX), latGen(envelope.getMinY, envelope.getMaxY))
          .suchThat(coord => jts.contains(Point(coord).toJTSGeo)), max).suchThat(hole => Polygon(Seq(hole)).toJTSGeo().coveredBy(jts))
    )

    holeGen.map { holes =>
      //      println(holes)
      Polygon(shell +: holes)
    }
  }

  def multiPolygonStringGen(max: Int, thisCoordGen: Gen[Coordinate] = coordGen()) =
    Gen.chooseNum(1, 3).flatMap(Gen.listOfN(_, polygonStringGen(max, thisCoordGen).map(_.coordinates)))
      .map(MultiPolygon.apply)

  def geometryGen(max: Int) = Gen.oneOf(
    pointGen(),
    multiPointGen(max),
    lineStringGen(max),
    multiLineStringGen(max),
    polygonStringGen(max),
    multiPolygonStringGen(max)
  ).suchThat(geometry => Try(geometry.toJTSGeo).map(_.isValid).getOrElse(false))

  def locationGen(max: Int) = for {
    text <- someBiasedOption(Gen.alphaNumStr)
    geoJson <- someBiasedOption(geometryGen(max))
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
    spatial <- noneBiasedOption(locationGen(6))
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