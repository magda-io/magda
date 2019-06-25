package au.csiro.data61.magda.api

import akka.http.scaladsl.server.Route
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.test.util.ApiGenerators._
import org.scalacheck.Gen

import scala.concurrent.Future


trait DataSetFilteringSpecBase extends DataSetSearchSpecBase {

  def doUnspecifiedTest(queryGen: Gen[Query])(test: SearchResult => Unit): Unit = {
    val theGen: Gen[(Future[(String, List[DataSet], Route)], List[DataSet])] = for {
      gen <- indexGen
      nonEmptyDataSetsGen = gen if gen._2.nonEmpty
    } yield nonEmptyDataSetsGen

    forAll(theGen, textQueryGen(queryGen)) {
      case (tuple, (textQuery, _)) =>
        val future: Future[(String, List[DataSet], Route)] = tuple._1
        future.map(tuple => {
          doFilterTest(textQuery, tuple._2, tuple._3) { response =>
            whenever(response.dataSets.nonEmpty) {
              test(response)
            }
          }
        })
    }
  }
}
