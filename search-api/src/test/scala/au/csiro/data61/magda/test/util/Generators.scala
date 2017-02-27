package au.csiro.data61.magda.test.util

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
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchIndexer
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchIndexer
import java.util.concurrent.atomic.AtomicInteger

import akka.http.scaladsl.server.Route
import au.csiro.data61.magda.api.Query
import au.csiro.data61.magda.util.Regex._
import org.scalacheck.Shrink.shrink
import au.csiro.data61.magda.spatial.RegionSource
import spray.json.JsObject
import java.net.URL
import spray.json._
import au.csiro.data61.magda.model.misc.Protocols._
import com.vividsolutions.jts.geom.GeometryFactory
import com.monsanto.labs.mwundo.GeoJson._
import au.csiro.data61.magda.util.MwundoJTSConversions._
import au.csiro.data61.magda.api.Specified
import au.csiro.data61.magda.api.Unspecified
import au.csiro.data61.magda.api.FilterValue
import com.typesafe.config.Config

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

  val INDEXED_REGIONS_COUNT = 12
  val indexedRegionsGen = cachedListGen(regionGen, INDEXED_REGIONS_COUNT)

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
    landingPage = landingPage,
    years = ElasticSearchIndexer.getYears(temporal.flatMap(_.start.flatMap(_.date)), temporal.flatMap(_.end.flatMap(_.date)))
  )

  val queryTextGen = descWordGen.flatMap(descWords => Gen.choose(1, 5).flatMap(size => Gen.pick(size, descWords))).map(_.mkString(" "))
  def unspecifiedGen(implicit config: Config) = Gen.const(Unspecified())
  def filterValueGen[T](innerGen: Gen[T])(implicit config: Config): Gen[FilterValue[T]] = Gen.frequency((3, innerGen.map(Specified.apply)), (1, unspecifiedGen))

  def set[T](gen: Gen[T]): Gen[Set[T]] = Gen.containerOf[Set, T](gen)
  def probablyEmptySet[T](gen: Gen[T]): Gen[Set[T]] = Gen.frequency((1, Gen.nonEmptyContainerOf[Set, T](gen)), (3, Gen.const(Set())))
  def smallSet[T](gen: Gen[T]): Gen[Set[T]] = probablyEmptySet(gen).flatMap(set => Gen.pick(set.size % 3, set)).map(_.toSet)

  val partialFormatGen = formatGen.map(_._2).flatMap(format => Gen.choose(format.length / 2, format.length).map(length => format.substring(Math.min(format.length - 1, length))))
  val formatQueryGenInner = Gen.frequency((5, formatGen.map(_._2)), (3, partialFormatGen), (1, nonEmptyString))
    .suchThat(word => !filterWords.contains(word.toLowerCase))
  def formatQueryGen(implicit config: Config) = filterValueGen(formatQueryGenInner)

  val partialPublisherGen = publisherGen.flatMap(Gen.oneOf(_)).flatMap { publisher =>
    Gen.choose(publisher.length / 2, publisher.length).map(length => publisher.substring(Math.min(publisher.length - 1, length)))
  }

  val filterWords = Set("in", "to", "as", "by", "from")

  val specifiedPublisherQueryGen = Gen.frequency((5, publisherGen.flatMap(Gen.oneOf(_))), (3, partialPublisherGen), (1, nonEmptyString))
    .suchThat(word => !filterWords.contains(word.toLowerCase))
  def publisherQueryGen(implicit config: Config): Gen[FilterValue[String]] = filterValueGen(specifiedPublisherQueryGen)
  def innerRegionQueryGen(implicit config: Config): Gen[Region] = indexedRegionsGen.flatMap(Gen.oneOf(_)).map {
    case (regionSource, regionObject) => Region(regionJsonToQueryRegion(regionSource, regionObject))
  }
  def regionQueryGen(implicit config: Config) = filterValueGen(innerRegionQueryGen)

  def regionJsonToQueryRegion(regionSource: RegionSource, regionObject: JsObject): QueryRegion = QueryRegion(
    regionType = regionSource.name,
    regionId = regionObject.fields("properties").asJsObject.fields(regionSource.idProperty).asInstanceOf[JsString].value
  )

  def dateFromGen(implicit config: Config) = filterValueGen(periodOfTimeGen.map(_.start.flatMap(_.date)).suchThat(_.isDefined).map(_.get))
  def dateToGen(implicit config: Config) = filterValueGen(periodOfTimeGen.map(_.end.flatMap(_.date)).suchThat(_.isDefined).map(_.get))

  def queryGen(implicit config: Config) = (for {
    freeText <- Gen.option(queryTextGen)
    quotes <- probablyEmptySet(queryTextGen)
    publishers <- probablyEmptySet(publisherQueryGen)
    dateFrom <- Gen.option(dateToGen)
    dateTo <- Gen.option(dateFromGen)
    formats <- probablyEmptySet(formatQueryGen)
    regions <- probablyEmptySet(regionQueryGen)
  } yield Query(
    freeText = freeText,
    quotes = quotes,
    publishers = publishers,
    dateFrom = dateFrom,
    dateTo = dateTo,
    formats = formats,
    regions = regions
  )) //.map(removeInvalid)

  def exactQueryGen(implicit config: Config) = (for {
    freeText <- Gen.option(queryTextGen)
    quotes <- probablyEmptySet(queryTextGen)
    publishers <- publisherGen.flatMap(Gen.someOf(_)).map(_.map(Specified(_).asInstanceOf[FilterValue[String]]).toSet)
    dateFrom <- Gen.option(dateFromGen)
    dateTo <- Gen.option(dateToGen)
    formats <- probablyEmptySet(formatGen.map(formatTuple => Specified(formatTuple._2).asInstanceOf[FilterValue[String]]))
    regions <- probablyEmptySet(regionQueryGen)
  } yield Query(
    freeText = freeText,
    quotes = quotes,
    publishers = publishers,
    dateFrom = dateFrom,
    dateTo = dateTo,
    formats = formats,
    regions = regions
  )) //.map(removeInvalid)

  val specificBiasedQueryGen = (for {
    publishers <- Gen.nonEmptyContainerOf[Set, FilterValue[String]](publisherGen.flatMap(Gen.oneOf(_)).map(Specified.apply))
    formats <- Gen.nonEmptyContainerOf[Set, FilterValue[String]](formatGen.map(x => Specified(x._2)))
  } yield Query(
    freeText = Some("*"),
    publishers = publishers,
    formats = formats
  )) //.map(removeInvalid)

  def unspecificQueryGen(implicit config: Config) = (for {
    freeText <- noneBiasedOption(queryTextGen)
    quotes <- smallSet(queryTextGen)
    publishers <- smallSet(publisherQueryGen)
    dateFrom <- noneBiasedOption(dateFromGen)
    dateTo <- noneBiasedOption(dateToGen)
    formats <- smallSet(formatQueryGen)
    regions <- smallSet(regionQueryGen)
  } yield Query(
    freeText = freeText,
    quotes = quotes,
    publishers = publishers,
    dateFrom = dateFrom,
    dateTo = dateTo,
    formats = formats,
    regions = regions
  ))
    .flatMap(query => if (query.equals(Query())) for { freeText <- queryTextGen } yield Query(Some(freeText)) else Gen.const(query))

  def textQueryGen(queryGen: Gen[Query])(implicit config: Config): Gen[(String, Query)] = queryGen.flatMap { query =>
    val textListComponents = (Seq(query.freeText).flatten ++
      query.quotes.map(""""""" + _ + """"""")).toSet

    val facetListGen = for {
      by <- randomCaseGen("by")
      from <- randomCaseGen("from")
      to <- randomCaseGen("to")
      as <- randomCaseGen("as")
      in <- randomCaseGen("in")
    } yield query.publishers.map(publisher => s"$by $publisher") ++
      Seq(query.dateFrom.map(dateFrom => s"$from $dateFrom")).flatten ++
      Seq(query.dateTo.map(dateTo => s"$to $dateTo")).flatten ++
      query.formats.map(format => s"$as $format") ++
      query.regions.map(region => s"$in ${region.map(_.queryRegion)}")

    val textQuery = for {
      textList <- Gen.pick(textListComponents.size, textListComponents)
      facetList <- facetListGen
      randomFacetList <- Gen.pick(facetList.size, facetList)
    } yield (textList ++ randomFacetList).mkString(" ")

    textQuery.flatMap((_, query))
  }

  def randomCaseGen(string: String) = for {
    whatToDo <- Gen.listOfN(string.length, Gen.chooseNum(0, 2))
  } yield string.zip(whatToDo).map {
    case (char, charWhatToDo) => charWhatToDo match {
      case 0 => char.toUpper
      case 1 => char.toLower
      case 2 => char
    }
  }.mkString

}