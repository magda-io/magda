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
import au.csiro.data61.magda.test.util.ApiGenerators._
import au.csiro.data61.magda.test.util.Generators._
import com.monsanto.labs.mwundo.GeoJson.Polygon
import com.monsanto.labs.mwundo.GeoJson._
import au.csiro.data61.magda.util.MwundoJTSConversions._
import spray.json.JsString
import au.csiro.data61.magda.spatial.RegionSource
import akka.http.scaladsl.server.Route

class LanguageAnalyzerSpec extends BaseSearchApiSpec {

  describe("should return the right dataset when searching for that dataset's") {
    describe("title") {
      testDataSetSearch(dataSet => dataSet.title.toSeq)
    }

    describe("description") {
      testDataSetSearch(dataSet => dataSet.description.toSeq)
    }

    describe("keywords") {
      testDataSetSearch(dataSet => dataSet.keyword)
    }

    describe("publisher name") {
      testDataSetSearch(dataSet => dataSet.publisher.toSeq.flatMap(_.name.toSeq))
    }

    describe("distribution title") {
      testDataSetSearch(dataSet => dataSet.distributions.map(_.title))
    }

    describe("distribution description") {
      testDataSetSearch(dataSet => dataSet.distributions.flatMap(_.description.toSeq))
    }

    describe("theme") {
      testDataSetSearch(dataSet => dataSet.theme)
    }

    def testDataSetSearch(termExtractor: DataSet => Seq[String]) = {
      def test(dataSet: DataSet, term: String, routes: Route, tuples: List[(DataSet, String)]) = {
        Get(s"""/datasets/search?query=${encodeForUrl(term)}&limit=${tuples.size}""") ~> routes ~> check {
          status shouldBe OK
          val result = responseAs[SearchResult]

          withClue(s"term: ${term} and identifier ${dataSet.identifier} in ${result.dataSets.map(dataSet => dataSet.identifier + ": " + termExtractor(dataSet)).mkString(", ")}") {
            result.dataSets.size should be > 0
            result.dataSets.exists(_.identifier.equals(dataSet.identifier)) shouldBe true
          }
        }
      }

      testLanguageFieldSearch(termExtractor, test)
    }
  }

  describe("should return the right publisher when searching by publisher name") {
    def test(dataSet: DataSet, publisherName: String, routes: Route, tuples: List[(DataSet, String)]) = {
      Get(s"""/facets/publisher/options/search?facetQuery=${encodeForUrl(publisherName)}&limit=${tuples.size}""") ~> routes ~> check {
        status shouldBe OK
        val result = responseAs[FacetSearchResult]
        withClue(s"publisher: ${publisherName} options ${result.options}") {
          result.options.exists(_.value.contains(publisherName)) should be(true)
        }
      }
    }

    testLanguageFieldSearch(dataSet => dataSet.publisher.toSeq.flatMap(_.name.toSeq), test)
  }

  describe("should return the right format when searching by format value") {
    def test(dataSet: DataSet, formatName: String, routes: Route, tuples: List[(DataSet, String)]) = {
      Get(s"""/facets/format/options/search?facetQuery=${encodeForUrl(formatName)}&limit=${tuples.size}""") ~> routes ~> check {
        status shouldBe OK
        val result = responseAs[FacetSearchResult]
        withClue(s"format: ${formatName} options ${result.options}") {
          result.options.exists(_.value.contains(formatName)) should be(true)
        }
      }
    }

    testLanguageFieldSearch(dataSet => dataSet.distributions.flatMap(_.format), test)
  }

  def testLanguageFieldSearch(termExtractor: DataSet => Seq[String], test: (DataSet, String, Route, List[(DataSet, String)]) => Unit) = {
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
        .filter(_.matches(".*[A-Za-z].*"))

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
        case (string, dataSet) => Stream.empty
      }

      // Make sure a shrink for the indexAndTerms gen simply shrinks the list of datasets
      implicit def indexAndTermsShrinker(implicit s: Shrink[String], s1: Shrink[List[(DataSet, String)]], s2: Shrink[Route]): Shrink[(String, List[(DataSet, String)], Route)] = Shrink[(String, List[(DataSet, String)], Route)] {
        case (indexName, terms, route) ⇒
          Shrink.shrink(terms).map { shrunkTerms ⇒
            val x = putDataSetsInIndex(shrunkTerms.map(_._1))

            (x._1, shrunkTerms, x._3)
          }
      }

      forAll(indexAndTermsGen) {
        case (indexName, tuples, routes) =>
          whenever(!tuples.isEmpty) {
            tuples.foreach {
              case (dataSet, term) => test(dataSet, term, routes, tuples)
            }
          }
      }
    }
  }
}