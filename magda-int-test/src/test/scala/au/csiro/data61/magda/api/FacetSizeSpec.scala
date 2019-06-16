package au.csiro.data61.magda.api

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.misc.{DataSet, _}

class FacetSizeSpec extends FacetSpecBase {

  describe("facets should never generate a facet size bigger than what was asked for") {
      checkFacetsBoth() { (_: List[DataSet], facetSize: Int) ⇒
        val result = responseAs[SearchResult]
        val facets = FacetType.all.flatMap(facetType ⇒ result.facets.get.find(facet => facetType.id.equals(facet.id)))

        whenever(facets.nonEmpty) {
          facets.foreach { facet ⇒
            facet.options.size should be <= facetSize
          }
        }
      }
    }
}
