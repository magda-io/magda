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
import org.locationtech.spatial4j.shape.jts.JtsGeometry
import org.locationtech.spatial4j.context.jts.JtsSpatialContext
import scala.annotation.tailrec

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


  val filterWords = Set("in", "to", "as", "by", "from")
  val filterWordsWithSpace = filterWords.map(_ + " ")

  val alphaNumRegex = ".*[a-zA-Z0-9].*".r
  
  // TODO: It'd be really cool to have arbitrary characters in here but some of them mess up ES for some
  // reason - if there's time later on it'd be good to find out exactly what ES can accept because
  // right now we're only testing english characters.
  val textCharGen = Gen.frequency((9, Gen.alphaNumChar), (1, Gen.oneOf('-', '.', ' ', ''')))

  val nonEmptyTextGen = for {
    before <- listSizeBetween(0, 50, textCharGen).map(_.mkString)
    middle <- Gen.alphaNumChar
    after <- listSizeBetween(0, 50, textCharGen).map(_.mkString)
  } yield (before + middle.toString + after)
  val textGen = Gen.frequency((15, nonEmptyTextGen), (1, Gen.const("")))

  def apiDateGen(start: Instant, end: Instant) = for {
    date <- someBiasedOption(offsetDateTimeGen(start, end))
    text <- if (date.isDefined) Gen.const(date.get.toString) else arbitrary[String].map(_.take(50))
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
    homePage <- someBiasedOption(arbitrary[String].map(_.take(50)))
    email <- someBiasedOption(arbitrary[String].map(_.take(50)))
  } yield new Agent(name, homePage, email)

  val durationGen = for {
    number <- Gen.chooseNum(0l, 100l)
    unit <- Gen.oneOf(ChronoUnit.DAYS, ChronoUnit.HOURS, ChronoUnit.MINUTES)
  } yield Duration.of(number, unit)

  val periodicityGen = for {
    text <- someBiasedOption(arbitrary[String].map(_.take(50)))
    duration <- someBiasedOption(durationGen)
  } yield Periodicity(text, duration)

  // We don't want our shapes to overlap the dateline or ES fixes them
  def longGen(min: Double = -89, max: Double = 89) = Gen.chooseNum(min, max).map(BigDecimal.apply)
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
    name <- Gen.uuid.map(_.toString)
    idProperty <- nonEmptyTextGen
    nameProperty <- nonEmptyTextGen
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
    @tailrec
    def generate(list: List[T]): List[T] = {

      //      println("size " + list.size + "/" + max)
      if (list.size >= size) {
        list
      } else {
        generate(gen.sample.toList ++ list)
      }
    }

    generate(Nil)
  }

  val regionSourceGen = cachedListGen(regionSourceGenInner, 3)

  def regionGen(thisGeometryGen: Gen[Geometry]) = for {
    regionSource <- regionSourceGen.flatMap(Gen.oneOf(_))
    id <- Gen.uuid.map(_.toString)
    name <- textGen
    geometry <- thisGeometryGen
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

  def polygonGenInner(thisCoordGen: Gen[Coordinate] = coordGen(), max: Int) =
    listSizeBetween(4, max, thisCoordGen)
      .map { coords =>
        LineString(coords).toJTSGeo().convexHull()
      }
      .suchThat(_.getCoordinates.length > 3)
      .map {
        _.fromJTSGeo() match {
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
          .suchThat(coord => jts.contains(Point(coord).toJTSGeo)),
        max
      ).suchThat(hole => jts.contains(Polygon(Seq(hole)).toJTSGeo()))
    )

    holeGen.map { holes =>
      Polygon(shell +: holes)
    }
  }

  def multiPolygonStringGen(max: Int, thisCoordGen: Gen[Coordinate] = coordGen()) =
    Gen.chooseNum(1, 3).flatMap(Gen.listOfN(_, polygonStringGen(max, thisCoordGen).map(_.coordinates)))
      .map(MultiPolygon.apply)

  def geometryGen(max: Int, thisCoordGen: Gen[Coordinate]) = Gen.oneOf(
    pointGen(thisCoordGen),
    multiPointGen(max, thisCoordGen),
    lineStringGen(max, thisCoordGen),
    multiLineStringGen(max, thisCoordGen),
    polygonStringGen(max, thisCoordGen),
    multiPolygonStringGen(max, thisCoordGen)
  ).suchThat { geometry =>
      // Validate the geometry using the same code that ES uses - this means that if ES rejects a geometry we know
      // it's because we've done something stupid to it in our code before it got indexed, and it's not the generators'
      // fault

      Try {
        new JtsGeometry(geometry.toJTSGeo, JtsSpatialContext.GEO, false, false).validate()
      }.isSuccess
    }

  def locationGen(geometryGen: Gen[Geometry]) = for {
    text <- someBiasedOption(textGen)
    geoJson <- someBiasedOption(geometryGen)
  } yield new Location(text, geoJson)

  def cachedListGen[T](gen: Gen[T], size: Int) = {
    var cache: Option[List[T]] = None

    Gen.delay {
      cache match {
        case Some(cacheInner) =>
          Gen.const(cacheInner)
        case None =>
          listSizeBetween(size, size, gen).map { words =>
            cache = Some(words)
            words
          }
      }
    }
  }

  val descWordGen = cachedListGen(nonEmptyTextGen.map(_.take(50)), 1000)
  val publisherGen = cachedListGen(listSizeBetween(1, 4, nonEmptyTextGen.map(_.take(50))).map(_.mkString(" ")), 50)
  val mediaTypeGen = Gen.oneOf(Seq(
    MediaTypes.`application/json`,
    MediaTypes.`application/vnd.google-earth.kml+xml`,
    MediaTypes.`text/csv`,
    MediaTypes.`application/json`,
    MediaTypes.`application/octet-stream`
  ))
  val randomFormatGen = cachedListGen(nonEmptyTextGen, 50)

  def textGen(inner: Gen[List[String]]) = inner
    .flatMap(list => Gen.choose(0, Math.min(100, list.length)).map((_, list)))
    .flatMap(tuple => Gen.pick(tuple._1, tuple._2))
    .map {
      case Nil => ""
      case seq => seq.reduce(_ + " " + _)
    }

  val licenseGen = for {
    name <- someBiasedOption(arbitrary[String].map(_.take(50)))
    url <- someBiasedOption(arbitrary[String].map(_.take(50)))
  } yield License(name, url)

  val formatGen = for {
    mediaType <- Gen.option(mediaTypeGen)
    randomFormat <- randomFormatGen.flatMap(Gen.oneOf(_))
  } yield (mediaType, mediaType.flatMap(_.fileExtensions.headOption).getOrElse(randomFormat))

  val distGen = for {
    title <- nonEmptyTextGen
    description <- someBiasedOption(nonEmptyTextGen)
    issued <- someBiasedOption(offsetDateTimeGen())
    modified <- someBiasedOption(offsetDateTimeGen())
    license <- someBiasedOption(licenseGen)
    rights <- someBiasedOption(arbitrary[String].map(_.take(50)))
    accessURL <- someBiasedOption(arbitrary[String].map(_.take(50)))
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
    title <- someBiasedOption(textGen.map(_.take(100)))
    description <- someBiasedOption(textGen(descWordGen))
    issued <- someBiasedOption(offsetDateTimeGen())
    modified <- someBiasedOption(offsetDateTimeGen())
    language <- someBiasedOption(arbitrary[String].map(_.take(50)))
    publisher <- someBiasedOption(agentGen(publisherGen.flatMap(Gen.oneOf(_))))
    accrualPeriodicity <- someBiasedOption(periodicityGen)
    spatial <- noneBiasedOption(locationGen(geometryGen(6, coordGen())))
    temporal <- someBiasedOption(periodOfTimeGen)
    theme <- Gen.listOf(nonEmptyTextGen)
    keyword <- Gen.listOf(nonEmptyTextGen)
    contactPoint <- someBiasedOption(agentGen(arbitrary[String].map(_.take(50))))
    distributions <- listSizeBetween(1, 5, distGen)
    landingPage <- someBiasedOption(arbitrary[String].map(_.take(50)))
  } yield DataSet(
    identifier = identifier.toString,
    catalog = "test-catalog",
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