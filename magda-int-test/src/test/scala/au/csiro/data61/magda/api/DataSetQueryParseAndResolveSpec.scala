package au.csiro.data61.magda.api

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.OK
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.test.util.ApiGenerators._
import com.monsanto.labs.mwundo.GeoJson._
import org.scalacheck.Gen


class DataSetQueryParseAndResolveSpec extends DataSetQuerySearchSpecBase {

  describe("query") {

    it("should parse a randomly generated query correctly") {

      def validateQueryText(text: String): Boolean =
        text.trim.equals(text) &&
          !text.contains("  ") &&
          !text.toLowerCase.contains("or") &&
          !text.toLowerCase.contains("and")


      val theQuery: Gen[(String, Query)] = for {
        query <- queryGen(List[DataSet]())
        gen <- textQueryGen(query) if validateQueryText(gen._1)
      }yield gen

      forAll(emptyIndexGen, theQuery) { (indexTuple, queryTuple) ⇒
        val future = indexTuple._1
        val (textQuery, query) = queryTuple
        future.map(tuple => {
          assert(validateQueryText(textQuery))
          //      println(s"***** Text query: $textQuery")
          Get(s"/v0/datasets?$textQuery") ~> addSingleTenantIdHeader ~> tuple._3 ~> check {
            status shouldBe OK
            val response = responseAs[SearchResult]

            queryEquals(response.query, query)
          }

          Get(s"/v0/datasets?$textQuery") ~> addTenantIdHeader(tenant1) ~> tuple._3 ~> check {
            status shouldBe OK
            val response = responseAs[SearchResult]
            response.dataSets shouldBe empty
          }
        })
      }
    }

    it("should resolve valid regions") {
      val thisQueryGen = set(innerRegionQueryGen).map(queryRegions => new Query(regions = queryRegions.map(Specified.apply)))

      forAll(emptyIndexGen, textQueryGen(thisQueryGen)) { (indexTuple, queryTuple) ⇒
        val future = indexTuple._1
        val (textQuery, query) = queryTuple
        future.map(tuple => {
          Get(s"/v0/datasets?$textQuery") ~> addSingleTenantIdHeader ~> tuple._3 ~> check {
            status shouldBe OK
            val response = responseAs[SearchResult]

            response.query.regions.size should equal(query.regions.size)

            val tuples = response.query.regions.map(region => (region, query.regions.find(_.get.queryRegion.equals(region.get.queryRegion)).get.get.queryRegion))
            tuples.foreach {
              case (responseRegion, queryRegion) =>
                val (indexedRegion, regionSource, geometry) = findIndexedRegion(queryRegion)

                responseRegion.get.queryRegion.regionId should equal(indexedRegion.queryRegion.regionId)

                if (regionSource.includeIdInName) {
                  responseRegion.get.regionName.get should equal(indexedRegion.regionName.get + " - " + indexedRegion.queryRegion.regionId)
                } else {
                  responseRegion.get.regionName.get should equal(indexedRegion.regionName.get)
                }

                val allCoords: Seq[Coordinate] = geometry match {
                  case Point(coord)               => Seq(coord)
                  case MultiPoint(coords)         => coords
                  case LineString(coords)         => coords
                  case MultiLineString(coordsSeq) => coordsSeq.flatten
                  case Polygon(coordsSeq)         => coordsSeq.flatten
                  case MultiPolygon(coordsSeqSeq) => coordsSeqSeq.flatten.flatten
                }
                val byY = allCoords.sortBy(_.y)
                val byX = allCoords.sortBy(_.x)

                val indexedBoundingBox = BoundingBox(byY.last.y, byX.head.x, byY.head.y, byX.last.x)

                responseRegion.get.boundingBox.isDefined should be(true)

                val responseBoundingBox = responseRegion.get.boundingBox.get

                withClue(s"responseBoundingBox $responseBoundingBox vs indexedBoundingBox $indexedBoundingBox with $geometry") {
                  responseBoundingBox should equal(indexedBoundingBox)
                }
            }
          }

          Get(s"/v0/datasets?$textQuery") ~> addTenantIdHeader(tenant1) ~> tuple._3 ~> check {
            status shouldBe OK
            val response = responseAs[SearchResult]

            response.dataSets shouldBe empty
          }
        })
      }
    }
  }
}
