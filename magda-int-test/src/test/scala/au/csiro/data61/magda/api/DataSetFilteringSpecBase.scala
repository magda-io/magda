package au.csiro.data61.magda.api

import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.test.util.ApiGenerators._
import org.scalacheck.Gen


trait DataSetFilteringSpecBase extends DataSetSearchSpecBase {
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
}
