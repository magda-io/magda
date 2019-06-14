package au.csiro.data61.magda.api

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.OK
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.test.util.ApiGenerators._
import com.monsanto.labs.mwundo.GeoJson._


class DataSetQueryParseAndResolveSpec extends DataSetQuerySearchSpecBase {

  describe("query") {

    it("should parse a randomly generated query correctly") {
      forAll(emptyIndexGen, textQueryGen(queryGen(List[DataSet]()))) { (indexTuple, queryTuple) ⇒
        val (textQuery, query) = queryTuple
        val (_, _, routes) = indexTuple

        whenever(textQuery.trim.equals(textQuery) && !textQuery.contains("  ") &&
          !textQuery.toLowerCase.contains("or") && !textQuery.toLowerCase.contains("and")) {

          Get(s"/v0/datasets?${textQuery}") ~> addSingleTenantIdHeader ~> routes ~> check {
            status shouldBe OK
            val response = responseAs[SearchResult]

            queryEquals(response.query, query)
          }

          Get(s"/v0/datasets?${textQuery}") ~> addTenantIdHeader(tenant_1) ~> routes ~> check {
            status shouldBe OK
            val response = responseAs[SearchResult]
            response.dataSets shouldBe empty
          }
        }
      }

      deleteAllIndexes()
    }

    it("should resolve valid regions") {
      val thisQueryGen = set(innerRegionQueryGen).map(queryRegions => new Query(regions = queryRegions.map(Specified.apply)))

      forAll(emptyIndexGen, textQueryGen(thisQueryGen)) { (indexTuple, queryTuple) ⇒
        val (textQuery, query) = queryTuple
        val (_, _, routes) = indexTuple

        Get(s"/v0/datasets?${textQuery}") ~> addSingleTenantIdHeader ~> routes ~> check {
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

        Get(s"/v0/datasets?${textQuery}") ~> addTenantIdHeader(tenant_1) ~> routes ~> check {
          status shouldBe OK
          val response = responseAs[SearchResult]

          response.dataSets shouldBe empty
        }
      }

      deleteAllIndexes()
    }
  }
}
