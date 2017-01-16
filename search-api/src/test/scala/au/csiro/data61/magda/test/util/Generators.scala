package au.csiro.data61.magda.test.util

import java.time.Duration
import java.time.temporal.ChronoUnit

import org.scalacheck.Gen
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

object Generators {
  def biasedOption[T](inner: Gen[T]) = Gen.frequency((4, Gen.some(inner)), (1, None))

  val keyGen = arbitrary[String].suchThat(!_.contains("."))

  val offsetDateTimeGen = for {
    dateTime <- genDateTimeWithinRange(ZonedDateTime.parse("1900-01-01T00:00:00Z"), Duration.ofDays(100 * 365))
    offsetHours <- Gen.chooseNum(-17, 17)
    offsetMinutes <- Gen.chooseNum(0, 59).map(_ * offsetHours.signum)
    offsetSeconds <- Gen.chooseNum(0, 59).map(_ * offsetHours.signum)
  } yield dateTime.toInstant().atOffset(
    ZoneOffset.ofHoursMinutesSeconds(offsetHours, offsetMinutes, offsetSeconds))

  val agentGen = for {
    name <- biasedOption(arbitrary[String])
    homePage <- biasedOption(arbitrary[String])
    email <- biasedOption(arbitrary[String])
    extraFields <- Gen.mapOf(Gen.zip(keyGen, arbitrary[String]))
  } yield new Agent(name, homePage, email, extraFields)

  val durationGen = for {
    number <- Gen.chooseNum(0l, 100l)
    unit <- Gen.oneOf(ChronoUnit.DAYS, ChronoUnit.HOURS, ChronoUnit.MINUTES)
  } yield Duration.of(number, unit)

  val periodicityGen = for {
    text <- biasedOption(arbitrary[String])
    duration <- biasedOption(durationGen)
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

  val gf = new geom.GeometryFactory()
  implicit def buildJTSPolygon(polygon: Polygon) = {
    val coords = polygon.coordinates.flatten.map(x => new geom.Coordinate(x.x.toDouble, x.y.toDouble))
    val lr = gf.createLinearRing(coords.toArray)
    gf.createPolygon(lr, Array())
  }
  implicit def buildJTSMultiPolygon(multiPolygon: MultiPolygon) = {
    gf.createMultiPolygon(multiPolygon.coordinates.map(x => buildJTSPolygon(Polygon(x))).toArray)
  }

  def listSizeBetween[T](min: Int, max: Int, gen: Gen[T]) = Gen.chooseNum(min, max)
    .flatMap(x => Gen.listOfN(x, gen))

  val pointGen = coordGen.map(Point.apply)
  val multiPointGen = Gen.nonEmptyListOf(coordGen).map(MultiPoint.apply)
  val lineStringGenInner = nonConsecutiveDuplicates(2, 5, coordGen)
  val lineStringGen = lineStringGenInner.map(LineString.apply)
  val multiLineStringGen = listSizeBetween(1, 10, lineStringGenInner)
    .map(MultiLineString.apply)
  val polygonGenInner = listSizeBetween(3, 10, Gen.zip(Gen.choose(10, 90)))
    .map(_.sorted)
    .map(list => list.zipWithIndex.map {
      case (hypotenuse, index) =>
        val angle = (Math.PI / list.size) * (index + 1)
        Coordinate(hypotenuse * Math.cos(angle), hypotenuse * Math.sin(angle))
    })
    .map(x => x :+ x.head)
  val polygonStringGen = Gen.listOfN(1, polygonGenInner) // FIXME: Do we need a hole generator?
    .map(Polygon.apply)
  val multiPolygonStringGen =
    Gen.chooseNum(1, 5).flatMap(Gen.listOfN(_, polygonStringGen.map(_.coordinates)))
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
    text <- biasedOption(arbitrary[String])
    geoJson <- biasedOption(geometryGen)
  } yield new Location(text, geoJson)

  val dataSetGen = for {
    identifier <- Gen.numStr
    catalog <- arbitrary[String]
    title <- biasedOption(arbitrary[String])
    description <- biasedOption(arbitrary[String])
    issued <- biasedOption(offsetDateTimeGen)
    modified <- biasedOption(offsetDateTimeGen)
    language <- biasedOption(arbitrary[String])
    publisher <- biasedOption(agentGen)
    accrualPeriodicity <- biasedOption(periodicityGen)
    spatial <- biasedOption(locationGen)
  } yield DataSet(
    identifier = identifier,
    catalog = catalog,
    title = title,
    description = description,
    issued = issued,
    modified = modified,
    language = language,
    publisher = publisher,
    accrualPeriodicity = accrualPeriodicity,
    spatial = spatial
  )

  val dataSetListGen = Gen.listOf(dataSetGen)
}