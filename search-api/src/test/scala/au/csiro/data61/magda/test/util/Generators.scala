package au.csiro.data61.magda.test.util

import java.time.Duration
import java.time.temporal.ChronoUnit

import org.scalacheck.Gen
import org.scalacheck.Gen.Choose._

import com.monsanto.labs.mwundo.GeoJson._

import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.model.temporal._
import java.time.ZonedDateTime
import com.fortysevendeg.scalacheck.datetime.instances.jdk8._
import com.fortysevendeg.scalacheck.datetime.GenDateTime.genDateTimeWithinRange
import java.time.ZoneOffset

object Generators {
  def alphaStrNonEmpty: Gen[String] =
    Gen.nonEmptyListOf(Gen.alphaChar).map(_.mkString)

  val calendarGen = Gen.calendar

  val offsetDateTimeGen = for {
    dateTime <- genDateTimeWithinRange(ZonedDateTime.parse("1900-01-01T00:00:00Z"), Duration.ofDays(100 * 365))
    offsetHours <- Gen.chooseNum(-17, 17)
    offsetMinutes <- Gen.chooseNum(0, 59).map(_ * offsetHours.signum)
    offsetSeconds <- Gen.chooseNum(0, 59).map(_ * offsetHours.signum)
  } yield dateTime.toInstant().atOffset(
    ZoneOffset.ofHoursMinutesSeconds(offsetHours, offsetMinutes, offsetSeconds))

  val agentGen = for {
    name <- Gen.option(Gen.alphaStr)
    homePage <- Gen.option(Gen.alphaStr)
    email <- Gen.option(Gen.alphaStr)
    extraFields <- Gen.mapOf(Gen.zip(Gen.alphaStr, Gen.alphaStr))
  } yield new Agent(name, homePage, email, extraFields)

  val durationGen = for {
    number <- Gen.chooseNum(0l, 100l)
    unit <- Gen.oneOf(ChronoUnit.DAYS, ChronoUnit.HOURS, ChronoUnit.MINUTES)
  } yield Duration.of(number, unit)

  val periodicityGen = for {
    text <- Gen.option(Gen.alphaStr)
    duration <- Gen.option(durationGen)
  } yield Periodicity(text, duration)

  val coordBigDecimalGen =
    Gen.chooseNum(0d, 359d).map(BigDecimal.apply)

  val coordGen = for {
    x <- coordBigDecimalGen
    y <- coordBigDecimalGen
  } yield Coordinate(x, y)

  val pointGen = coordGen.map(Point.apply)
  val multiPointGen = Gen.nonEmptyListOf(coordGen).map(MultiPoint.apply)
  val lineStringGen = Gen.nonEmptyListOf(coordGen).map(LineString.apply)
  val multiLineStringGen = Gen.nonEmptyListOf(Gen.nonEmptyListOf(coordGen))
    .map(MultiLineString.apply)
  val polygonStringGen = Gen.nonEmptyListOf(Gen.nonEmptyListOf(coordGen)
    .map(sortClockwise))
    .map(Polygon.apply)
  val multiPolygonStringGen = Gen.nonEmptyListOf(Gen.nonEmptyListOf(Gen.nonEmptyListOf(coordGen)
    .map(sortClockwise)))
    .map(MultiPolygon.apply)

  val geometryGen = Gen.oneOf(
    pointGen,
    multiPointGen,
    lineStringGen,
    multiLineStringGen,
    polygonStringGen,
    multiPolygonStringGen
  )

  val locationGen = for {
    text <- Gen.option(Gen.alphaStr)
    geoJson <- Gen.option(geometryGen)
  } yield new Location(text, geoJson)

  val dataSetGen = for {
    identifier <- Gen.listOf(Gen.choose(0.toChar, 5000.toChar)).map(_.mkString)
    catalog <- Gen.alphaStr
    title <- Gen.option(Gen.alphaStr)
    description <- Gen.option(Gen.alphaStr)
    issued <- Gen.option(offsetDateTimeGen)
    modified <- Gen.option(offsetDateTimeGen)
    language <- Gen.option(Gen.alphaStr)
    publisher <- Gen.option(Gen.alphaStr)
    accrualPeriodicity <- Gen.option(periodicityGen)
    spatial <- locationGen
  } yield DataSet(
    identifier = identifier,
    catalog = catalog,
    title = title,
    description = description,
    issued = issued,
    modified = modified,
    language = language
  )

  val dataSetListGen = Gen.listOf(dataSetGen)

  def findCentre(points: Seq[Coordinate]) = {
    val cartesians = points
      .map(coord => (Math.toRadians(coord.x.toDouble), Math.toRadians(coord.y.toDouble)))
      .map {
        case (x, y) => (
          Math.cos(x) * Math.cos(y),
          Math.cos(x) * Math.sin(y),
          Math.sin(y)
        )
      }

    val (sumX, sumY, sumZ) = cartesians.reduce((a, b) => (a._1 + b._1, a._2 + b._2, a._3 + b._3))
    val number = cartesians.size
    val (avgX, avgY, avgZ) = (sumX / number, sumY / number, sumZ / number)

    val lon = Math.atan2(avgY, avgX)
    val hyp = Math.sqrt(avgX * avgX + avgY * avgY)
    val lat = Math.atan2(avgZ, hyp)

    new Coordinate(lat.toDegrees, lon.toDegrees)
  }

  def sortClockwise(points: Seq[Coordinate]) = {
    val center = findCentre(points)

    points.sortWith { (a, b) =>
      if (a.x - center.x >= 0 && b.x - center.x < 0)
        true;
      if (a.x - center.x < 0 && b.x - center.x >= 0)
        false;
      if (a.x - center.x == 0 && b.x - center.x == 0) {
        if (a.y - center.y >= 0 || b.y - center.y >= 0)
          a.y > b.y;
        b.y > a.y;
      } else {
        // compute the cross product of vectors (center -> a) x (center -> b)
        val det = (a.x - center.x) * (b.y - center.y) - (b.x - center.x) * (a.y - center.y);
        if (det < 0)
          true;
        if (det > 0)
          false;

        // points a and b are on the same line from the center
        // check which point is closer to the center
        val d1 = (a.x - center.x) * (a.x - center.x) + (a.y - center.y) * (a.y - center.y);
        val d2 = (b.x - center.x) * (b.x - center.x) + (b.y - center.y) * (b.y - center.y);
        d1 > d2;
      }
    }
  }
}