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
import au.csiro.data61.magda.test.util.Generators._

object ApiGenerators {

  val queryTextGen = descWordGen.flatMap(descWords => Gen.choose(1, 5).flatMap(size => Gen.pick(size, descWords))).map(_.mkString(" "))
  def unspecifiedGen(implicit config: Config) = Gen.const(Unspecified())
  def filterValueGen[T](innerGen: Gen[T])(implicit config: Config): Gen[FilterValue[T]] = Gen.frequency((3, innerGen.map(Specified.apply)), (1, unspecifiedGen))

  def set[T](gen: Gen[T]): Gen[Set[T]] = Gen.containerOf[Set, T](gen)
  def probablyEmptySet[T](gen: Gen[T]): Gen[Set[T]] = Gen.frequency((1, smallSet(gen)), (3, Gen.const(Set())))
  def smallSet[T](gen: Gen[T]): Gen[Set[T]] = listSizeBetween(1, 3, gen).map(_.toSet)

  val partialFormatGen = formatGen.map(_._2).flatMap(format => Gen.choose(format.length / 2, format.length).map(length => format.substring(Math.min(format.length - 1, length))))
  val formatQueryGenInner = Gen.frequency((5, formatGen.map(_._2)), (3, partialFormatGen), (1, nonEmptyTextGen))
    .suchThat(word => !filterWords.contains(word.toLowerCase))
  def formatQueryGen(implicit config: Config) = filterValueGen(formatQueryGenInner)

  val partialPublisherGen = publisherGen.flatMap(Gen.oneOf(_)).flatMap { publisher =>
    Gen.choose(publisher.length / 2, publisher.length).map(length => publisher.substring(Math.min(publisher.length - 1, length)).trim)
  }

  val filterWords = Set("in", "to", "as", "by", "from")

  val specifiedPublisherQueryGen = Gen.frequency((5, publisherGen.flatMap(Gen.oneOf(_))), (3, partialPublisherGen), (1, nonEmptyTextGen))
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

  val INDEXED_REGIONS_COUNT = 12
  val indexedRegionsGen = cachedListGen(regionGen(geometryGen(5, coordGen())), INDEXED_REGIONS_COUNT)
}