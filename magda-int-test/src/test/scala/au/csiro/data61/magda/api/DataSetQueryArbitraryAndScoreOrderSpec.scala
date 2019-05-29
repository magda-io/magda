package au.csiro.data61.magda.api

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.OK
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.test.util.ApiGenerators._
import org.scalacheck.Arbitrary.{arbString, arbitrary}
import org.scalacheck.Gen


class DataSetQueryArbitraryAndScoreOrderSpec extends DataSetSearchSpecBase {

  describe("query") {

    it("should not fail for queries that are full of arbitrary characters") {
      forAll(emptyIndexGen, Gen.listOf(arbitrary[String]).map(_.mkString(" "))) { (indexTuple, textQuery) =>
        val (_, _, routes) = indexTuple

        Get(s"/v0/datasets?query=${encodeForUrl(textQuery)}") ~> addSingleTenantIdHeader ~> routes ~> check {
          status shouldBe OK
        }
      }
    }

    it("should return scores, and they should be in order") {
      val gen = for {
        index <- mediumIndexGen
        query <- textQueryGen(queryGen(index._2))
      } yield (index, query)

      forAll(gen) {
        case (indexTuple, queryTuple) ⇒
          val (textQuery, _) = queryTuple
          val (_, _, routes) = indexTuple

          Get(s"/v0/datasets?${textQuery}") ~> addSingleTenantIdHeader ~> routes ~> check {
            status shouldBe OK
            val response = responseAs[SearchResult]
            whenever(response.hitCount > 0) {
              response.dataSets.forall(dataSet => dataSet.score.isDefined) shouldBe true
              response.dataSets.map(_.score.get).sortBy(-_) shouldEqual response.dataSets.map(_.score.get)
            }
          }
      }
    }
  }
}
