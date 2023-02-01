package au.csiro.data61.magda.test.util

import java.net.URL
import java.time.{Duration, Instant, ZoneOffset, ZonedDateTime}
import java.time.temporal.ChronoUnit
import java.util.concurrent.atomic.AtomicInteger

import akka.http.scaladsl.model.MediaTypes
import au.csiro.data61.magda.model.Temporal._
import au.csiro.data61.magda.model.misc.Protocols._
import au.csiro.data61.magda.model.misc.{DataSet, _}
import au.csiro.data61.magda.model.Registry.MAGDA_ADMIN_PORTAL_ID
import au.csiro.data61.magda.spatial.RegionSource
import au.csiro.data61.magda.util.MwundoJTSConversions._
import com.monsanto.labs.mwundo.GeoJson._
import org.locationtech.spatial4j.context.jts.JtsSpatialContext
import org.locationtech.spatial4j.shape.jts.JtsGeometry
import org.scalacheck.Arbitrary._
import org.scalacheck.Gen
import org.scalacheck.Gen.Choose._
import org.scalacheck.Gen.const
import spray.json.{JsObject, _}

import scala.annotation.tailrec
import scala.collection.mutable
import scala.util.Try

object Generators {

  def someBiasedOption[T](inner: Gen[T]) =
    Gen.frequency((4, Gen.some(inner)), (1, None))

  def noneBiasedOption[T](inner: Gen[T]) =
    Gen.frequency((1, Gen.some(inner)), (20, None))

  val defaultStartTime = ZonedDateTime.parse("1850-01-01T00:00:00Z").toInstant

  val defaultTightStartTime =
    ZonedDateTime.parse("2000-01-01T00:00:00Z").toInstant
  val defaultEndTime = ZonedDateTime.parse("2020-01-01T00:00:00Z").toInstant

  val defaultTightEndTime =
    ZonedDateTime.parse("2015-01-01T00:00:00Z").toInstant

  // TODO: It'd be really cool to have arbitrary characters in here but some of them mess up ES for some
  // reason - if there's time later on it'd be good to find out exactly what ES can accept because
  // right now we're only testing english characters.
  val textCharGen =
    Gen.frequency((9, Gen.alphaNumChar), (1, Gen.oneOf('-', '.', '\'', ' ')))

  val nonEmptyTextGen = for {
    before <- listSizeBetween(0, 50, textCharGen).map(_.mkString.trim)
    middle <- Gen.alphaNumChar
    after <- listSizeBetween(0, 50, textCharGen).map(_.mkString.trim)
  } yield (before + middle.toString + after)

  // See StandardAnalyzer.ENGLISH_STOP_WORDS_SET
  // Why not just link this in directly? There's some horrible thing going on with how lucene is
  // compiled that turns all the strings to some weird type that can't be understood.
  val luceneStopWords = Seq(
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "but",
    "by",
    "for",
    "if",
    "in",
    "into",
    "is",
    "it",
    "no",
    "not",
    "of",
    "on",
    "or",
    "such",
    "that",
    "the",
    "their",
    "then",
    "there",
    "these",
    "they",
    "this",
    "to",
    "was",
    "will",
    "with"
  )

  val stopWordRegex = s"(?i)(${luceneStopWords.mkString("|")})(\\s|$$)"
  def removeStopWords(s: String) = s.replaceAll(stopWordRegex, " ").trim

  val nonEmptyTextWithStopWordsGen =
    Gen.frequency((5, nonEmptyTextGen), (2, Gen.oneOf(luceneStopWords)))

  val textGen =
    Gen.frequency((15, nonEmptyTextWithStopWordsGen), (1, Gen.const("")))

  def smallSet[T](gen: Gen[T]): Gen[Set[T]] =
    listSizeBetween(1, 3, gen).map(_.toSet)

  def genInstant(start: Instant, end: Instant) =
    Gen
      .choose(start.toEpochMilli(), end.toEpochMilli())
      .flatMap(Instant.ofEpochMilli(_))

  def offsetDateTimeGen(
      start: Instant = defaultStartTime,
      end: Instant = defaultEndTime
  ) =
    for {
      dateTime <- genInstant(start, end)
      offsetHours <- Gen.chooseNum(-17, 17)
      offsetMinutes <- Gen.chooseNum(0, 59).map(_ * offsetHours.signum)
      offsetSeconds <- Gen.chooseNum(0, 59).map(_ * offsetHours.signum)
    } yield
      dateTime.atOffset(
        ZoneOffset
          .ofHoursMinutesSeconds(offsetHours, offsetMinutes, offsetSeconds)
      )

  val alphaNumRegex = ".*[a-zA-Z0-9].*".r

  def apiDateGen(start: Instant, end: Instant) =
    for {
      date <- someBiasedOption(offsetDateTimeGen(start, end))
      text <- if (date.isDefined) Gen.const(date.get.toString)
      else arbitrary[String].map(_.take(50).trim)
    } yield ApiDate(date, text)

  val periodOfTimeGen = (for {
    startTime <- Gen.frequency(
      (9, Gen.const(defaultTightStartTime)),
      (1, defaultStartTime)
    )
    endTime <- Gen.frequency(
      (9, Gen.const(defaultTightEndTime)),
      (1, defaultEndTime)
    )
    start <- someBiasedOption(apiDateGen(startTime, endTime))
    end <- someBiasedOption(
      apiDateGen(
        start
          .flatMap(_.date)
          .map(_.toInstant.plusMillis(1))
          .getOrElse(startTime.plusMillis(1)),
        endTime
      )
    )
  } yield new PeriodOfTime(start, end)).suchThat {
    case PeriodOfTime(
        Some(ApiDate(Some(start), _)),
        Some(ApiDate(Some(end), _))
        ) =>
      start.isBefore(end)
    case _ => true
  }

  def agentGen(nameGen: Gen[String]) =
    for {
      identifier <- Gen.uuid.map(_.toString).map(Some.apply)
      name <- nameGen.map(Some.apply)
      jurisdiction <- nameGen.map(Some.apply)
      website <- someBiasedOption(arbitrary[String].map(_.take(50).trim))
      email <- someBiasedOption(arbitrary[String].map(_.take(50).trim))
      phone <- someBiasedOption(arbitrary[String].map(_.take(50).trim))
      addrStreet <- someBiasedOption(arbitrary[String].map(_.take(50).trim))
      addrSuburb <- someBiasedOption(arbitrary[String].map(_.take(20).trim))
      addrState <- someBiasedOption(arbitrary[String].map(_.take(50).trim))
      addrPostCode <- someBiasedOption(arbitrary[String].map(_.take(6).trim))
      addrCountry <- someBiasedOption(arbitrary[String].map(_.take(10).trim))
      imageUrl <- someBiasedOption(arbitrary[String].map(_.take(50).trim))
    } yield
      new Agent(
        identifier = identifier,
        name = name,
        website = website,
        email = email,
        phone = phone,
        addrStreet = addrStreet,
        addrSuburb = addrSuburb,
        addrState = addrState,
        addrPostCode = addrPostCode,
        addrCountry = addrCountry,
        imageUrl = imageUrl
      )

  val durationGen = for {
    number <- Gen.chooseNum(0L, 100L)
    unit <- Gen.oneOf(ChronoUnit.DAYS, ChronoUnit.HOURS, ChronoUnit.MINUTES)
  } yield Duration.of(number, unit)

  val periodicityGen = for {
    text <- someBiasedOption(arbitrary[String].map(_.take(50).trim))
    duration <- someBiasedOption(durationGen)
  } yield Periodicity(text, duration)

  // We don't want our shapes to overlap the dateline or ES fixes them
  def longGen(min: Double = -89, max: Double = 89) =
    Gen.chooseNum(min, max)

  def latGen(min: Double = -90, max: Double = 90) =
    Gen.chooseNum(min, max)

  def coordGen(
      xGen: Gen[Double] = longGen(),
      yGen: Gen[Double] = latGen()
  ) =
    for {
      x <- xGen
      y <- yGen
    } yield Coordinate(x, y)

  def nonConsecutiveDuplicates[T](min: Int, max: Int, gen: Gen[T]) =
    listSizeBetween(min, max, gen)
      .suchThat(
        list =>
          list.sliding(2).forall {
            case Seq(before, after) => !before.equals(after)
          }
      )

  val regionSourceGenInner = for {
    name <- Gen.uuid.map(_.toString)
    idProperty <- nonEmptyTextGen
    nameProperty <- nonEmptyTextGen
    shortNameProperty <- noneBiasedOption(nonEmptyTextGen)
    includeIdInName <- arbitrary[Boolean]
    order <- Gen.posNum[Int]
  } yield
    RegionSource(
      name = name,
      url = new URL("http://example.com"),
      idProperty = idProperty,
      nameProperty = nameProperty,
      shortNameProperty = shortNameProperty,
      includeIdInName = includeIdInName,
      disabled = false,
      order = order
    )

  def nonEmptyListOf[T](gen: Gen[T]) = Gen.size.flatMap { maybeZeroSize =>
    val size = Math.max(maybeZeroSize, 1)
    listSizeBetween(1, size, gen)
  }

  def listSizeBetween[T](min: Int, max: Int, gen: Gen[T]) =
    Gen.chooseNum(min, max).map { size =>
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

  def cachedListGen[T](key: String, gen: Gen[T], size: Int)(
      inputCache: mutable.Map[String, List[_]] = new mutable.HashMap
  ) = {
    val cache: Option[List[T]] =
      inputCache.get(key).map(_.asInstanceOf[List[T]])

    Gen.delay {
      arbitrary[Boolean].flatMap(
        bool =>
          (bool, cache) match {
            case (_, None) | (false, _) =>
              Generators.listSizeBetween(size, size, gen).map { items =>
                inputCache.put(key, items)
                items
              }
            case (true, Some(cacheInner)) =>
              Gen.const(cacheInner)
          }
      )
    }
  }

  val regionSourceGen = cachedListGen("regionSource", regionSourceGenInner, 3)(
    mutable.HashMap.empty
  )

  def regionGen(thisGeometryGen: Gen[Geometry]) =
    for {
      regionSource <- regionSourceGen.flatMap(Gen.oneOf(_))
      id <- Gen.uuid.map(_.toString)
      name <- textGen
      shortName <- textGen
      geometry <- thisGeometryGen
      order <- Gen.posNum[Int]
    } yield
      (
        regionSource,
        JsObject(
          "type" -> JsString("Feature"),
          "geometry" -> GeometryFormat.write(geometry),
          "order" -> JsNumber(order),
          "properties" -> JsObject(
            Seq(
              regionSource.idProperty -> JsString(id),
              regionSource.nameProperty -> JsString(name)
            ) ++
              regionSource.shortNameProperty
                .map(_ -> JsString(shortName))
                .toSeq: _*
          )
        )
      )

  def pointGen(thisCoordGen: Gen[Coordinate] = coordGen()) =
    thisCoordGen.map(Point.apply)

  def multiPointGen(max: Int, thisCoordGen: Gen[Coordinate] = coordGen()) =
    listSizeBetween(1, max, thisCoordGen).map(MultiPoint.apply)

  def lineStringGenInner(max: Int, thisCoordGen: Gen[Coordinate] = coordGen()) =
    nonConsecutiveDuplicates(2, max, thisCoordGen)

  def lineStringGen(max: Int, thisCoordGen: Gen[Coordinate] = coordGen()) =
    lineStringGenInner(max, thisCoordGen).map(LineString.apply)

  def multiLineStringGen(max: Int, thisCoordGen: Gen[Coordinate] = coordGen()) =
    listSizeBetween(1, max, lineStringGenInner(max, thisCoordGen))
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

  def polygonStringGen(max: Int, thisCoordGen: Gen[Coordinate] = coordGen()) =
    polygonGenInner(thisCoordGen, max).flatMap { shell =>
      val jts = Polygon(Seq(shell)).toJTSGeo
      val envelope = jts.getEnvelopeInternal
      val holeGen = listSizeBetween(
        0,
        500,
        polygonGenInner(
          coordGen(
            longGen(envelope.getMinX, envelope.getMaxX),
            latGen(envelope.getMinY, envelope.getMaxY)
          ).suchThat(coord => jts.contains(Point(coord).toJTSGeo)),
          max
        ).suchThat(hole => jts.contains(Polygon(Seq(hole)).toJTSGeo()))
      )

      holeGen.map { holes =>
        Polygon(shell +: holes)
      }
    }

  def multiPolygonStringGen(
      max: Int,
      thisCoordGen: Gen[Coordinate] = coordGen()
  ) =
    Gen
      .chooseNum(1, 3)
      .flatMap(
        Gen.listOfN(_, polygonStringGen(max, thisCoordGen).map(_.coordinates))
      )
      .map(MultiPolygon.apply)

  def geometryGen(max: Int, thisCoordGen: Gen[Coordinate]) =
    Gen
      .oneOf(
        pointGen(thisCoordGen),
        multiPointGen(max, thisCoordGen),
        lineStringGen(max, thisCoordGen),
        multiLineStringGen(max, thisCoordGen),
        polygonStringGen(max, thisCoordGen),
        multiPolygonStringGen(max, thisCoordGen)
      )
      .suchThat { geometry =>
        // Validate the geometry using the same code that ES uses - this means that if ES rejects a geometry we know
        // it's because we've done something stupid to it in our code before it got indexed, and it's not the generators'
        // fault

        Try {
          new JtsGeometry(
            geometry.toJTSGeo,
            JtsSpatialContext.GEO,
            false,
            false
          ).validate()
        }.isSuccess
      }

  def locationGen(geometryGen: Gen[Geometry]) =
    for {
      geoJson <- someBiasedOption(geometryGen)
      shouldGenerateWKTString <- arbitrary[Boolean]
      shouldGenerateInvalidDecimals <- arbitrary[Boolean]
    } yield {
      val text = geoJson
        .map { geoJsonObj =>
          if (shouldGenerateWKTString && geoJsonObj
                .isInstanceOf[Polygon] && geoJsonObj
                .asInstanceOf[Polygon]
                .coordinates
                .size < 2) {
            // --- we only support WKT format for `Polygon`
            // --- convert geoJson to WKT format
            // --- We do not support Polygon in WKT format with holes yet
            // --- Thus, only generate WKT text when generated Polygon has no holes
            // --- i.e geoJsonObj.asInstanceOf[Polygon].coordinates.size < 2
            val cordsStr = geoJsonObj
              .asInstanceOf[Polygon]
              .coordinates
              .toJson
              .toString
              .replaceAll("\\[([\\d-.]+).([\\d-.]+)\\]", "$1 $2")
              .replace("[", "(")
              .replace("]", ")")

            s"POLYGON ${cordsStr}"
          } else {
            geoJsonObj.toJson.toString
          }
        }
        .map { jsonString =>
          if (!shouldGenerateInvalidDecimals) {
            jsonString
          } else {

            /**
              * Add extra invalid decimal places to simulate the possible poor geoJson data
              * e.g. 123.34.22
              * */
            jsonString
            // --- add extra decimal places
            // --- please note: this will not be valid json anymore
            // --- But still a valid WKT String (as per our pattern match)
              .replaceAll("(\\d+\\.\\d)(\\d+)", "$1.$2")
          }
        }
      new Location(text, geoJson)
    }

  def descWordGen(inputCache: mutable.Map[String, List[_]]) =
    cachedListGen(
      "descWord",
      nonEmptyTextGen.map(_.take(50).mkString.trim),
      200
    )(inputCache)

  def publisherAgentGen(inputCache: mutable.Map[String, List[_]]) =
    cachedListGen(
      "publisherAgent",
      agentGen(
        listSizeBetween(
          1,
          4,
          nonEmptyTextWithStopWordsGen.map(_.take(50).mkString.trim)
        ).map(_.mkString(" "))
      ),
      50
    )(inputCache)

  def publisherGen(inputCache: mutable.Map[String, List[_]]) =
    publisherAgentGen(inputCache).map(
      _.filter(_.name.isDefined).map(_.name.get)
    )

  val mediaTypeGen = Gen.oneOf(
    Seq(
      MediaTypes.`application/json`,
      MediaTypes.`application/vnd.google-earth.kml+xml`,
      MediaTypes.`text/csv`,
      MediaTypes.`application/json`,
      MediaTypes.`application/octet-stream`
    )
  )

  val formatNameGen = listSizeBetween(
    1,
    3,
    nonEmptyTextWithStopWordsGen.map(removeStopWords).map(_.take(50).trim)
  ).map(_.mkString(" ")).suchThat(!_.trim.isEmpty())

  def randomFormatGen(inputCache: mutable.Map[String, List[_]]) =
    cachedListGen("randomFormat", formatNameGen, 5)(inputCache)

  def textGen(inner: Gen[List[String]]) =
    inner
      .flatMap(list => Gen.choose(0, Math.min(100, list.length)).map((_, list)))
      .flatMap(tuple => Gen.pick(tuple._1, tuple._2))
      .map {
        case Nil => ""
        case seq => seq.reduce(_ + " " + _)
      }

  val licenseGen = for {
    name <- someBiasedOption(arbitrary[String].map(_.take(50).trim))
    url <- someBiasedOption(arbitrary[String].map(_.take(50).trim))
  } yield License(name, url)

  def randomCaseGen(string: String) = {
    for {
      whatToDo <- Gen.listOfN(string.length, Gen.chooseNum(0, 2))
    } yield
      string
        .zip(whatToDo)
        .map {
          case (char, charWhatToDo) =>
            if (char.isLetter) charWhatToDo match {
              case 0 => char.toUpper
              case 1 => char.toLower
              case 2 => char
            } else char
        }
        .mkString
  }

  def formatGen(inputCache: mutable.Map[String, List[_]]) =
    for {
      mediaType <- Gen.option(mediaTypeGen)
      mediaTypeFormat = mediaType.flatMap(_.fileExtensions.headOption)
      randomFormat <- randomFormatGen(inputCache).flatMap(Gen.oneOf(_))
      format <- randomCaseGen(mediaTypeFormat.getOrElse(randomFormat))
    } yield (mediaType, format)

  def provenanceGen =
    for {
      mechanism <- Gen.option(Generators.textGen.map(_.take(50).trim))
      sourceSystem <- Gen.option(Generators.textGen.map(_.take(50).trim))
      derivedFrom <- Gen.option(
        Gen.listOf(
          Generators.textGen
            .map(text => ProvenanceRecord(id = Some(text.take(50).trim)))
        )
      )
      affiliatedOrganizationIds <- Gen.option(
        Gen.listOf(
          Generators.textGen.map(item => JsString.apply(item.take(50).trim))
        )
      )
      isOpenData <- Gen.option(arbitrary[Boolean])
    } yield
      Provenance(
        mechanism,
        sourceSystem,
        derivedFrom,
        affiliatedOrganizationIds,
        isOpenData
      )

  def distGen(inputCache: mutable.Map[String, List[_]]) =
    for {
      identifier <- Gen.uuid.map(_.toString).map(Some.apply)
      title <- textGen
      description <- someBiasedOption(textGen(descWordGen(inputCache)))
      issued <- someBiasedOption(offsetDateTimeGen())
      modified <- someBiasedOption(offsetDateTimeGen())
      license <- someBiasedOption(licenseGen)
      rights <- someBiasedOption(arbitrary[String].map(_.take(50).trim))
      accessURL <- someBiasedOption(arbitrary[String].map(_.take(50).trim))
      byteSize <- someBiasedOption(arbitrary[Long])
      format <- someBiasedOption(formatGen(inputCache))
    } yield
      Distribution(
        identifier = identifier,
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

  val twoDigitDoubleGen =
    Gen.choose(0, 1d).flatMap(x => Math.round(x * 100).toDouble / 100)

  def dataSetGen(
      inputCache: mutable.Map[String, List[_]],
      tenantId: BigInt = MAGDA_ADMIN_PORTAL_ID
  ) =
    for {
      identifier <- Gen.delay {
        incrementer.incrementAndGet()
      }
      title <- someBiasedOption(textGen.map(_.take(100).trim))
      description <- someBiasedOption(textGen(descWordGen(inputCache)))
      issued <- someBiasedOption(offsetDateTimeGen())
      modified <- someBiasedOption(offsetDateTimeGen())
      languages <- Generators.smallSet(
        arbitrary[String].map(_.take(50).mkString.trim)
      )
      publisher <- someBiasedOption(
        publisherAgentGen(inputCache).flatMap(Gen.oneOf(_))
      )
      accrualPeriodicity <- someBiasedOption(periodicityGen)
      spatial <- noneBiasedOption(locationGen(geometryGen(6, coordGen())))
      temporal <- Gen.frequency((9, Gen.some(periodOfTimeGen)), (1, None))
      theme <- Gen.listOf(nonEmptyTextGen)
      keyword <- Gen.listOf(nonEmptyTextGen)
      contactPoint <- someBiasedOption(
        agentGen(arbitrary[String].map(_.take(50).mkString.trim))
      )
      distributions <- listSizeBetween(1, 5, distGen(inputCache))
      landingPage <- someBiasedOption(
        arbitrary[String].map(_.take(50).mkString.trim)
      )
      quality <- twoDigitDoubleGen
      hasQuality <- arbitrary[Boolean]
      provenance <- Gen.option(provenanceGen)
    } yield
      DataSet(
        identifier = identifier.toString,
        tenantId = tenantId,
        source =
          Some(DataSouce(id = "connector-id", name = Some("test-catalog"))),
        catalog = Some("test-catalog"),
        title = title,
        description = description,
        issued = issued,
        modified = modified,
        languages = languages,
        publisher = publisher,
        accrualPeriodicity = accrualPeriodicity,
        spatial = spatial,
        temporal = temporal,
        themes = theme,
        keywords = keyword,
        contactPoint = contactPoint,
        distributions = distributions,
        landingPage = landingPage,
        quality = if (quality == 1) 0 else quality,
        hasQuality =
          if (quality > 0) true else if (quality == 1) false else hasQuality,
        score = None,
        publishingState = Some("published"),
        provenance = provenance
      )

  val INDEXED_REGIONS_COUNT = 12

  def indexedRegionsGen(inputCache: mutable.Map[String, List[_]]) =
    cachedListGen(
      "indexedRegions",
      regionGen(geometryGen(5, coordGen())),
      INDEXED_REGIONS_COUNT
    )(inputCache)

  def subListGen[T](list: Seq[T]) = list match {
    case Nil => Gen.const(Nil)
    case _ =>
      for {
        start <- Gen.chooseNum(0, Math.max(list.size - 2, 0))
        end <- Gen.chooseNum(start, Math.max(list.size - 1, 0))
      } yield list.slice(start, end)
  }
}
