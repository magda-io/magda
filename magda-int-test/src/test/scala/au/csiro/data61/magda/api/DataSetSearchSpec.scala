package au.csiro.data61.magda.api

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.ContentTypes.`application/json`
import akka.http.scaladsl.model.StatusCodes.OK
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.test.util.Generators.{coordGen, geometryGen, regionGen}
import au.csiro.data61.magda.test.util.MagdaMatchers
import au.csiro.data61.magda.util.MwundoJTSConversions.GeometryConverter
import com.monsanto.labs.mwundo.GeoJson._
import org.locationtech.jts.geom.GeometryFactory

import scala.concurrent.Await



class DataSetSearchSpec extends DataSetSearchSpecBase {

  describe("meta") {
    it("Mwundo <--> JTS conversions should work") {
      val geoFactory = new GeometryFactory()
      forAll(regionGen(geometryGen(5, coordGen()))) { regionRaw =>
        val preConversion = regionRaw._2.fields("geometry").convertTo[Geometry]

        val jts = GeometryConverter.toJTSGeo(preConversion, geoFactory)
        val postConversion = GeometryConverter.fromJTSGeo(jts)

        preConversion should equal(postConversion)
      }
    }
  }

  it("should return all results") {
    forAll(indexGen) {
      indexTuple ⇒
        val resultF = indexTuple._1.map(tuple => {
          val dataSets = tuple._2
          val routes = tuple._3
          Get(s"/v0/datasets?query=*&limit=${dataSets.length}") ~> addSingleTenantIdHeader ~> routes ~> check {
            status shouldBe OK
            contentType shouldBe `application/json`
            val response = responseAs[SearchResult]

            response.hitCount shouldEqual dataSets.length
            MagdaMatchers.dataSetsEqualIgnoreOrder(response.dataSets, dataSets)
          }
          Get(s"/v0/datasets?query=*&limit=${dataSets.length}") ~> addTenantIdHeader(tenant1) ~> routes ~> check {
            status shouldBe OK
            val response = responseAs[SearchResult]
            response.hitCount shouldEqual 0
          }
        })
        Await.result(resultF, SINGLE_TEST_WAIT_TIME)
    }
  }
}
