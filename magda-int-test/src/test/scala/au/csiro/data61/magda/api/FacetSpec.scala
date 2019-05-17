package au.csiro.data61.magda.api

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.server.Route
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.misc.{DataSet, _}
import au.csiro.data61.magda.test.util.ApiGenerators._
import org.scalacheck._

class FacetSpec extends FacetSpecBase {
  override var defaultGen: Gen[((String, List[DataSet], Route), (String, Query), Seq[Nothing])] = _

  override def beforeAll() = {
    println("Testing FacetSpec")
    super.beforeAll()
    defaultGen = for {
      tuple <- mediumIndexGen
      query <- textQueryGen(queryGen(tuple._2))
    } yield (tuple, query, Seq())
  }

  describe("facets") {
    println("Testing facets")

    describe("should never generate a facet size bigger than what was asked for") {
      println("  - Testing should never generate a facet size bigger than what was asked for")
      checkFacetsBoth() { (dataSets: List[DataSet], facetSize: Int) ⇒
        val result = responseAs[SearchResult]
        val facets = FacetType.all.flatMap(facetType ⇒ result.facets.get.find(facet => facetType.id.equals(facet.id)))

        whenever(!facets.isEmpty) {
          facets.foreach { facet ⇒
            facet.options.size should be <= facetSize
          }
        }
      }
    }
  }
}
