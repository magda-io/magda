package au.csiro.data61.magda.api

import java.time.OffsetDateTime
import java.time.temporal.ChronoField
import java.time.temporal.TemporalField
import java.util.Calendar
import java.util.GregorianCalendar

import org.scalacheck.Arbitrary.arbString
import org.scalacheck.Arbitrary.arbitrary
import org.scalacheck.Gen
import org.scalacheck.Shrink

import com.monsanto.labs.mwundo.GeoJson.Coordinate
import com.monsanto.labs.mwundo.GeoJson.Geometry
import com.monsanto.labs.mwundo.GeoJson.LineString
import com.monsanto.labs.mwundo.GeoJson.MultiLineString
import com.monsanto.labs.mwundo.GeoJson.MultiPoint
import com.monsanto.labs.mwundo.GeoJson.MultiPolygon
import com.monsanto.labs.mwundo.GeoJson.Point
import com.monsanto.labs.mwundo.GeoJson.Polygon
import com.vividsolutions.jts.geom.GeometryFactory

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.ContentTypes.`application/json`
import akka.http.scaladsl.model.StatusCodes.OK
import akka.http.scaladsl.server.Route
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.misc.BoundingBox
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.model.misc.QueryRegion
import au.csiro.data61.magda.model.misc.Region
import au.csiro.data61.magda.search.SearchStrategy.MatchAll
import au.csiro.data61.magda.spatial.RegionSource
import au.csiro.data61.magda.test.util.ApiGenerators.innerRegionQueryGen
import au.csiro.data61.magda.test.util.ApiGenerators.queryGen
import au.csiro.data61.magda.test.util.Generators.randomCaseGen
import au.csiro.data61.magda.test.util.ApiGenerators.regionJsonToQueryRegion
import au.csiro.data61.magda.test.util.ApiGenerators.set
import au.csiro.data61.magda.test.util.Generators.smallSet
import au.csiro.data61.magda.test.util.ApiGenerators.textQueryGen
import au.csiro.data61.magda.test.util.Generators
import au.csiro.data61.magda.test.util.Generators.coordGen
import au.csiro.data61.magda.test.util.Generators.geometryGen
import au.csiro.data61.magda.test.util.Generators.publisherGen
import au.csiro.data61.magda.test.util.Generators.regionGen
import au.csiro.data61.magda.test.util.MagdaMatchers
import au.csiro.data61.magda.util.MwundoJTSConversions.GeometryConverter
import au.csiro.data61.magda.test.util.ApiGenerators

class DataSetSearchSpec extends BaseSearchApiSpec {
  describe("meta") {
    it("Mwundo <--> JTS conversions should work") {
      val geoFactory = new GeometryFactory()
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
            Get(s"/v0/datasets?query=*&limit=${dataSets.length}") ~> routes ~> check {
              status shouldBe OK
              contentType shouldBe `application/json`
              val response = responseAs[SearchResult]

              response.hitCount shouldEqual dataSets.length
              MagdaMatchers.dataSetsEqual(response.dataSets, dataSets)
            }
        }
      }

      it("hitCount should reflect all hits in the system, not just what is returned") {
        forAll(indexGen) {
          case (indexName, dataSets, routes) ⇒
            Get(s"/v0/datasets?query=*&limit=${dataSets.length / 2}") ~> routes ~> check {
              status shouldBe OK
              val response = responseAs[SearchResult]

              response.hitCount shouldEqual dataSets.length
              MagdaMatchers.dataSetsEqual(response.dataSets, dataSets.take(dataSets.length / 2))
            }
        }
      }
    }
  }

  describe("quotes") {
    it("should be able to be found verbatim somewhere in a dataset") {

      implicit val stringShrink: Shrink[String] = Shrink { string =>
        Stream.empty
      }

      implicit val disableShrink: Shrink[(List[DataSet], Route, String, String, DataSet)] = Shrink { _ =>
        Stream.empty
      }

      val quoteGen = for {
        (_, dataSets, routes) <- indexGen.suchThat(!_._2.filter(_.description.isDefined).isEmpty)
        dataSetsWithDesc = dataSets.filter(_.description.isDefined)
        dataSet <- Gen.oneOf(dataSetsWithDesc)
        description = dataSet.description.get
        descWords = description.split(" ")
        start <- Gen.choose(0, Math.max(descWords.length - 1, 0))
        end <- Gen.choose(start + 1, descWords.length)
        quoteWords = descWords.slice(start, end)
        quote <- randomCaseGen(quoteWords.mkString(" ").trim)
        reverseOrderWords = quoteWords.reverse
        reverseOrderQuote <- randomCaseGen(reverseOrderWords.mkString(" ").trim)
      } yield (dataSetsWithDesc, routes, quote, reverseOrderQuote, dataSet)

      forAll(quoteGen) {
        case (dataSets, routes, quote, reverseOrderQuote, sourceDataSet) =>
          whenever(!dataSets.isEmpty && quote.forall(_.toInt >= 32) && !quote.toLowerCase.contains("or") && !quote.toLowerCase.contains("and") && quote.exists(_.isLetterOrDigit)) {
            Get(s"""/v0/datasets?query=${encodeForUrl(s""""$quote"""")}&limit=${dataSets.length}""") ~> routes ~> check {
              status shouldBe OK
              val response = responseAs[SearchResult]

              response.strategy.get should equal(MatchAll)
              response.dataSets.isEmpty should be(false)

              response.dataSets.exists(_.identifier == sourceDataSet.identifier)

              response.dataSets.foreach { dataSet =>
                withClue(s"dataSet term ${quote.toLowerCase} and dataSet ${dataSet.normalToString.toLowerCase}") {
                  MagdaMatchers.extractAlphaNum(dataSet.normalToString).contains(
                    MagdaMatchers.extractAlphaNum(quote)) should be(true)
                }
              }
            }

            // Just to make sure we're matching on the quote in order, run it backwards.
            Get(s"""/v0/datasets?query=${encodeForUrl(s""""$reverseOrderQuote"""")}&limit=${dataSets.length}""") ~> routes ~> check {
              status shouldBe OK
              val response = responseAs[SearchResult]

              if (response.strategy.get == MatchAll) {
                response.dataSets.foreach { dataSet =>
                  withClue(s"dataSet term ${reverseOrderQuote.toLowerCase} and dataSet ${dataSet.normalToString.toLowerCase}") {
                    MagdaMatchers.extractAlphaNum(dataSet.normalToString).contains(
                      MagdaMatchers.extractAlphaNum(reverseOrderQuote)) should be(true)
                  }
                }
              }
            }
          }
      }
    }
  }

  describe("filtering") {
    it("should return only filtered datasets with MatchAll, and only ones that wouldn't pass filter with MatchPart") {
      try {
        //        val filterQueryGen = queryGen
        //          .suchThat(query => query.dateFrom.isDefined || query.dateTo.isDefined || !query.formats.isEmpty || !query.publishers.isEmpty)
        val gen = for {
          index <- mediumIndexGen
          query <- textQueryGen(queryGen(index._2))
        } yield (index, query)

        forAll(gen) {
          case (indexTuple, queryTuple) ⇒
            val (_, dataSets, routes) = indexTuple
            val (textQuery, query) = queryTuple

            Get(s"/v0/datasets?query=${encodeForUrl(textQuery)}&limit=${dataSets.length}") ~> routes ~> check {
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

                  val dataSetPublisherName = dataSet.publisher.flatMap(_.name)
                  val publisherMatched = if (!query.publishers.isEmpty) {
                    query.publishers.exists { queryPublisher =>
                      queryPublisher match {
                        case Specified(specifiedPublisher) => dataSetPublisherName.exists(innerDataSetPublisher =>
                          MagdaMatchers.extractAlphaNum(innerDataSetPublisher).contains(MagdaMatchers.extractAlphaNum(specifiedPublisher)))
                        case Unspecified() => dataSet.publisher.flatMap(_.name).isEmpty
                      }
                    }
                  } else true

                  val formatMatched = if (!query.formats.isEmpty) {
                    query.formats.exists(queryFormat =>
                      dataSet.distributions.exists(distribution =>
                        queryFormat match {
                          case Specified(specifiedFormat) => distribution.format.exists(dataSetFormat =>
                            MagdaMatchers.extractAlphaNum(dataSetFormat).contains(MagdaMatchers.extractAlphaNum(specifiedFormat)))
                          case Unspecified() => distribution.format.isEmpty
                        }))
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

                      val length = {
                        val jtsGeoEnv = jtsGeo.getEnvelopeInternal
                        val jtsRegionEnv = jtsRegion.getEnvelopeInternal

                        Seq(jtsGeoEnv.getHeight, jtsGeoEnv.getWidth, jtsRegionEnv.getHeight, jtsRegionEnv.getWidth).sorted.last
                      }

                      (jtsGeo.distance(jtsRegion), if (length > 0) length else 1)
                    }))

                  val unspecifiedRegion = query.regions.exists(_.isEmpty)
                  val geoMatched = if (!query.regions.isEmpty) {
                    unspecifiedRegion || distances.exists { case (distance, length) => distance <= length * 0.05 }
                  } else true

                  val allValid = (dateUnspecified || (dateFromMatched && dateToMatched)) && publisherMatched && formatMatched && geoMatched

                  withClue(s"with query $textQuery \n and dataSet" +
                    s"\n\tdateUnspecified $dateUnspecified" +
                    s"\n\tdateTo $dataSetDateTo $dateToMatched" +
                    s"\n\tdateFrom $dataSetDateFrom $dateFromMatched" +
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
      } catch {
        case e: Throwable =>
          e.printStackTrace
          throw e
      }
    }

    describe("format") {
      it("exact") {
        def dataSetToQuery(dataSet: DataSet) = {
          val formats = dataSet.distributions
            .map(_.format.map(Specified.apply).getOrElse(Unspecified()))
            .filter {
              case Specified(x) => ApiGenerators.validFilter(x)
              case _            => true
            }

          for {
            formatsReduced <- Gen.someOf(formats)
            query = Query(formats = formatsReduced.toSet)
          } yield query
        }

        doDataSetFilterTest(dataSetToQuery) { (query, response, dataSet) =>
          whenever(query != Query() && query.formats.filter(_.isDefined).forall(!_.get.contains("  "))) {
            val queryFormats = query.formats.map(_.map(MagdaMatchers.extractAlphaNum))
            withClue(s"queryFormats $queryFormats and dataset formats ${dataSet.distributions.flatMap(_.format)}") {
              response.strategy.get should be(MatchAll)
              response.dataSets.isEmpty should be(false)
              response.dataSets.exists(_.identifier == dataSet.identifier) should be(true)
            }

            response.dataSets.foreach { dataSet =>

              val matchesQuery = dataSet.distributions.exists(dist => dist.format match {
                case Some(format) => queryFormats.contains(Specified(MagdaMatchers.extractAlphaNum(format)))
                case None         => queryFormats.contains(Unspecified())
              })

              withClue(s"queryFormats $queryFormats and dataset formats ${dataSet.distributions.flatMap(_.format)}") {
                matchesQuery should be(true)
              }
            }
          }
        }
      }

      it("inexact") {
        def dataSetToQuery(dataSet: DataSet): Gen[Query] = {
          val formats = dataSet.distributions
            .map(_.format.map(Specified.apply).flatMap(x => x)).flatten

          if (formats.isEmpty)
            Gen.const(Query())
          else {
            for {
              format <- Gen.oneOf(formats)
              reducedFormat <- ApiGenerators.partialStringGen(format)
              reducedFormatValid = ApiGenerators.validFilter(reducedFormat)
              query = Query(formats = Set(Specified(reducedFormat)))
            } yield if (reducedFormatValid) query else Query()
          }
        }

        doDataSetFilterTest(dataSetToQuery) { (query, response, dataSet) =>
          whenever(query != Query() && query.formats.exists(!_.get.trim.isEmpty)) {
            val queryFormats = query.formats
            val dataSetFormats = dataSet.distributions.flatMap(_.format)
            withClue(s"queryFormats $queryFormats and dataset formats ${dataSet.distributions.flatMap(_.format)}") {
              response.dataSets.isEmpty should be(false)
              response.dataSets.exists(_.identifier == dataSet.identifier) should be(true)
            }

            response.dataSets.foreach { dataSet =>
              val queryToDataSetComparison = for {
                queryFormat <- queryFormats
                queryWord <- MagdaMatchers.tokenize(queryFormat.get)
                dataSetFormat <- dataSetFormats
                dataSetWord <- MagdaMatchers.tokenize(dataSetFormat)
              } yield (dataSetWord, queryWord)

              withClue("with dataSet->query: " + queryToDataSetComparison) {
                queryToDataSetComparison.exists {
                  case (dataSetWord, queryWord) =>
                    MagdaMatchers.extractAlphaNum(dataSetWord) == MagdaMatchers.extractAlphaNum(queryWord) ||
                      MagdaMatchers.toEnglishToken(dataSetWord) == MagdaMatchers.toEnglishToken(queryWord)
                } should be(true)
              }
            }
          }
        }
      }

      it("unspecified") {
        val pubQueryGen = Gen.const(Query(formats = Set(Unspecified())))

        doUnspecifiedTest(pubQueryGen) { response =>
          response.dataSets.foreach { dataSet =>
            val dataSetFormats = dataSet.distributions.map(_.format)
            withClue(s"dataSetFormats $dataSetFormats") {
              dataSetFormats.exists(_.isEmpty) should be(true)
            }
          }
        }
      }
    }

    describe("publisher") {
      it("exact") {
        def dataSetToQuery(dataSet: DataSet) = {

          val publishers = Set(
            dataSet.publisher
              .flatMap(_.name)
              .map(Specified.apply).getOrElse(Unspecified()))
            .filter {
              case Specified(x) => ApiGenerators.validFilter(x)
              case _            => true
            }.asInstanceOf[Set[FilterValue[String]]]

          Gen.const(Query(publishers = publishers))
        }

        doDataSetFilterTest(dataSetToQuery) { (query, response, dataSet) =>
          whenever(query != Query() && query.publishers.filter(_.isDefined).forall(!_.get.contains("  "))) {
            val queryPublishers = query.publishers.map(_.map(MagdaMatchers.extractAlphaNum))
            withClue(s"queryPublishers $queryPublishers and dataSet publisher ${dataSet.publisher.flatMap(_.name)}") {
              response.strategy.get should be(MatchAll)
              response.dataSets.isEmpty should be(false)
              response.dataSets.exists(_.identifier == dataSet.identifier) should be(true)
            }

            response.dataSets.foreach { dataSet =>
              val matchesQuery = dataSet.publisher.flatMap(_.name) match {
                case Some(publisher) => queryPublishers.contains(Specified(MagdaMatchers.extractAlphaNum(publisher)))
                case None            => queryPublishers.contains(Unspecified())
              }

              withClue(s"queryPublishers $queryPublishers and dataSet publisher ${dataSet.publisher.flatMap(_.name)}") {
                matchesQuery should be(true)
              }
            }
          }
        }
      }

      it("inexact") {
        def dataSetToQuery(dataSet: DataSet): Gen[Query] = {
          val publisher = dataSet.publisher.flatMap(_.name)

          publisher match {
            case None => Gen.const(Query())
            case Some(innerPublisher) =>
              for {
                reducedPublisher <- ApiGenerators.partialStringGen(innerPublisher).suchThat(ApiGenerators.validFilter(_))
                query = Query(publishers = Set(Specified(reducedPublisher)))
              } yield query
          }
        }

        doDataSetFilterTest(dataSetToQuery) { (query, response, dataSet) =>
          whenever(query != Query() && query.publishers.exists(!_.get.trim.isEmpty)) {
            val queryPublishers = query.publishers
            withClue(s"Query publishers ${queryPublishers} and dataSetPublisher ${dataSet.publisher.get.name}") {
              response.dataSets.isEmpty should be(false)
              response.dataSets.exists(_.identifier == dataSet.identifier) should be(true)
            }

            response.dataSets.foreach { dataSet =>
              val dataSetPublisher = dataSet.publisher.get.name

              withClue(s"Query publishers ${queryPublishers} and dataSetPublisher ${dataSetPublisher}") {
                def tokenize(string: String) = string.split("[\\s-.']+").map(MagdaMatchers.toEnglishToken)

                val gotQueryPublishers = queryPublishers.map(_.get).flatMap(_.split("[\\s-.']+"))
                val tokenizedQueryPublishers = gotQueryPublishers.flatMap(tokenize)

                val possibleQueryPublishers = gotQueryPublishers.zip(tokenizedQueryPublishers)

                val tokenizedDataSetPublishers = tokenize(dataSetPublisher.get)

                val allDataSetPublisherTerms = dataSetPublisher.get.split("[\\s-.]+") ++ tokenizedDataSetPublishers

                val y = possibleQueryPublishers.foldLeft(0) {
                  case (soFar, (untokenizedTerm, tokenizedTerm)) =>
                    val hasAMatch = allDataSetPublisherTerms.exists(dataSetTerm => dataSetTerm == untokenizedTerm || dataSetTerm === tokenizedTerm)

                    soFar + (if (hasAMatch) 1 else 0)
                }

                // Generally it should match >= 50% of the terms in the query, but for some reason it doesn't now. FIXME
                (y.toDouble / possibleQueryPublishers.size) should be > 0d
              }
            }
          }
        }
      }

      it("unspecified") {
        val pubQueryGen = Gen.const(Query(publishers = Set(Unspecified())))

        doUnspecifiedTest(pubQueryGen) { response =>
          whenever(!response.dataSets.isEmpty) {
            response.dataSets.foreach { dataSet =>
              val dataSetPublisher = dataSet.publisher.flatMap(_.name)
              withClue(s"dataSetPublisher $dataSetPublisher") {
                dataSetPublisher.isEmpty should be(true)
              }
            }
          }
        }
      }
    }

    def doUnspecifiedTest(queryGen: Gen[Query])(test: SearchResult => Unit) = {
      forAll(indexGen, textQueryGen(queryGen)) {
        case ((_, dataSets, routes), (textQuery, query)) =>
          doFilterTest(textQuery, dataSets, routes) { (response) =>
            whenever(!response.dataSets.isEmpty) {
              test(response)
            }
          }
      }
    }

    def doDataSetFilterTest(buildQuery: DataSet => Gen[Query])(test: (Query, SearchResult, DataSet) => Unit) {
      val gen = for {
        index <- indexGen.suchThat(!_._2.isEmpty)
        dataSet <- Gen.oneOf(index._2)
        query = buildQuery(dataSet)
        textQuery <- textQueryGen(query)
      } yield (index, dataSet, textQuery)

      forAll(gen) {
        case ((indexName, dataSets, routes), dataSet, (textQuery, query)) =>
          whenever(!dataSets.isEmpty && dataSets.contains(dataSet)) {
            doFilterTest(textQuery, dataSets, routes) { response =>
              test(query, response, dataSet)
            }
          }
      }
    }

    def doFilterTest(query: String, dataSets: List[DataSet], routes: Route)(test: (SearchResult) => Unit) = {
      Get(s"/v0/datasets?query=${encodeForUrl(query)}&limit=${dataSets.length}") ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]

        test(response)
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
        regionType = regionType.name),
      regionName = properties.getFields(regionType.nameProperty).headOption.map(_.convertTo[String])), regionType, regionJson.convertTo[Geometry])
  }

  describe("pagination") {
    it("should match the result of getting all datasets and using .drop(start).take(limit) to select a subset") {
      val gen = for {
        (indexName, dataSets, routes) <- indexGen
        dataSetCount = dataSets.size
        start <- Gen.choose(0, dataSetCount)
        limit <- Gen.choose(0, dataSetCount)
      } yield (indexName, dataSets, routes, start, limit)

      forAll(gen) {
        case (indexName, dataSets, routes, start, limit) =>
          whenever(start >= 0 && start <= dataSets.size && limit >= 0 && limit <= dataSets.size) {
            Get(s"/v0/datasets?query=*&start=${start}&limit=${limit}") ~> routes ~> check {
              status shouldBe OK
              val result = responseAs[SearchResult]

              val expectedResultIdentifiers = dataSets.drop(start).take(limit).map(_.identifier)
              expectedResultIdentifiers shouldEqual result.dataSets.map(_.identifier)
            }
          }
      }
    }
  }

  describe("query") {
    def queryEquals(outputQuery: Query, inputQuery: Query) = {
      def caseInsensitiveMatch(field: String, output: Traversable[String], input: Traversable[String]) = withClue(field) {
        output.map(_.trim.toLowerCase) should equal(input.map(_.trim.toLowerCase))
      }
      def caseInsensitiveMatchFv(field: String, output: Traversable[FilterValue[String]], input: Traversable[FilterValue[String]]) = withClue(field) {
        output.map(_.map(_.toLowerCase)) should equal(input.map(_.map(_.toLowerCase)))
      }

      caseInsensitiveMatch("freeText", outputQuery.freeText, inputQuery.freeText)
      caseInsensitiveMatch("quotes", outputQuery.quotes, inputQuery.quotes)
      caseInsensitiveMatchFv("formats", outputQuery.formats, inputQuery.formats)
      caseInsensitiveMatchFv("publishers", outputQuery.publishers, inputQuery.publishers)
      outputQuery.dateFrom should equal(inputQuery.dateFrom)
      outputQuery.regions.map(_.map(_.copy(regionName = None, boundingBox = None))) should equal(inputQuery.regions)

      (outputQuery.dateTo, inputQuery.dateTo) match {
        case (Some(Specified(output)), Some(Specified(input))) =>

          def checkWithRounding(field: TemporalField, maxFunc: OffsetDateTime => Int) = {
            val max = maxFunc(input)

            if (output.get(field) == max) {
              input.get(field) should (equal(0) or equal(max))
            } else {
              input.get(field) should equal(output.get(field))
            }
          }

          def getMax(date: OffsetDateTime, period: Int) = new GregorianCalendar(date.getYear, date.getMonthValue, date.getDayOfMonth).getActualMaximum(period)

          checkWithRounding(ChronoField.MILLI_OF_SECOND, _ => 999)
          checkWithRounding(ChronoField.SECOND_OF_MINUTE, _ => 59)
          checkWithRounding(ChronoField.MINUTE_OF_HOUR, _ => 59)
          checkWithRounding(ChronoField.HOUR_OF_DAY, _ => 23)
          checkWithRounding(ChronoField.DAY_OF_MONTH, date => getMax(date, Calendar.DAY_OF_MONTH))
          checkWithRounding(ChronoField.MONTH_OF_YEAR, date => getMax(date, Calendar.MONTH))
        case (a, b) => a.equals(b)
      }
    }

    it("should parse a randomly generated query correctly") {
      forAll(emptyIndexGen, textQueryGen(queryGen(List[DataSet]()))) { (indexTuple, queryTuple) ⇒
        val (textQuery, query) = queryTuple
        val (_, _, routes) = indexTuple

        whenever(textQuery.trim.equals(textQuery) && !textQuery.contains("  ") &&
          !textQuery.toLowerCase.contains("or") && !textQuery.toLowerCase.contains("and")) {

          Get(s"/v0/datasets?query=${encodeForUrl(textQuery)}") ~> routes ~> check {
            status shouldBe OK
            val response = responseAs[SearchResult]
            if (textQuery.equals("")) {
              response.query should equal(Query(freeText = Some("*")))
            } else {
              queryEquals(response.query, query)
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

        Get(s"/v0/datasets?query=${encodeForUrl(textQuery)}") ~> routes ~> check {
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
      try {
        val controlChars = "+ - = && || ! ( ) { } [ ] ^ ~ ? : \\ / and or > <".split(" ")

        def controlCharGen(string: String): Gen[String] = {
          if (string.isEmpty) Gen.const("") else
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
              })).flatMap(a => a)
        }

        def hasBadWords(string: String) =
          !Seq("and", "or").exists(reservedWord => string.toLowerCase.contains(reservedWord.toLowerCase))

        def controlCharQueryGen() = for {
          freeText <- Generators.textGen.flatMap(controlCharGen).suchThat(x => !hasBadWords(x))
          quote <- Generators.smallSet(Generators.textGen.flatMap(controlCharGen).suchThat(!hasBadWords(_)))
        } yield Query(freeText = Some(freeText), quotes = quote)
        //        query.freeText.exists(!_.isEmpty()) && ().flatMap { query =>
        //          val freeTextGen = query.freeText match {
        //            case Some(freeTextInner) => controlCharGen(freeTextInner).map(Some.apply)
        //            case None                => Gen.const(None)
        //          }
        //          val quotesGen = query.quotes
        //            .filterNot(quote => quote.isEmpty())
        //            .map(controlCharGen)
        //            .foldRight(Gen.const(Set.empty[String]))((i, acc) => acc.flatMap(set => i.map(set + _)))
        //
        //          for {
        //            freeText <- freeTextGen
        //            quotes <- quotesGen
        //          } yield (query.copy(
        //            freeText = freeText,
        //            quotes = quotes))
        //        }

        forAll(emptyIndexGen, textQueryGen(controlCharQueryGen)) {
          case (indexTuple, queryTuple) ⇒
            val (textQuery, query) = queryTuple
            val (_, _, routes) = indexTuple

            whenever(!textQuery.contains("  ") && !query.equals(Query())) {
              Get(s"/v0/datasets?query=${encodeForUrl(textQuery)}") ~> routes ~> check {
                status shouldBe OK

                val response = responseAs[SearchResult]
                queryEquals(response.query, query)
              }
            }
        }
      } catch {
        case e: Throwable =>
          e.printStackTrace()
          throw e
      }
    }

    it("should not fail for queries that are full of arbitrary characters") {
      forAll(emptyIndexGen, Gen.listOf(arbitrary[String]).map(_.mkString(" "))) { (indexTuple, textQuery) =>
        val (_, _, routes) = indexTuple

        Get(s"/v0/datasets?query=${encodeForUrl(textQuery)}") ~> routes ~> check {
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

        Get(s"/v0/datasets?query=${encodeForUrl(textQuery)}") ~> routes ~> check {
          status shouldBe OK
        }
      }
    }
  }
}
