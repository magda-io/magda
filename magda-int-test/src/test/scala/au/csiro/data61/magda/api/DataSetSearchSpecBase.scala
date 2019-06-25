package au.csiro.data61.magda.api

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.OK
import akka.http.scaladsl.server.Route
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.Registry.RegistryConverters
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.spatial.RegionSource
import au.csiro.data61.magda.test.util.ApiGenerators._
import com.monsanto.labs.mwundo.GeoJson._
import org.scalacheck.Gen

import scala.concurrent.Await


trait DataSetSearchSpecBase extends BaseSearchApiSpec with RegistryConverters {

  def doDataSetFilterTest(buildQuery: DataSet => Gen[Query])(test: (Query, SearchResult, DataSet) => Unit) {
    val gen = for {
      index <- indexGen.suchThat(_._2.nonEmpty)
      dataSet <- Gen.oneOf(index._2)
      query = buildQuery(dataSet).suchThat(_ != Query())
      textQuery <- textQueryGen(query)
    } yield {
      (index, dataSet, textQuery)
    }

    forAll(gen) {
      case (tuple, dataSet, (textQuery, query)) =>
        val resultF = tuple._1.map(indexTuple => {
          val dataSets = indexTuple._2
          assert(dataSets.nonEmpty)
          assert(dataSets.contains(dataSet))
          doFilterTest(textQuery, dataSets, indexTuple._3) { response =>
            test(query, response, dataSet)
          }
        })
        Await.result(resultF, SINGLE_TEST_WAIT_TIME)
    }
  }

  def doFilterTest(query: String, dataSets: List[DataSet], routes: Route)(test: SearchResult => Unit): Unit = {
    Get(s"/v0/datasets?$query&limit=${dataSets.length}") ~> addSingleTenantIdHeader ~> routes ~> check {
      status shouldBe OK
      val response = responseAs[SearchResult]

      test(response)
    }
  }

  def findIndexedRegion(queryRegion: QueryRegion): (Region, RegionSource, Geometry) = {
    val regionJsonOption = indexedRegions.find { innerRegion =>
      regionJsonToQueryRegion(innerRegion._1, innerRegion._2).equals(queryRegion)
    }

    withClue(s"for queryRegion $queryRegion and regions $indexedRegions") {
      regionJsonOption.isDefined should be(true)
    }
    val (regionType, json) = regionJsonOption.get
    val regionJson = json.getFields("geometry").head
    val properties = json.getFields("properties").head.asJsObject

    (Region(
      queryRegion = QueryRegion(
        regionId = properties.getFields(regionType.idProperty).head.convertTo[String],
        regionType = regionType.name),
      regionName = properties.getFields(regionType.nameProperty).headOption.map(_.convertTo[String])), regionType, regionJson.convertTo[Geometry])
  }

  def sortByQuality(dataSets: List[DataSet]): List[DataSet] = dataSets.sortWith { case (ds1, ds2) => ds1.quality.compare(ds2.quality) > 0 }
}
