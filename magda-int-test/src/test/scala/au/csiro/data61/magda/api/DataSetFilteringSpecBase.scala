package au.csiro.data61.magda.api

import akka.http.scaladsl.server.Route
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.test.util.ApiGenerators._
import org.scalacheck.Gen


trait DataSetFilteringSpecBase extends DataSetSearchSpecBase {

  def doUnspecifiedTest(queryGen: Gen[Query])(test: SearchResult => Unit): Unit = {
    val theGen: Gen[(String, List[DataSet], Route)] = for {
      gen <- indexGen
      nonEmptyDataSetsGen = gen if gen._2.nonEmpty
    } yield nonEmptyDataSetsGen

    forAll(theGen, textQueryGen(queryGen)) {
      case ((_, dataSets, routes), (textQuery, _)) =>
        doFilterTest(textQuery, dataSets, routes) { response =>
          whenever(response.dataSets.nonEmpty) {
            test(response)
          }
        }
    }
  }
}
