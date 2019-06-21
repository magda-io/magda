package au.csiro.data61.magda.api.verylongrun

import au.csiro.data61.magda.api.{FacetSpecBase, Query, Specified}
import au.csiro.data61.magda.model.misc.{DataSet, _}
import au.csiro.data61.magda.test.util.ApiGenerators._
import au.csiro.data61.magda.test.util.Generators

class FacetFormatAggregateSpec extends FacetSpecBase {

  describe("facets format aggregate") {
    def reducer(dataSet: DataSet) = dataSet.distributions.flatMap(_.format.map(_.toLowerCase)).toSet
    def queryToInt(query: Query) = query.formats.size

    def filterQueryGen(dataSets: List[DataSet]) = Generators.smallSet(formatQueryGen(dataSets)).flatMap(formats => Query(formats = formats))
    def specificBiasedQueryGen(dataSets: List[DataSet]) = Query(formats = dataSets.flatMap(_.distributions.flatMap(_.format)).map(Specified.apply).toSet)

    genericDatasetAggregatedIntoFacetSpecs(Format, reducer, queryToInt, filterQueryGen, specificBiasedQueryGen)
  }
}
