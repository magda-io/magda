package au.csiro.data61.magda.api

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.OK
import akka.http.scaladsl.server.Route
import au.csiro.data61.magda.model.misc._

class LanguageAnalyzer_3_Spec extends LanguageAnalyzerSpecBase {
  override def beforeAll(): Unit = {
    println("Testing LanguageAnalyzer_3_Spec")
    super.beforeAll()
  }

  describe("should return the right publisher when searching by publisher name") {
    def termExtractor(dataSet: DataSet) = dataSet.publisher.toSeq.flatMap(_.name.toSeq)

    def test(dataSet: DataSet, publisherName: String, routes: Route, tuples: List[(DataSet, String)]) = {
      Get(s"""/v0/facets/publisher/options?facetQuery=${encodeForUrl(publisherName)}&limit=10000""") ~> addSingleTenantIdHeader ~> routes ~> check {
        status shouldBe OK
        val result = responseAs[FacetSearchResult]

        val publisher = dataSet.publisher.get

        withClue(s"term: $publisherName, publisher: ${dataSet.publisher.map(_.name)} options ${result.options}") {
          result.options.exists { option =>
            option.value.equalsIgnoreCase(publisher.name.get)
            option.identifier.get.equals(publisher.identifier.get)
          } should be(true)
        }
      }
    }

    testLanguageFieldSearch(termExtractor, test, keepOrder = true, testWhat = "should return the right publisher when searching by publisher name")
  }

}
