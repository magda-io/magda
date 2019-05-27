package au.csiro.data61.magda.api

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.OK
import akka.http.scaladsl.server.Route
import au.csiro.data61.magda.model.misc._

class LanguageAnalyzer_4_Spec extends LanguageAnalyzerSpecBase {
  override def beforeAll(): Unit = {
    super.beforeAll()
  }

  describe("should return the right format when searching by format value") {
    def termExtractor(dataSet: DataSet) = dataSet.distributions.flatMap(_.format).filterNot(x => x.equalsIgnoreCase("and") || x.equalsIgnoreCase("or"))

    def test(dataSet: DataSet, formatName: String, routes: Route, tuples: List[(DataSet, String)]) = {
      Get(s"""/v0/facets/format/options?facetQuery=${encodeForUrl(formatName)}&limit=${tuples.size}""") ~> addSingleTenantIdHeader ~> routes ~> check {
        status shouldBe OK
        val result = responseAs[FacetSearchResult]
        val formats = termExtractor(dataSet)

        withClue(s"term: $formatName formats: $formats options ${result.options}") {
          result.options.exists(value =>
            formats.exists(format =>
              value.value.equalsIgnoreCase(format))) should be(true)
        }
      }

      Get(s"""/v0/facets/format/options?facetQuery=${encodeForUrl(formatName)}&limit=${tuples.size}""") ~> addTenantIdHeader(tenant_1) ~> routes ~> check {
        status shouldBe OK
        val result = responseAs[FacetSearchResult]
        result.hitCount shouldBe 0
      }
    }

    testLanguageFieldSearch(termExtractor, test, keepOrder = true, testWhat = "should return the right format when searching by format value")
  }
}
