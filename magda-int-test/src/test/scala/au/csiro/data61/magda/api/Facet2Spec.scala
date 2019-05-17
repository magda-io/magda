package au.csiro.data61.magda.api

import java.time.OffsetDateTime

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.server.Route
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.misc.{DataSet, _}
import au.csiro.data61.magda.search.SearchStrategy
import au.csiro.data61.magda.test.util.ApiGenerators._
import au.csiro.data61.magda.test.util.Generators
import org.scalacheck._

class Facet2Spec extends FacetSpecBase {
  override var defaultGen: Gen[((String, List[DataSet], Route), (String, Query), Seq[Nothing])] = _

  override def beforeAll() = {
    println("Testing Facet2Spec")
    super.beforeAll()
    defaultGen = for {
      tuple <- mediumIndexGen
      query <- textQueryGen(queryGen(tuple._2))
    } yield (tuple, query, Seq())
  }

  describe("facets") {
    println("Testing facets")

    describe("format") {
      println("  - Testing format")
      def reducer(dataSet: DataSet) = dataSet.distributions.flatMap(_.format.map(_.toLowerCase)).toSet
      def queryToInt(query: Query) = query.formats.size

      def filterQueryGen(dataSets: List[DataSet]) = Generators.smallSet(formatQueryGen(dataSets)).flatMap(formats => Query(formats = formats))
      def specificBiasedQueryGen(dataSets: List[DataSet]) = Query(formats = dataSets.flatMap(_.distributions.flatMap(_.format)).map(Specified.apply).toSet)

      genericFacetSpecs(Format, reducer, queryToInt, filterQueryGen, specificBiasedQueryGen)
    }

    describe("year") {
      println("  - Testing year")
      it("with no query") {
        println("    - Testing with no query")
        checkFacetsNoQuery() { (dataSets, facetSize) =>
          checkDataSetResult(dataSets, responseAs[SearchResult])
        }
      }

      it("with a query") {
        println("    - Testing with a query")
        val queryGen = for {
          dateFrom <- dateFromGen
          dateTo <- dateToGen
          result <- Gen.oneOf(Query(dateFrom = Some(dateFrom)), Query(dateTo = Some(dateTo)), Query(dateFrom = Some(dateFrom), dateTo = Some(dateTo)))
        } yield result

        checkFacetsWithQuery(dataSets => textQueryGen(queryGen)) { (dataSets, facetSize, query, allDataSets, routes) ⇒
          val result = responseAs[SearchResult]
          whenever(result.strategy.get == SearchStrategy.MatchAll) {
            val filteredDataSets = filterDataSetsForDateRange(dataSets, query.dateFrom, query.dateTo)
            checkDataSetResult(filteredDataSets, result)
          }
        }
      }

      def checkDataSetResult(dataSets: List[DataSet], result: SearchResult) = {
        dataSets match {
          case Nil =>
            result.temporal.flatMap(_.end) shouldEqual None
            result.temporal.flatMap(_.start) shouldEqual None
          case dataSets =>
            val expectedMax = dataSets.map(dataSet => dataSet.temporal.flatMap(_.end).flatMap(_.date)).flatten match {
              case Seq() => None
              case dates => Some(dates.max)
            }
            val expectedMin = dataSets.map(dataSet => dataSet.temporal.flatMap(_.start).flatMap(_.date)).flatten match {
              case Seq() => None
              case dates => Some(dates.min)
            }

            result.temporal.flatMap(_.end).flatMap(_.date).map(_.toEpochSecond()) shouldEqual expectedMax.map(_.toEpochSecond)
            result.temporal.flatMap(_.start).flatMap(_.date).map(_.toEpochSecond()) shouldEqual expectedMin.map(_.toEpochSecond)
        }
      }

      def filterDataSetsForDateRange(dataSets: List[DataSet], lowerBound: Option[FilterValue[OffsetDateTime]], upperBound: Option[FilterValue[OffsetDateTime]]) = dataSets
        .filter { dataSet =>
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
    }
  }
}
