package au.csiro.data61.magda.api
import org.scalacheck._
import org.scalacheck.Shrink
import org.scalatest._

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.OK
import akka.http.scaladsl.server.Route
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.search.SearchStrategy
import au.csiro.data61.magda.test.util.ApiGenerators._
import au.csiro.data61.magda.test.util.MagdaMatchers
import org.apache.lucene.analysis.tokenattributes.CharTermAttribute
import org.apache.lucene.analysis.standard.StandardAnalyzer
import au.csiro.data61.magda.test.util.Generators
import au.csiro.data61.magda.util.Regex._

class LanguageAnalyzerSpec extends BaseSearchApiSpec {

  describe("should return the right dataset when searching for that dataset's") {
    describe("title") {
      testDataSetSearch(dataSet => dataSet.title.toSeq)
    }

    describe("description") {
      testDataSetSearch(dataSet => dataSet.description.toSeq)
    }

    describe("keywords") {
      testDataSetSearch(dataSet => dataSet.keywords)
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
      testDataSetSearch(dataSet => dataSet.themes)
    }

    def testDataSetSearch(rawTermExtractor: DataSet => Seq[String]) = {
      def outerTermExtractor(dataSet: DataSet) = rawTermExtractor(dataSet)
        .filter(term => !Generators.filterWordRegex.r.matchesAny(term))
        .filter(term => term.matches(".*[A-Z][a-z].*"))

      def test(dataSet: DataSet, term: String, routes: Route, tuples: List[(DataSet, String)]) = {
        Get(s"""/v0/datasets?query=${encodeForUrl(term)}&limit=10000""") ~> routes ~> check {
          status shouldBe OK
          val result = responseAs[SearchResult]

          withClue(s"term: ${term} for ${outerTermExtractor(dataSet)} in ${result.dataSets.map(dataSet => dataSet.identifier + ": " + outerTermExtractor(dataSet)).mkString(", ")}") {
            result.strategy.get should equal(SearchStrategy.MatchAll)
            result.dataSets.size should be > 0
            result.dataSets.exists(_.identifier.equals(dataSet.identifier)) shouldBe true
          }
        }
      }

      testLanguageFieldSearch(outerTermExtractor, test)
    }
  }

  describe("should return the right publisher when searching by publisher name") {
    def termExtractor(dataSet: DataSet) = dataSet.publisher.toSeq.flatMap(_.name.toSeq)

    def test(dataSet: DataSet, publisherName: String, routes: Route, tuples: List[(DataSet, String)]) = {
      Get(s"""/v0/facets/publisher/options?facetQuery=${encodeForUrl(publisherName)}&limit=10000""") ~> routes ~> check {
        status shouldBe OK
        val result = responseAs[FacetSearchResult]

        val publisher = dataSet.publisher.get

        withClue(s"term: ${publisherName}, publisher: ${dataSet.publisher.map(_.name)} options ${result.options}") {
          result.options.exists { option =>
            option.value.equalsIgnoreCase(publisher.name.get)
            option.identifier.get.equals(publisher.identifier.get)
          } should be(true)
        }
      }
    }

    testLanguageFieldSearch(termExtractor, test)
  }

  describe("should return the right format when searching by format value") {
    def termExtractor(dataSet: DataSet) = dataSet.distributions.flatMap(_.format).filterNot(x => x.equalsIgnoreCase("and") || x.equalsIgnoreCase("or"))

    def test(dataSet: DataSet, formatName: String, routes: Route, tuples: List[(DataSet, String)]) = {
      Get(s"""/v0/facets/format/options?facetQuery=${encodeForUrl(formatName)}&limit=${tuples.size}""") ~> routes ~> check {
        status shouldBe OK
        val result = responseAs[FacetSearchResult]
        val formats = termExtractor(dataSet)

        withClue(s"format: ${formatName} options ${result.options}") {
          result.options.exists(value =>
            formats.exists(format =>
              value.value.equalsIgnoreCase(format))) should be(true)
        }
      }
    }

    testLanguageFieldSearch(termExtractor, test)
  }

  def testLanguageFieldSearch(outerTermExtractor: DataSet => Seq[String], test: (DataSet, String, Route, List[(DataSet, String)]) => Unit) = {
    it("when searching for it directly") {
      def innerTermExtractor(dataSet: DataSet) = outerTermExtractor(dataSet)
        .filterNot(term => Generators.filterWords.contains(term.toLowerCase))
        .filterNot(term => Generators.luceneStopWords.contains(term.toLowerCase))

      doTest(innerTermExtractor)
    }

    it(s"regardless of pluralization/depluralization") {

      def innerTermExtractor(dataSet: DataSet) = outerTermExtractor(dataSet)
        .flatMap(MagdaMatchers.tokenize)
        .view
        .map(_.trim)
        .filterNot(_.contains("."))
        .filterNot(_.contains("'"))
        .filterNot(_.toLowerCase.endsWith("ss"))
        .filterNot(term => Generators.filterWords.contains(term.toLowerCase))
        .filterNot(term => Generators.luceneStopWords.contains(term.toLowerCase))
        .filterNot(x => x.equalsIgnoreCase("and") || x.equalsIgnoreCase("or"))
        .filterNot(_.isEmpty)
        .filterNot(term => term.toLowerCase.endsWith("e") ||
          term.toLowerCase.endsWith("ies") ||
          term.toLowerCase.endsWith("es") ||
          term.toLowerCase.endsWith("y")) // This plays havoc with pluralization because when you add "s" to it, ES chops off the "es at the end
        .flatMap {
          case term if term.last.toLower.equals('s') =>
            val depluralized = term.take(term.length - 1)
            if (MagdaMatchers.porterStem(term) == depluralized) {
              Some(depluralized)
            } else None
          case term =>
            val pluralized = term + "s"
            if (MagdaMatchers.porterStem(pluralized) == term) {
              Some(pluralized)
            } else None
        }
        .filterNot(term => StandardAnalyzer.ENGLISH_STOP_WORDS_SET.contains(term.toLowerCase))

      doTest(innerTermExtractor)
    }

    def doTest(innerTermExtractor: DataSet => Seq[String]) = {
      def getIndividualTerms(terms: Seq[String]) = terms.flatMap(MagdaMatchers.tokenize)

      val indexAndTermsGen = smallIndexGen.flatMap {
        case (indexName, dataSetsRaw, routes) ⇒
          val indexedDataSets = dataSetsRaw.filterNot(dataSet ⇒ innerTermExtractor(dataSet).isEmpty)

          val dataSetAndTermGens = indexedDataSets.flatMap { dataSet =>
            val terms = getIndividualTerms(innerTermExtractor(dataSet))
              .filter(_.length > 2)
              .filterNot(term => Seq("and", "or", "").contains(term.trim.toLowerCase))

            if (!terms.isEmpty) {
              val termGen = for {
                noOfTerms <- Gen.choose(1, terms.length)
                selectedTerms <- Gen.pick(noOfTerms, terms)
              } yield selectedTerms.mkString(" ")

              Seq(termGen.map((dataSet, _)))
            } else
              Nil
          }

          val combinedDataSetAndTermGen = dataSetAndTermGens.foldRight(Gen.const(List[(DataSet, String)]()))((soFar, current) =>
            for {
              currentInner <- current
              list <- soFar
            } yield currentInner :+ list)

          combinedDataSetAndTermGen.map((indexName, _, routes))
      }

      // We don't want to shrink this kind of tuple at all ever.
      implicit def dataSetStringShrinker(implicit s: Shrink[DataSet], s1: Shrink[Seq[String]]): Shrink[(DataSet, String)] = Shrink[(DataSet, String)] {
        case (dataSet, string) =>
          val shrunk = string.split("\\s").filter(_ != string)

          logger.error("Shrinking " + string + " to " + shrunk)

          shrunk.map((dataSet, _)).toStream
      }

      // Make sure a shrink for the indexAndTerms gen simply shrinks the list of datasets
      implicit def indexAndTermsShrinker(implicit s: Shrink[String], s1: Shrink[List[(DataSet, String)]], s2: Shrink[Route]): Shrink[(String, List[(DataSet, String)], Route)] = Shrink[(String, List[(DataSet, String)], Route)] {
        case (indexName, terms, route) ⇒
          Shrink.shrink(terms).map { shrunkTerms ⇒
            val x = putDataSetsInIndex(shrunkTerms.map(_._1))
            logger.error("Shrinking " + terms.size + " to " + shrunkTerms.size)

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