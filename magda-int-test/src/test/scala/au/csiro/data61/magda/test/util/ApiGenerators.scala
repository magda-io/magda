package au.csiro.data61.magda.test.util

import java.time.Duration
import java.time.temporal.ChronoUnit

import org.scalacheck.{ Gen, Shrink }
import org.scalacheck.Gen.Choose._
import org.scalacheck.Arbitrary._
import com.monsanto.labs.mwundo.GeoJson._
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.model.Temporal._
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
import au.csiro.data61.magda.test.util.Generators._

object ApiGenerators {
  val queryTextGen = (for {
    allDescWords <- descWordGen
    safeDescWords = allDescWords.filterNot(x => Generators.filterWords.contains(x.toLowerCase))
    someDescWords <- listSizeBetween(1, 5, Gen.oneOf(allDescWords))
    concated = someDescWords.mkString(" ")
  } yield concated).suchThat(validFilter)
  def unspecifiedGen(implicit config: Config) = Gen.const(Unspecified())
  def filterValueGen[T](innerGen: Gen[T])(implicit config: Config): Gen[FilterValue[T]] = Gen.frequency((3, innerGen.map(Specified.apply)), (1, unspecifiedGen))

  def set[T](gen: Gen[T]): Gen[Set[T]] = Gen.containerOf[Set, T](gen)
  def probablyEmptySet[T](gen: Gen[T]): Gen[Set[T]] = Gen.frequency((1, smallSet(gen)), (3, Gen.const(Set())))

  val partialFormatGen = formatGen.map(_._2).flatMap(format => Gen.choose(format.length / 2, format.length).map(length => format.substring(Math.min(format.length - 1, length))))
  val formatQueryGenInner = Gen.frequency((5, formatGen.map(_._2)), (3, partialFormatGen), (1, nonEmptyTextGen))
    .suchThat(validFilter)
  def formatQueryGen(implicit config: Config) = filterValueGen(formatQueryGenInner)

  val partialPublisherGen = publisherGen.filter(!_.isEmpty).flatMap(Gen.oneOf(_)).flatMap { publisher =>
    Gen.choose(publisher.length / 2, publisher.length).map(length => publisher.substring(Math.min(publisher.length - 1, length)).trim)
  }

  def partialStringGen(string: String): Gen[String] = {
    val split = string.split("[\\s-]+")

    for {
      start <- Gen.choose(0, split.length / 2)
      end <- Gen.choose(start + (split.length / 2), split.length)
      delimiter <- Gen.oneOf("-", " ")
    } yield split.slice(start, Math.max(split.length - 1, 1)).mkString(delimiter)
  }

  def validFilter(word: String): Boolean = !filterWordRegex.r.matchesAny(word) && // Don't want to inject filter words into our query
    !filterWords.contains(word.toLowerCase) && // ditto
    {
      val words = word.split("^[\\s-.']")
      words.exists(word => !stopWords.contains(word.toLowerCase()))
    } && // stop words tend to not match anything because of TFDIF
    word.exists(_.isLetterOrDigit) && // GOtta have at least one letter
    word.length > 1

  val specifiedPublisherQueryGen = Gen.frequency((5, publisherGen.flatMap(Gen.oneOf(_))), (3, partialPublisherGen), (1, nonEmptyTextGen))
    .suchThat(validFilter)
  def publisherQueryGen(implicit config: Config): Gen[FilterValue[String]] = filterValueGen(specifiedPublisherQueryGen)
  def innerRegionQueryGen(implicit config: Config, regions: List[(RegionSource, JsObject)]): Gen[Region] = Gen.oneOf(regions)
    .map {
      case (regionSource, regionObject) => Region(regionJsonToQueryRegion(regionSource, regionObject))
    }
  def regionQueryGen(implicit config: Config, regions: List[(RegionSource, JsObject)]) = filterValueGen(innerRegionQueryGen)

  def regionJsonToQueryRegion(regionSource: RegionSource, regionObject: JsObject): QueryRegion = QueryRegion(
    regionType = regionSource.name,
    regionId = regionObject.fields("properties").asJsObject.fields(regionSource.idProperty).asInstanceOf[JsString].value)

  def dateFromGen(implicit config: Config) = filterValueGen(periodOfTimeGen.map(_.start.flatMap(_.date)).suchThat(_.isDefined).map(_.get))
  def dateToGen(implicit config: Config) = filterValueGen(periodOfTimeGen.map(_.end.flatMap(_.date)).suchThat(_.isDefined).map(_.get))

  def queryIsSmallEnough(query: Query) = {
    def textCount(input: String) = input.split("[\\s\\.-]").size
    def createCount(iterable: Iterable[Int]) = if (iterable.isEmpty) 0 else iterable.reduce(_ + _)
    def iterableTextCount(input: Iterable[String]) = createCount(input.map(textCount))
    def iterableTextCountFv(input: Iterable[FilterValue[String]]) = {
      createCount(input.map(_.map(textCount).getOrElse(0)))
    }

    val freeTextCount = iterableTextCount(query.freeText)
    val quoteCount = iterableTextCount(query.quotes)
    val publisherCount = iterableTextCountFv(query.publishers)
    val dateFromCount = query.dateFrom.map(_ => 1).getOrElse(0)
    val dateToCount = query.dateTo.map(_ => 1).getOrElse(0)
    val formatsCount = iterableTextCountFv(query.formats)
    val regionsCount = query.regions.size

    (freeTextCount + quoteCount + publisherCount + dateFromCount + dateToCount + formatsCount + regionsCount) < 500
  }

  def queryGen(implicit config: Config, regions: List[(RegionSource, JsObject)]) = (for {
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
    regions = regions)).suchThat(queryIsSmallEnough)

  def exactQueryGen(implicit config: Config, regions: List[(RegionSource, JsObject)]) = (for {
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
    regions = regions)).suchThat(queryIsSmallEnough)

  def unspecificQueryGen(implicit config: Config, regions: List[(RegionSource, JsObject)]) = (for {
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
    regions = regions)).flatMap(query => if (query.equals(Query())) for { freeText <- queryTextGen } yield Query(Some(freeText)) else Gen.const(query))
    .suchThat(queryIsSmallEnough)

  def textQueryGen(queryGen: Gen[Query])(implicit config: Config): Gen[(String, Query)] = queryGen.flatMap { query =>
    val textListComponents = (Seq(query.freeText).flatten ++
      query.quotes.map(""""""" + _ + """"""")).toSet

    val publishers = query.publishers.filter(containsNoFilterWord)
    val formats = query.formats.filter(containsNoFilterWord)

    val facetList = publishers.map(publisher => s"by $publisher") ++
      Seq(query.dateFrom.map(dateFrom => s"from $dateFrom")).flatten ++
      Seq(query.dateTo.map(dateTo => s"to $dateTo")).flatten ++
      formats.map(format => s"as $format") ++
      query.regions.map(region => s"in ${region.map(_.queryRegion)}")

    val textQuery = for {
      textList <- Gen.pick(textListComponents.size, textListComponents)
      randomFacetList <- Gen.pick(facetList.size, facetList)
      rawQuery = (textList ++ randomFacetList).mkString(" ")
      query <- randomCaseGen(rawQuery)
    } yield query

    textQuery.flatMap((_, query.copy(publishers = publishers, formats = formats)))
  }

  def containsNoFilterWord(word: FilterValue[String]): Boolean = {
    !filterWords.exists(filterWord => word.map(_.toLowerCase.contains(" " + filterWord.toLowerCase + " ")).getOrElse(false))
  }
}