package au.csiro.data61.magda.api

import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.search.SearchStrategy.MatchAll
import au.csiro.data61.magda.test.util.{ApiGenerators, MagdaMatchers}
import org.scalacheck.Gen


class DataSetFilteringPublisherSearchSpec extends DataSetFilteringSpecBase {

  describe("filtering publisher") {
    it("exact") {
      def dataSetToQuery(dataSet: DataSet) = {

        val publishers = Set(
          dataSet.publisher
            .flatMap(_.name)
            .map(Specified.apply).getOrElse(Unspecified()))
          .filter {
            case Specified(x) => ApiGenerators.validFilter(x)
            case _            => true
          }.asInstanceOf[Set[FilterValue[String]]]

        Gen.const(Query(publishers = publishers))
      }

      doDataSetFilterTest(dataSetToQuery) { (query, response, dataSet) =>
        whenever(query != Query() && query.publishers.filter(_.isDefined).forall(!_.get.contains("  "))) {
          val queryPublishers = query.publishers.map(_.map(MagdaMatchers.extractAlphaNum))
          withClue(s"queryPublishers $queryPublishers and dataSet publisher ${dataSet.publisher.flatMap(_.name)}") {
            response.strategy.get should be(MatchAll)
            response.dataSets.isEmpty should be(false)
            response.dataSets.exists(_.identifier == dataSet.identifier) should be(true)
          }

          response.dataSets.foreach { dataSet =>
            val matchesQuery = dataSet.publisher.flatMap(_.name) match {
              case Some(publisher) => queryPublishers.contains(Specified(MagdaMatchers.extractAlphaNum(publisher)))
              case None            => queryPublishers.contains(Unspecified())
            }

            withClue(s"queryPublishers $queryPublishers and dataSet publisher ${dataSet.publisher.flatMap(_.name)}") {
              matchesQuery should be(true)
            }
          }
        }
      }
    }

    it("unspecified") {
      val pubQueryGen = Gen.const(Query(publishers = Set(Unspecified())))

      doUnspecifiedTest(pubQueryGen) { response =>
        whenever(!response.dataSets.isEmpty) {
          response.dataSets.foreach { dataSet =>
            val dataSetPublisher = dataSet.publisher.flatMap(_.name)
            withClue(s"dataSetPublisher $dataSetPublisher") {
              dataSetPublisher.isEmpty should be(true)
            }
          }
        }
      }
    }
  }
}
