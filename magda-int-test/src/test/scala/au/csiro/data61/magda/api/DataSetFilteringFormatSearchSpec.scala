package au.csiro.data61.magda.api

import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.search.SearchStrategy.MatchAll
import au.csiro.data61.magda.test.util.{ApiGenerators, MagdaMatchers}
import org.scalacheck.Gen


class DataSetFilteringFormatSearchSpec extends DataSetFilteringSpecBase {

  describe("filtering") {
    describe("format") {
      it("exact") {
        def dataSetToQuery(dataSet: DataSet) = {
          val formats = dataSet.distributions
            .map(_.format.map(Specified.apply).getOrElse(Unspecified()))
            .filter {
              case Specified(x) => ApiGenerators.validFilter(x)
              case _            => true
            }

          for {
            formatsReduced <- Gen.someOf(formats)
            query = Query(formats = formatsReduced.toSet)
          } yield query
        }

        doDataSetFilterTest(dataSetToQuery) { (query, response, dataSet) =>
          whenever(query != Query() && query.formats.filter(_.isDefined).forall(!_.get.contains("  "))) {
            val queryFormats = query.formats.map(_.map(MagdaMatchers.extractAlphaNum))
            withClue(s"queryFormats $queryFormats and dataset formats ${dataSet.distributions.flatMap(_.format)}") {
              response.strategy.get should be(MatchAll)
              response.dataSets.isEmpty should be(false)
              response.dataSets.exists(_.identifier == dataSet.identifier) should be(true)
            }

            response.dataSets.foreach { dataSet =>

              val matchesQuery = dataSet.distributions.exists(dist => dist.format match {
                case Some(format) => queryFormats.contains(Specified(MagdaMatchers.extractAlphaNum(format)))
                case None         => queryFormats.contains(Unspecified())
              })

              withClue(s"queryFormats $queryFormats and dataset formats ${dataSet.distributions.flatMap(_.format)}") {
                matchesQuery should be(true)
              }
            }
          }
        }
      }

      it("unspecified") {
        val pubQueryGen = Gen.const(Query(formats = Set(Unspecified())))

        doUnspecifiedTest(pubQueryGen) { response =>
          response.dataSets.foreach { dataSet =>
            val dataSetFormats = dataSet.distributions.map(_.format)
            withClue(s"dataSetFormats $dataSetFormats") {
              dataSetFormats.exists(_.isEmpty) should be(true)
            }
          }
        }
      }
    }
  }
}
