package au.csiro.data61.magda.api

import au.csiro.data61.magda.model.misc.{DataSet, _}
import au.csiro.data61.magda.test.util.ApiGenerators._
import au.csiro.data61.magda.test.util.Generators

class FacetPublisherGroupingSpec extends FacetSpecBase {

  describe("facets publisher") {
      def reducer(dataSet: DataSet) = Set(dataSet.publisher.flatMap(_.name)).flatten
      def queryToInt(query: Query) = query.publishers.size

      def queryGen(dataSets: List[DataSet]) = for {
        publishers <- Generators.smallSet(publisherQueryGen(dataSets))
      } yield new Query(publishers = publishers)

      def specificBiasedQueryGen(dataSets: List[DataSet]) = Query(publishers = dataSets.flatMap(_.publisher.flatMap(_.name)).map(Specified.apply).toSet)

      genericFacetGroupingSpecs(Publisher, reducer, queryToInt, queryGen, specificBiasedQueryGen)
    }
}
