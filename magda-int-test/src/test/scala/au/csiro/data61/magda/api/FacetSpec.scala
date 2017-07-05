package au.csiro.data61.magda.api

import java.io.File
import java.time.{ Instant, OffsetDateTime }
import java.util.Properties
import java.util.concurrent.ConcurrentHashMap

import akka.actor.{ ActorSystem, Scheduler }
import akka.event.{ Logging, LoggingAdapter }
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.ContentTypes.`application/json`
import akka.http.scaladsl.model.StatusCodes.{ InternalServerError, OK }
import akka.http.scaladsl.server.Route
import akka.http.scaladsl.testkit.{ RouteTestTimeout, ScalatestRouteTest }
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.api.model.{ Protocols, SearchResult }
import au.csiro.data61.magda.model.misc.{ DataSet, _ }
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import au.csiro.data61.magda.search.elasticsearch._
import au.csiro.data61.magda.test.util.ApiGenerators._
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.testkit.ElasticSugar
import com.typesafe.config.{ Config, ConfigFactory }
import org.elasticsearch.common.settings.Settings
import org.scalacheck.Shrink
import org.scalacheck._
import org.scalactic.anyvals.PosInt
import org.scalatest.{ BeforeAndAfter, Matchers, _ }
import org.scalatest.prop.GeneratorDrivenPropertyChecks
import spray.json._

import scala.collection.JavaConverters._
import scala.concurrent.{ ExecutionContext, Future }
import scala.concurrent.duration.DurationInt
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicInteger
import java.util.function.Consumer
import au.csiro.data61.magda.util.SetExtractor
import org.scalacheck.Arbitrary._
import au.csiro.data61.magda.model.Temporal.PeriodOfTime
import au.csiro.data61.magda.search.SearchStrategy.{ MatchAll, MatchPart }
import java.util.HashMap
import com.sksamuel.elastic4s.TcpClient
import com.sksamuel.elastic4s.ElasticDsl
import org.elasticsearch.cluster.health.ClusterHealthStatus
import com.sksamuel.elastic4s.embedded.LocalNode
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.api.model.Protocols
import au.csiro.data61.magda.util.SetExtractor
import au.csiro.data61.magda.test.util.Generators

class FacetSpec extends BaseSearchApiSpec {

  describe("facets") {
    def checkFacetsNoQuery(inner: (List[DataSet], Int) ⇒ Unit) = {
      forAll(mediumIndexGen, Gen.posNum[Int], Gen.posNum[Int], Gen.posNum[Int]) { (tuple, rawFacetSize, start, limit) ⇒
        val (indexName, dataSets, routes) = tuple
        val facetSize = Math.max(rawFacetSize, 1)

        whenever(start >= 0 && limit >= 0) {
          Get(s"/v0/datasets?query=*&start=$start&limit=$limit&facetSize=$facetSize") ~> routes ~> check {
            status shouldBe OK
            inner(dataSets, facetSize)
          }
        }
      }
    }

    def checkFacetsWithQuery(thisQueryGen: Gen[(String, Query)] = textQueryGen(queryGen), thisIndexGen: Gen[(String, List[DataSet], Route)] = mediumIndexGen, facetSizeGen: Gen[Int] = Gen.posNum[Int])(inner: (List[DataSet], Int, Query, List[DataSet], Route) ⇒ Unit) = {
      forAll(thisIndexGen, thisQueryGen, facetSizeGen) { (tuple, query, rawFacetSize) ⇒
        val (indexName, dataSets, routes) = tuple
        val (textQuery, objQuery) = query
        val facetSize = Math.max(rawFacetSize, 1)

        Get(s"/v0/datasets?query=${encodeForUrl(textQuery)}&start=0&limit=${dataSets.size}&facetSize=$facetSize") ~> routes ~> check {
          status shouldBe OK
          inner(responseAs[SearchResult].dataSets, facetSize, objQuery, dataSets, routes)
        }
      }
    }

    def checkFacetsBoth(inner: (List[DataSet], Int) ⇒ Unit) = {
      it("with no query and various pagination values") {
        checkFacetsNoQuery(inner(_, _))
      }
      it("with a query") {
        checkFacetsWithQuery()((dataSets, facetSize, _, _, _) ⇒ inner(dataSets, facetSize))
      }
    }

    def searchWithoutFacetFilter(query: Query, facetType: FacetType, routes: Route, outerResult: SearchResult, allDataSets: List[DataSet])(inner: (SearchResult, List[DataSet]) => Unit) = {
      val queryWithoutFilter = FacetDefinition.facetDefForType(facetType).removeFromQuery(query)
      whenever(!queryWithoutFilter.equals(Query())) {
        val textQueryWithoutFacet = queryToText(queryWithoutFilter)

        Get(s"/v0/datasets?query=${encodeForUrl(textQueryWithoutFacet)}&start=0&limit=${allDataSets.size}&facetSize=1") ~> routes ~> check {
          status shouldBe OK
          val innerResult = responseAs[SearchResult]
          val innerDataSets = innerResult.dataSets

          whenever(innerResult.strategy.get.equals(outerResult.strategy.get) && innerResult.strategy.get.equals(MatchAll)) {
            inner(innerResult, innerDataSets)
          }
        }
      }
    }

    def genericFacetSpecs(facetType: FacetType, reducer: DataSet ⇒ Set[String], queryCounter: Query ⇒ Int, filterQueryGen: Gen[Query], exactGen: Gen[Query]) = {
      def filter(dataSet: DataSet, facetOption: FacetOption) = {
        val facetValue = reducer(dataSet)

        def matches = facetValue.exists(_.equalsIgnoreCase(facetOption.value))

        if (facetOption.value.equals(config.getString("strings.unspecifiedWord"))) {
          facetValue.isEmpty || facetValue.forall(_.equals("")) || matches
        } else {
          matches
        }
      }

      def groupResult(dataSets: Seq[DataSet]): Map[String, Set[DataSet]] = {
        dataSets.foldRight(Map[String, Set[DataSet]]()) { (currentDataSet, aggregator) ⇒
          val reducedRaw = reducer(currentDataSet)
          val reduced = if (reducedRaw.isEmpty) Set(config.getString("strings.unspecifiedWord")) else reducedRaw

          reduced.foldRight(aggregator) { (string, aggregator) ⇒
            aggregator + (string -> (aggregator.get(string) match {
              case Some(existingDataSets) ⇒ existingDataSets + currentDataSet
              case None                   ⇒ Set(currentDataSet)
            }))
          }
        }
      }

      def getFacet(result: SearchResult) = result.facets.get.find(_.id.equals(facetType.id)).get

      describe("all facet options should correspond with grouping the datasets for that query") {
        it("without query") {
          checkFacetsNoQuery { (dataSets: List[DataSet], facetSize: Int) ⇒
            val result = responseAs[SearchResult]

            val groupedResult = groupResult(dataSets)
            val facet = getFacet(result)

            whenever(!facet.options.isEmpty) {
              facet.options.foreach { facetOption ⇒
                withClue(s"With reduced values (${groupedResult.mapValues(_.size)}) and facetOption ${facetOption}: ") {
                  if (facetOption.hitCount != 0) {
                    groupedResult.contains(facetOption.value) should be(true)
                    facetOption.hitCount should be(groupedResult(facetOption.value).size)
                  } else {
                    groupedResult.contains(facetOption.value) should be(false)
                  }
                }
              }
            }
          }
        }

        describe("with query") {
          it("with matched facet options") {
            checkFacetsWithQuery(textQueryGen(filterQueryGen), mediumIndexGen) { (dataSets, facetSize, query, allDataSets, routes) ⇒
              val outerResult = responseAs[SearchResult]
              val facet = getFacet(outerResult)

              val matched = facet.options.filter(_.matched)
              whenever(matched.size > 0 && outerResult.strategy.get == MatchAll) {
                val groupedResults = groupResult(dataSets).mapValues(_.size)
                matched.foreach { option ⇒

                  withClue(s"For option ${option} and grouped datasets ${groupedResults} and all options ${facet.options}") {
                    groupedResults(option.value).toLong should equal(option.hitCount)
                  }
                }
              }
            }
          }

          it("matched facets should come above unmatched") {
            checkFacetsWithQuery(textQueryGen(filterQueryGen), mediumIndexGen) { (dataSets, facetSize, query, allDataSets, routes) ⇒
              val outerResult = responseAs[SearchResult]
              val facet = getFacet(outerResult)

              val (matched, unmatched) = facet.options.partition(_.matched)
              whenever(matched.size > 0 && unmatched.size > 0) {
                facet.options should equal(matched ++ unmatched)
              }
            }
          }

          it("with unmatched facet options") {
            checkFacetsWithQuery(textQueryGen(queryGen)) { (dataSets, facetSize, query, allDataSets, routes) ⇒
              val outerResult = responseAs[SearchResult]
              val facet = getFacet(outerResult)

              searchWithoutFacetFilter(query, facetType, routes, outerResult, allDataSets) { (innerResult, innerDataSets) =>
                val unmatched = facet.options.filter(!_.matched)

                whenever(!unmatched.isEmpty) {
                  unmatched.foreach { option ⇒
                    val grouped = groupResult(innerDataSets)

                    withClue(s"For option ${option} and grouped datasets ${grouped.mapValues(_.size)}") {
                      grouped(option.value).size shouldEqual option.hitCount
                    }
                  }
                }
              }
            }
          }
        }

        describe("exact match facets") {
          it("should not show filters that do not have records") {
            checkFacetsWithQuery(textQueryGen(exactGen), mediumIndexGen) { (dataSets, facetSize, query, allDataSets, routes) ⇒
              val outerResult = responseAs[SearchResult]
              val facet = getFacet(outerResult)

              val exactMatchFacets = facet.options.filter(option => option.matched && option.hitCount == 0)

              whenever(exactMatchFacets.size > 0) {
                val grouped = groupResult(allDataSets)

                exactMatchFacets.foreach { option =>
                  val globalDataSets = allDataSets.filter(filter(_, option))

                  withClue(s"with option $option and $grouped") {
                    globalDataSets.size should be > 0
                  }
                }
              }
            }
          }
        }
      }

      def getFormats(dataSets: List[DataSet]) = dataSets.map(_.distributions.map(_.format.getOrElse(config.getString("strings.unspecifiedWord"))).groupBy(identity).mapValues(_.size))

      describe("each dataset should be aggregated into a facet unless facet size was too small to accommodate it") {
        it("without query") {
          checkFacetsNoQuery { (dataSets: List[DataSet], facetSize: Int) ⇒
            val result = responseAs[SearchResult]
            val groupedResult = groupResult(dataSets)

            whenever(facetSize >= groupedResult.size + queryCounter(result.query)) {
              val facet = getFacet(result)

              withClue(s"With grouped result ${groupedResult}") {
                groupedResult.mapValues(_.size).foreach {
                  case (facetValue, hitCount) ⇒
                    val option = facet.options.find(_.value.equals(facetValue))
                    withClue(s" and option $option: ") {
                      option.isDefined should be(true)
                      hitCount should equal(option.get.hitCount)
                    }
                }
              }
            }
          }
        }

        describe("with query") {
          it("for matched facet options") {
            checkFacetsWithQuery(facetSizeGen = Gen.const(Int.MaxValue)) { (dataSets, facetSize, query, allDataSets, routes) ⇒
              val outerResult = responseAs[SearchResult]
              val outerDataSets = outerResult.dataSets
              val facet = getFacet(outerResult)

              val outerGroupedResults = groupResult(outerDataSets)
              whenever(facetSize == Int.MaxValue && outerResult.strategy.get == MatchAll) {
                withClue(s"With grouped results ${outerGroupedResults.mapValues(_.size)} and options ${facet.options}") {
                  outerGroupedResults.mapValues(_.size).foreach {
                    case (facetValue, hitCount) ⇒
                      val option = facet.options.find(_.value.equals(facetValue))
                      withClue(s" and option $facetValue: ") {
                        option.isDefined should be(true)
                        if (option.get.matched) {
                          hitCount should equal(option.get.hitCount)
                        }
                      }
                  }
                }
              }
            }
          }

          it("for unmatched facet options") {
            checkFacetsWithQuery(textQueryGen(queryGen), facetSizeGen = Gen.const(Int.MaxValue)) { (dataSets, facetSize, query, allDataSets, routes) ⇒
              val outerResult = responseAs[SearchResult]
              val facet = getFacet(outerResult)

              searchWithoutFacetFilter(query, facetType, routes, outerResult, allDataSets) { (innerResult, innerDataSets) =>
                val innerGroupedResult = groupResult(innerDataSets)

                whenever(facetSize == Int.MaxValue) {
                  withClue(s"With grouped results ${innerGroupedResult.mapValues(_.size)} ") {
                    innerGroupedResult.mapValues(_.size).foreach {
                      case (facetValue, hitCount) ⇒
                        val option = facet.options.find(_.value.equals(facetValue))
                        withClue(s" and option $option: ") {
                          option.isDefined should be(true)
                          if (!option.get.matched) {
                            hitCount should equal(option.get.hitCount)
                          }
                        }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    describe("should never generate a facet size bigger than what was asked for") {
      checkFacetsBoth { (dataSets: List[DataSet], facetSize: Int) ⇒
        val result = responseAs[SearchResult]
        val facets = FacetType.all.flatMap(facetType ⇒ result.facets.get.find(facet => facetType.id.equals(facet.id)))

        whenever(!facets.isEmpty) {
          facets.foreach { facet ⇒
            facet.options.size should be <= facetSize
          }
        }
      }
    }

    describe("publisher") {
      def reducer(dataSet: DataSet) = Set(dataSet.publisher.flatMap(_.name)).flatten
      def queryToInt(query: Query) = query.publishers.size

      val queryGen = for {
        publishers <- Generators.smallSet(publisherQueryGen)
      } yield new Query(publishers = publishers)

      val specificBiasedQueryGen = Gen.uuid.flatMap(uuid =>
        for {
          publishers <- Gen.nonEmptyContainerOf[Set, FilterValue[String]](Generators.publisherGen.flatMap(Gen.oneOf(_)).map(Specified.apply))
        } yield Query(quotes = Set(uuid.toString), publishers = publishers)).suchThat(queryIsSmallEnough)

      describe("should have identifiers") {
        implicit val stringShrink: Shrink[List[Agent]] = Shrink { string =>
          Stream.empty
        }

        it("in general") {
          try {
            forAll(indexGen, textQueryGen(queryGen), Gen.posNum[Int]) { (tuple, textQuery, facetSize) ⇒
              val (indexName, dataSets, routes) = tuple

              val publishers = dataSets.flatMap(_.publisher).distinct

              val publisherLookup = publishers
                .groupBy(_.name.get.toLowerCase)

              Get(s"/v0/datasets?query=${encodeForUrl(textQuery._1)}&start=0&limit=0&facetSize=${Math.max(facetSize, 1)}") ~> routes ~> check {
                status shouldBe OK

                val result = responseAs[SearchResult]

                val facet = result.facets.get.find(_.id.equals(Publisher.id)).get

                withClue("publishers " + publisherLookup) {
                  facet.options.filterNot(_.value == "Unspecified").foreach { x =>
                    val matchedPublishers = publisherLookup(x.value.toLowerCase)
                    matchedPublishers.exists(publisher => publisher.identifier.get.equals(x.identifier.get)) should be(true)
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

        it("for exact match facets") {
          forAll(mediumIndexGen, textQueryGen(specificBiasedQueryGen), Gen.posNum[Int], Generators.publisherAgentGen) { (tuple, textQuery, facetSize, publishers) ⇒
            val (indexName, dataSets, routes) = tuple

            Get(s"/v0/datasets?query=${encodeForUrl(textQuery._1)}&start=0&limit=0&facetSize=${Math.max(facetSize, 1)}") ~> routes ~> check {
              status shouldBe OK

              val result = responseAs[SearchResult]

              val facet = result.facets.get.find(_.id.equals(Publisher.id)).get

              val exactMatchFacets = facet.options.filter(option => option.matched && option.hitCount == 0)

              val publisherLookup = publishers
                .groupBy(_.name.get.toLowerCase)

              whenever(exactMatchFacets.size > 0) {
                facet.options.filterNot(_.value == "Unspecified").foreach { x =>
                  withClue("for facet " + x.toString) {
                    x.identifier should not be (None)
                    val matchedPublishers = publisherLookup(x.value.toLowerCase)
                    matchedPublishers.exists(publisher => publisher.identifier.get.equals(x.identifier.get)) should be(true)
                  }
                }
              }
            }
          }
        }
      }
      genericFacetSpecs(Publisher, reducer, queryToInt, queryGen, specificBiasedQueryGen)

    }

    describe("format") {
      def reducer(dataSet: DataSet) = dataSet.distributions.map(_.format.getOrElse(config.getString("strings.unspecifiedWord"))).toSet
      def queryToInt(query: Query) = query.formats.size

      val queryGen = for {
        formats <- Generators.smallSet(formatQueryGen)
      } yield Query(formats = formats)

      val specificBiasedQueryGen = Gen.uuid.flatMap(uuid =>
        for {
          formats <- Gen.nonEmptyContainerOf[Set, FilterValue[String]](Generators.formatGen.map(x => Specified(x._2)))
        } yield Query(quotes = Set(uuid.toString), formats = formats)).suchThat(queryIsSmallEnough)

      genericFacetSpecs(Format, reducer, queryToInt, queryGen, specificBiasedQueryGen)
    }

    describe("year") {
      describe("should generate non-overlapping facets") {
        checkFacetsBoth { (dataSets, facetSize) ⇒
          val result = responseAs[SearchResult]
          val yearFacet = result.facets.get.find(_.id.equals(Year.id)).get

          val options = yearFacet.options

          val allFacetPairings = for {
            facet1 ← options
            facet2 ← options.filterNot(_ == facet1)
          } yield ((facet1.lowerBound.get, facet1.upperBound.get), (facet2.lowerBound.get, facet2.upperBound.get))

          whenever(!allFacetPairings.isEmpty) {
            allFacetPairings.foreach { pair ⇒
              val optionValues = options.map(_.value)
              val dataSetYears = dataSets.map(_.temporal.getOrElse("(no temporal)"))
              withClue(s"for options $optionValues and dataSet years $dataSetYears") {
                overlaps(pair) should be(false)
              }
            }
          }
        }
      }

      describe("should be consistent with grouping all the facet results by temporal coverage year") {
        def getDataSetYears(dataSets: List[DataSet]) = dataSets.map(_.temporal.map(temporal ⇒ temporal.start.flatMap(_.date.map(_.getYear)) + "-" + temporal.end.flatMap(_.date.map(_.getYear))).getOrElse("(no temporal)"))

        it("with no query") {
          checkFacetsNoQuery { (dataSets, facetSize) ⇒
            val result = responseAs[SearchResult]
            val yearFacet = result.facets.get.find(_.id.equals(Year.id)).get

            whenever(!yearFacet.options.isEmpty) {
              yearFacet.options.foreach { option ⇒
                val matchingDataSets = filterDataSetsForYearRange(dataSets, option.lowerBound.get, option.upperBound.get)

                withClue(s"For option ${option.value} and years ${getDataSetYears(dataSets)}") {
                  matchingDataSets.size shouldEqual option.hitCount
                }
              }
            }
          }
        }

        describe("with a query") {
          it("for matched facet options") {
            val queryGen = for {
              dateFrom <- dateFromGen
              dateTo <- dateToGen
              result <- Gen.oneOf(Query(dateFrom = Some(dateFrom)), Query(dateTo = Some(dateTo)), Query(dateFrom = Some(dateFrom), dateTo = Some(dateTo)))
            } yield result

            checkFacetsWithQuery(textQueryGen(queryGen)) { (dataSets, facetSize, query, allDataSets, routes) ⇒
              val outerResult = responseAs[SearchResult]
              val yearFacet = outerResult.facets.get.find(_.id.equals(Year.id)).get

              val matched = yearFacet.options.filter(_.matched)

              whenever(!matched.isEmpty && outerResult.strategy.get == MatchAll) {
                matched.foreach { option ⇒
                  val facetDataSets = filterDataSetsForYearRange(dataSets, option.lowerBound.get, option.upperBound.get)

                  withClue(s"For option ${option.value} and years ${getDataSetYears(dataSets)}") {
                    facetDataSets.size shouldEqual option.hitCount
                  }
                }
              }
            }
          }

          it("for unmatched facet options") {
            val yearQueryGen = Gen.option(Gen.alphaNumChar).flatMap(char =>
              Query(freeText = char.map(_.toString), quotes = Set[String](), publishers = Set[FilterValue[String]](), regions = Set[FilterValue[Region]](), formats = Set[FilterValue[String]]()))

            checkFacetsWithQuery(textQueryGen(yearQueryGen)) { (dataSets, facetSize, query, allDataSets, routes) ⇒
              val outerResult = responseAs[SearchResult]
              val yearFacet = outerResult.facets.get.find(_.id.equals(Year.id)).get

              searchWithoutFacetFilter(query, Year, routes, outerResult, allDataSets) { (innerResult, innerDataSets) =>
                val unmatched = yearFacet.options.filter(!_.matched)

                whenever(!unmatched.isEmpty) {
                  unmatched.foreach { option ⇒
                    val facetDataSets = filterDataSetsForYearRange(innerDataSets, option.lowerBound.get, option.upperBound.get)

                    withClue(s"For option ${option.value} and years ${getDataSetYears(dataSets)}") {
                      facetDataSets.size shouldEqual option.hitCount
                    }
                  }
                }
              }
            }
          }
        }
      }

      describe("with no query") {
        it("should generate even facets") {
          checkFacetsNoQuery { (dataSets, facetSize) ⇒
            val result = responseAs[SearchResult]
            val yearFacet = result.facets.get.find(_.id.equals(Year.id)).get

            whenever(!yearFacet.options.isEmpty) {
              yearFacet.options.foreach { option ⇒
                val upperBound = option.upperBound.get.toInt
                val lowerBound = option.lowerBound.get.toInt
                val size = upperBound - lowerBound + 1

                option.value should equal(
                  if (lowerBound == upperBound) lowerBound.toString
                  else s"$lowerBound - " + s"$upperBound")
                YearFacetDefinition.YEAR_BIN_SIZES should contain(size)
                if (facetSize > 1) withClue(s"[$lowerBound-$upperBound with size $size]") {
                  lowerBound % size shouldEqual 0
                }
              }
            }
          }
        }

        it("should only have gaps where there are no results") {
          checkFacetsNoQuery { (dataSets, facetSize) ⇒
            val result = responseAs[SearchResult]
            val yearFacet = result.facets.get.find(_.id.equals(Year.id)).get

            whenever(facetSize > 1 && yearFacet.options.size > 1) {
              yearFacet.options.reverse.sliding(2).foreach {
                case Seq(before, after) ⇒
                  val gap = after.lowerBound.get - before.upperBound.get
                  if (gap != 1) {
                    val options = yearFacet.options.map(_.value)
                    withClue(s"For facets ${options}") {
                      filterDataSetsForYearRange(dataSets, before.upperBound.get + 1, after.lowerBound.get - 1).size should equal(0)
                    }
                  }
              }
            }
          }
        }
      }

      def filterDataSetsForYearRange(dataSets: List[DataSet], lowerBound: Int, upperBound: Int) = dataSets
        .filter { dataSet ⇒
          val start = dataSet.temporal.flatMap(_.start).flatMap(_.date)
          val end = dataSet.temporal.flatMap(_.end).flatMap(_.date)

          (start.orElse(end), end.orElse(start)) match {
            case (Some(dataSetStart), Some(dataSetEnd)) ⇒
              dataSetStart.getYear <= upperBound && dataSetEnd.getYear >= lowerBound
            case _ ⇒ false
          }
        }

      def filterDataSetsForDateRange(dataSets: List[DataSet], lowerBound: Option[FilterValue[OffsetDateTime]], upperBound: Option[FilterValue[OffsetDateTime]]) = dataSets
        .filter { dataSet ⇒
          (lowerBound, upperBound) match {
            case (Some(Unspecified()), Some(Unspecified())) | (Some(Unspecified()), None) | (None, Some(Unspecified())) =>
              dataSet.temporal.map(temporal => temporal.start.isEmpty && temporal.end.isEmpty).getOrElse(true)
            case _ =>
              val startOption = dataSet.temporal.flatMap(_.start).flatMap(_.date)
              val endOption = dataSet.temporal.flatMap(_.end).flatMap(_.date)

              val start = startOption.orElse(endOption).getOrElse(OffsetDateTime.MAX)
              val end = endOption.orElse(startOption).getOrElse(OffsetDateTime.MIN)

              val lower = lowerBound.flatMap(a => a).getOrElse(OffsetDateTime.MIN)
              val upper = upperBound.flatMap(a => a).getOrElse(OffsetDateTime.MAX)

              !(start.isAfter(upper) || end.isBefore(lower))
          }
        }

      def overlaps(tuple: ((Int, Int), (Int, Int))) = {
        val ((lowerBound1, upperBound1), (lowerBound2, upperBound2)) = tuple
        (lowerBound1 <= lowerBound2 && upperBound1 > lowerBound2) || (upperBound1 >= upperBound2 && lowerBound1 < upperBound2)
      }

      def formatYears(dataSet: DataSet) = s"${dataSet.temporal.flatMap(_.start.flatMap(_.date.map(_.getYear))).getOrElse("n/a")}-${dataSet.temporal.flatMap(_.end.flatMap(_.date.map(_.getYear))).getOrElse("n/a")}"

    }
  }
}
