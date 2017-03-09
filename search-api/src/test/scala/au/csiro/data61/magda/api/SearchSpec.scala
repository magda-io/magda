package au.csiro.data61.magda.api

import org.scalacheck._
import org.scalacheck.Arbitrary._
import org.scalacheck.Shrink
import org.scalatest._

import com.vividsolutions.jts.geom.GeometryFactory

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.ContentTypes.`application/json`
import akka.http.scaladsl.model.StatusCodes.OK
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.search.MatchAll
import au.csiro.data61.magda.test.util.ApiGenerators._
import au.csiro.data61.magda.test.util.Generators._
import com.monsanto.labs.mwundo.GeoJson.Polygon
import com.monsanto.labs.mwundo.GeoJson._
import au.csiro.data61.magda.util.MwundoJTSConversions._
import spray.json.JsString
import au.csiro.data61.magda.spatial.RegionSource
import akka.http.scaladsl.server.Route

class SearchSpec extends BaseApiSpec {
  val geoFactory = new GeometryFactory()
  describe("meta") {
    it("Mwundo <--> JTS conversions should work") {
      forAll(regionGen(geometryGen(5, coordGen()))) { regionRaw =>
        val preConversion = regionRaw._2.fields("geometry").convertTo[Geometry]

        val jts = GeometryConverter.toJTSGeo(preConversion, geoFactory)
        val postConversion = GeometryConverter.fromJTSGeo(jts)

        preConversion should equal(postConversion)
      }
    }
  }

  describe("searching") {
    describe("*") {
      it("should return all results") {
        forAll(indexGen) {
          case (indexName, dataSets, routes) ⇒
            Get(s"/datasets/search?query=*&limit=${dataSets.length}") ~> routes ~> check {
              status shouldBe OK
              contentType shouldBe `application/json`
              val response = responseAs[SearchResult]

              response.hitCount shouldEqual dataSets.length
              response.dataSets shouldEqual dataSets
            }
        }
      }

      it("hitCount should reflect all hits in the system, not just what is returned") {
        forAll(indexGen) {
          case (indexName, dataSets, routes) ⇒
            Get(s"/datasets/search?query=*&limit=${dataSets.length / 2}") ~> routes ~> check {
              status shouldBe OK
              val response = responseAs[SearchResult]

              response.hitCount shouldEqual dataSets.length
              response.dataSets should equal(dataSets.take(dataSets.length / 2))
            }
        }
      }
    }

    it("should return only filtered datasets with MatchAll, and only ones that wouldn't pass filter with MatchPart") {
      val filterQueryGen = queryGen
        .suchThat(query => query.dateFrom.isDefined || query.dateTo.isDefined || !query.formats.isEmpty || !query.publishers.isEmpty)

      forAll(indexGen, textQueryGen(queryGen)) { (indexTuple, queryTuple) ⇒
        val (_, dataSets, routes) = indexTuple
        val (textQuery, query) = queryTuple
        Get(s"/datasets/search?query=${encodeForUrl(textQuery)}&limit=${dataSets.length}") ~> routes ~> check {
          status shouldBe OK
          val response = responseAs[SearchResult]
          whenever(response.strategy.get == MatchAll) {

            response.dataSets.foreach { dataSet =>
              val temporal = dataSet.temporal
              val dataSetDateFrom = temporal.flatMap(innerTemporal => innerTemporal.start.flatMap(_.date).orElse(innerTemporal.end.flatMap(_.date)))
              val dataSetDateTo = temporal.flatMap(innerTemporal => innerTemporal.end.flatMap(_.date).orElse(innerTemporal.start.flatMap(_.date)))

              val dateUnspecified = (query.dateTo, query.dateFrom) match {
                case (Some(Unspecified()), Some(Unspecified())) | (Some(Unspecified()), None) | (None, Some(Unspecified())) => dataSetDateFrom.isEmpty && dataSetDateTo.isEmpty
                case _ => false
              }

              val dateFromMatched = (query.dateTo, dataSetDateFrom) match {
                case (Some(Specified(innerQueryDateTo)), Some(innerDataSetDateFrom)) => innerDataSetDateFrom.isBefore(innerQueryDateTo)
                case _ => true
              }

              val dateToMatched = (query.dateFrom, dataSetDateTo) match {
                case (Some(Specified(innerQueryDateFrom)), Some(innerDataSetDateTo)) => innerDataSetDateTo.isAfter(innerQueryDateFrom)
                case _ => true
              }

              // TODO: The following are slightly flakey because they're imitating a keyword search with "contains"
              val dataSetPublisherName = dataSet.publisher.flatMap(_.name)
              val publisherMatched = if (!query.publishers.isEmpty) {
                query.publishers.exists(queryPublisher =>
                  queryPublisher match {
                    case Specified(specifiedPublisher) => dataSetPublisherName.map(_.toLowerCase.contains(specifiedPublisher.toLowerCase)).getOrElse(false)
                    case Unspecified()                 => dataSet.publisher.flatMap(_.name).isEmpty
                  }
                )
              } else true

              val formatMatched = if (!query.formats.isEmpty) {
                query.formats.exists(queryFormat =>
                  dataSet.distributions.exists(distribution =>
                    queryFormat match {
                      case Specified(specifiedFormat) => distribution.format.map(_.toLowerCase.contains(specifiedFormat.toLowerCase)).getOrElse(false)
                      case Unspecified()              => distribution.format.isEmpty
                    }
                  )
                )
              } else true

              val geometryFactory: GeometryFactory = new GeometryFactory

              val queryRegions = query.regions.filter(_.isDefined).map { region =>
                findIndexedRegion(region.get.queryRegion)
              }

              // This one is trying to imitate an inaccurate ES query with JTS distance, which is also a bit flaky
              val distances = queryRegions.flatMap(queryRegion =>
                dataSet.spatial.flatMap(_.geoJson.map { geoJson =>
                  val jtsGeo = GeometryConverter.toJTSGeo(geoJson, geometryFactory)
                  val jtsRegion = GeometryConverter.toJTSGeo(queryRegion._3, geometryFactory)

                  (jtsGeo.distance(jtsRegion), Math.max(jtsGeo.getLength, jtsRegion.getLength))
                }))

              val unspecifiedRegion = query.regions.exists(_.isEmpty)
              val geoMatched = if (!query.regions.isEmpty) {
                unspecifiedRegion || distances.exists { case (distance, length) => distance <= length * 0.05 }
              } else true

              val allValid = (dateUnspecified || (dateFromMatched && dateToMatched)) && publisherMatched && formatMatched && geoMatched

              withClue(s"with query $textQuery \n and dataSet" +
                s"\n\tdateUnspecified $dateUnspecified" +
                s"\n\tdateTo $dataSetDateTo $dateFromMatched" +
                s"\n\tdateFrom $dataSetDateFrom $dateToMatched" +
                s"\n\tpublisher ${dataSet.publisher} $publisherMatched" +
                s"\n\tformats ${dataSet.distributions.map(_.format).mkString(",")} $formatMatched" +
                s"\n\tdistances ${distances.map(t => t._1 + "/" + t._2).mkString(",")}" +
                s"\n\tgeomatched ${dataSet.spatial.map(_.geoJson).mkString(",")} $geoMatched" +
                s"\n\tqueryRegions $queryRegions\n") {
                allValid should be(true)
              }
            }
          }
        }
      }
    }

    describe("should return the right dataset when searching for that dataset's") {
      describe("title") {
        testSearchForDataSetContents(dataSet => dataSet.title.toSeq)
      }

      describe("description") {
        testSearchForDataSetContents(dataSet => dataSet.description.toSeq)
      }

      describe("keywords") {
        testSearchForDataSetContents(dataSet => dataSet.keyword)
      }

      describe("publisher name") {
        testSearchForDataSetContents(dataSet => dataSet.publisher.toSeq.flatMap(_.name.toSeq))
      }

      describe("distribution title") {
        testSearchForDataSetContents(dataSet => dataSet.distributions.map(_.title))
      }

      describe("distribution description") {
        testSearchForDataSetContents(dataSet => dataSet.distributions.flatMap(_.description.toSeq))
      }

      describe("theme") {
        testSearchForDataSetContents(dataSet => dataSet.theme)
      }

      def testSearchForDataSetContents(termExtractor: DataSet => Seq[String]) = {
        it("when searching for it directly") {
          doTest(termExtractor)
        }

        it(s"regardless of pluralization/depluralization") {
          def innerTermExtractor(dataSet: DataSet) = termExtractor(dataSet)
            .filterNot(_.matches("\\d+"))
            .map {
              case term if term.last.toLower.equals('s') => term.take(term.length - 1)
              case term                                  => term + "s"
            }

          doTest(innerTermExtractor)
        }

        def doTest(innerTermExtractor: DataSet => Seq[String]) = {
          def getIndividualTerms(terms: Seq[String]) = terms.flatMap(term => term +: term.split(" "))

          val indexAndTermsGen = indexGen.flatMap {
            case (indexName, dataSetsRaw, routes) ⇒
              val indexedDataSets = dataSetsRaw.filterNot(dataSet ⇒ termExtractor(dataSet).isEmpty)

              val tuples = indexedDataSets.flatMap { dataSet =>
                val terms = getIndividualTerms(termExtractor(dataSet))
                  .filter(_.length > 2)
                  .filterNot(term => Seq("and", "or", "").contains(term.trim))

                if (!terms.isEmpty)
                  Seq(Gen.oneOf(terms).map((dataSet, _)))
                else
                  Nil
              }

              val x = tuples.foldRight(Gen.const(List[(DataSet, String)]()))((soFar, current) =>
                for {
                  currentInner <- current
                  list <- soFar
                } yield currentInner :+ list
              )

              x.map((indexName, _, routes))
          }

          // We don't want to shrink this kind of tuple at all ever.
          implicit def dataSetStringShrinker(implicit s: Shrink[DataSet], s1: Shrink[String]): Shrink[(DataSet, String)] = Shrink[(DataSet, String)] {
            case (string, dataSet) => Stream((string, dataSet))
          }

          // Make sure a shrink for the indexAndTerms gen simply shrinks the list of datasets
          implicit def indexAndTermsShrinker(implicit s: Shrink[String], s1: Shrink[List[(DataSet, String)]], s2: Shrink[Route]): Shrink[(String, List[(DataSet, String)], Route)] = Shrink[(String, List[(DataSet, String)], Route)] {
            case (indexName, terms, route) ⇒
              Shrink.shrink(terms).map { shrunkTerms ⇒
                val x = putDataSetsInIndex(shrunkTerms.map(_._1)).await(INSERTION_WAIT_TIME)

                (x._1, shrunkTerms, x._3)
              }
          }

          forAll(indexAndTermsGen) {
            case (indexName, tuples, routes) =>
              whenever(!tuples.isEmpty) {
                tuples.foreach {
                  case (dataSet, term) =>
                    Get(s"""/datasets/search?query=${encodeForUrl(s""""$term"""")}&limit=${tuples.size}""") ~> routes ~> check {
                      status shouldBe OK
                      val result = responseAs[SearchResult]
                      withClue(s"term: ${term} and identifier: ${dataSet.identifier} in ${tuples.map(_._1).map(termExtractor).mkString(", ")}") {
                        result.dataSets.exists(_.identifier.equals(dataSet.identifier)) shouldBe true
                      }
                    }
                }
              }
          }
        }
      }
    }
  }

  def findIndexedRegion(queryRegion: QueryRegion): (Region, RegionSource, Geometry) = {
    val regionJsonOption = indexedRegions.find { innerRegion =>
      regionJsonToQueryRegion(innerRegion._1, innerRegion._2).equals(queryRegion)
    }

    withClue(s"for queryRegion $queryRegion and regions ${indexedRegions}") {
      regionJsonOption.isDefined should be(true)
    }
    val (regionType, json) = regionJsonOption.get
    val regionJson = json.getFields("geometry").head
    val properties = json.getFields("properties").head.asJsObject

    (Region(
      queryRegion = QueryRegion(
        regionId = properties.getFields(regionType.idProperty).head.convertTo[String],
        regionType = regionType.name
      ),
      regionName = properties.getFields(regionType.nameProperty).headOption.map(_.convertTo[String])
    ), regionType, regionJson.convertTo[Geometry])
  }

  describe("pagination") {
    it("should match the result of getting all datasets and using .drop(start).take(limit) to select a subset") {
      forAll(indexGen) {
        case (indexName, dataSets, routes) ⇒
          val dataSetCount = dataSets.size

          val starts = for (n ← Gen.choose(0, dataSetCount)) yield n
          val limits = for (n ← Gen.choose(0, dataSetCount)) yield n

          forAll(starts, limits) { (start, limit) ⇒
            whenever(start >= 0 && start <= dataSetCount && limit >= 0 && limit <= dataSetCount) {
              Get(s"/datasets/search?query=*&start=${start}&limit=${limit}") ~> routes ~> check {
                status shouldBe OK
                val result = responseAs[SearchResult]

                val expectedResultIdentifiers = dataSets.drop(start).take(limit).map(_.identifier)
                expectedResultIdentifiers shouldEqual result.dataSets.map(_.identifier)
              }
            }
          }
      }
    }
  }

  describe("query") {
    def removeResolvedRegions(query: Query): Query = {
      query.copy(
        regions = query.regions.map(_.map(_.copy(regionName = None, boundingBox = None)))
      )
    }

    it("should parse a randomly generated query correctly") {
      forAll(emptyIndexGen, textQueryGen(queryGen)) { (indexTuple, queryTuple) ⇒
        val (textQuery, query) = queryTuple
        val (_, _, routes) = indexTuple

        whenever(!textQuery.toLowerCase.contains("or") && !textQuery.toLowerCase.contains("and")) {
          Get(s"/datasets/search?query=${encodeForUrl(textQuery)}") ~> routes ~> check {
            status shouldBe OK
            val response = responseAs[SearchResult]
            if (textQuery.equals("")) {
              response.query should equal(Query(freeText = Some("*")))
            } else {
              removeResolvedRegions(response.query) should equal(query)
            }
          }
        }
      }
    }
    it("should resolve valid regions") {
      val thisQueryGen = set(innerRegionQueryGen).map(queryRegions => new Query(regions = queryRegions.map(Specified.apply)))

      forAll(emptyIndexGen, textQueryGen(thisQueryGen)) { (indexTuple, queryTuple) ⇒
        val (textQuery, query) = queryTuple
        val (_, _, routes) = indexTuple

        Get(s"/datasets/search?query=${encodeForUrl(textQuery)}") ~> routes ~> check {
          status shouldBe OK
          val response = responseAs[SearchResult]

          response.query.regions.size should equal(query.regions.size)

          val tuples = response.query.regions.map(region => (region, query.regions.find(_.get.queryRegion.equals(region.get.queryRegion)).get.get.queryRegion))
          tuples.foreach {
            case (responseRegion, queryRegion) =>
              val (indexedRegion, regionSource, geometry) = findIndexedRegion(queryRegion)

              responseRegion.get.queryRegion.regionId should equal(indexedRegion.queryRegion.regionId)

              if (regionSource.includeIdInName) {
                responseRegion.get.regionName.get should equal(indexedRegion.regionName.get + " - " + indexedRegion.queryRegion.regionId)
              } else {
                responseRegion.get.regionName.get should equal(indexedRegion.regionName.get)
              }

              val allCoords: Seq[Coordinate] = geometry match {
                case Point(coord)               => Seq(coord)
                case MultiPoint(coords)         => coords
                case LineString(coords)         => coords
                case MultiLineString(coordsSeq) => coordsSeq.flatten
                case Polygon(coordsSeq)         => coordsSeq.flatten
                case MultiPolygon(coordsSeqSeq) => coordsSeqSeq.flatten.flatten
              }
              val byY = allCoords.sortBy(_.y)
              val byX = allCoords.sortBy(_.x)

              val indexedBoundingBox = BoundingBox(byY.last.y, byX.head.x, byY.head.y, byX.last.x)

              responseRegion.get.boundingBox.isDefined should be(true)

              val responseBoundingBox = responseRegion.get.boundingBox.get

              withClue(s"responseBoundingBox $responseBoundingBox vs indexedBoundingBox $indexedBoundingBox with $geometry") {
                responseBoundingBox should equal(indexedBoundingBox)
              }
          }
        }
      }
    }

    it("should correctly escape control characters") {
      val controlChars = "+ - = && || ! ( ) { } [ ] ^ ~ ? : \\ / and or > <".split(" ")

      def controlCharGen(string: String): Gen[String] = {
        (for {
          whatToDo <- Gen.listOfN(string.length, Gen.chooseNum(0, 5))
        } yield string.zip(whatToDo).map {
          case (char, charWhatToDo) => charWhatToDo match {
            case 0 => Gen.oneOf(controlChars)
            case _ => Gen.const(char.toString)
          }
        }.reduce((accGen, currentGen) =>
          accGen.flatMap { acc =>
            currentGen.map { current =>
              acc + current
            }
          }
        )).flatMap(a => a)
      }

      val controlCharQueryGen = queryGen.suchThat(query =>
        !Seq("and", "or").exists(reservedWord => query.freeText.exists(_.toLowerCase.contains(reservedWord.toLowerCase) ||
          query.quotes.exists(_.toLowerCase.contains(reservedWord.toLowerCase))))
      ).flatMap { query =>
        val freeTextGen = query.freeText match {
          case Some(freeTextInner) => controlCharGen(freeTextInner).map(Some.apply)
          case None                => Gen.const(None)
        }
        val quotesGen = query.quotes
          .map(controlCharGen)
          .foldRight(Gen.const(Set.empty[String]))((i, acc) => acc.flatMap(set => i.map(set + _)))

        for {
          freeText <- freeTextGen
          quotes <- quotesGen
        } yield (query.copy(
          freeText = freeText,
          quotes = quotes
        ))
      }

      forAll(emptyIndexGen, textQueryGen(controlCharQueryGen)) { (indexTuple, queryTuple) ⇒
        val (textQuery, query) = queryTuple
        val (_, _, routes) = indexTuple

        whenever(!query.equals(Query())) {
          Get(s"/datasets/search?query=${encodeForUrl(textQuery)}") ~> routes ~> check {
            status shouldBe OK

            val response = responseAs[SearchResult]
            removeResolvedRegions(response.query) should equal(query)
          }
        }
      }
    }

    it("should not fail for queries that are full of arbitrary characters") {
      forAll(emptyIndexGen, Gen.listOf(arbitrary[String]).map(_.mkString(" "))) { (indexTuple, textQuery) =>
        val (_, _, routes) = indexTuple

        Get(s"/datasets/search?query=${encodeForUrl(textQuery)}") ~> routes ~> check {
          status shouldBe OK
        }
      }
    }

    it("should not fail for arbitrary characters interspersed with control words") {
      val controlWords = Seq("in", "by", "to", "from", "as", "and", "or")
      val controlWordGen = Gen.oneOf(controlWords).flatMap(randomCaseGen)
      val queryWordGen = Gen.oneOf(controlWordGen, Gen.oneOf(arbitrary[String], Gen.oneOf(".", "[", "]")))
      val queryTextGen = Gen.listOf(queryWordGen).map(_.mkString(" "))

      forAll(emptyIndexGen, queryTextGen) { (indexTuple, textQuery) =>
        val (_, _, routes) = indexTuple

        Get(s"/datasets/search?query=${encodeForUrl(textQuery)}") ~> routes ~> check {
          status shouldBe OK
        }
      }
    }
  }
}
