package au.csiro.data61.magda.api

import java.time.OffsetDateTime
import java.time.temporal.{ChronoField, TemporalField}
import java.util.{Calendar, GregorianCalendar}

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.OK
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.test.util.ApiGenerators._
import com.monsanto.labs.mwundo.GeoJson._
import org.scalacheck.Arbitrary.{arbString, arbitrary}
import org.scalacheck.Gen


class DataSetSearch_5_Spec extends DataSetSearchSpecBase {

  override def beforeAll() = {
    super.beforeAll()
  }

  describe("query") {
    def queryEquals(outputQuery: Query, inputQuery: Query) = {
      def caseInsensitiveMatchFv(field: String, output: Traversable[FilterValue[String]], input: Traversable[FilterValue[String]]) = withClue(field) {
        output.map(_.map(_.toLowerCase)) should equal(input.map(_.map(_.toLowerCase)))
      }

      outputQuery.freeText.getOrElse("").toLowerCase shouldEqual inputQuery.freeText.getOrElse("").toLowerCase
      caseInsensitiveMatchFv("formats", outputQuery.formats, inputQuery.formats)
      caseInsensitiveMatchFv("publishers", outputQuery.publishers, inputQuery.publishers)
      outputQuery.dateFrom should equal(inputQuery.dateFrom)
      outputQuery.regions.map(_.map(_.copy(regionName = None, boundingBox = None, regionShortName = None))) should equal(inputQuery.regions)

      (outputQuery.dateTo, inputQuery.dateTo) match {
        case (Some(Specified(output)), Some(Specified(input))) =>

          def checkWithRounding(field: TemporalField, maxFunc: OffsetDateTime => Int) = {
            val max = maxFunc(input)

            if (output.get(field) == max) {
              input.get(field) should (equal(0) or equal(max))
            } else {
              input.get(field) should equal(output.get(field))
            }
          }

          def getMax(date: OffsetDateTime, period: Int) = new GregorianCalendar(date.getYear, date.getMonthValue, date.getDayOfMonth).getActualMaximum(period)

          checkWithRounding(ChronoField.MILLI_OF_SECOND, _ => 999)
          checkWithRounding(ChronoField.SECOND_OF_MINUTE, _ => 59)
          checkWithRounding(ChronoField.MINUTE_OF_HOUR, _ => 59)
          checkWithRounding(ChronoField.HOUR_OF_DAY, _ => 23)
          checkWithRounding(ChronoField.DAY_OF_MONTH, date => getMax(date, Calendar.DAY_OF_MONTH))
          checkWithRounding(ChronoField.MONTH_OF_YEAR, date => getMax(date, Calendar.MONTH))
        case (a, b) => a.equals(b)
      }
    }

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
    }

    it("should not fail for queries that are full of arbitrary characters") {
      forAll(emptyIndexGen, Gen.listOf(arbitrary[String]).map(_.mkString(" "))) { (indexTuple, textQuery) =>
        val (_, _, routes) = indexTuple

        Get(s"/v0/datasets?query=${encodeForUrl(textQuery)}") ~> addSingleTenantIdHeader ~> routes ~> check {
          status shouldBe OK
        }
      }
    }

    it("should return scores, and they should be in order") {
      val gen = for {
        index <- mediumIndexGen
        query <- textQueryGen(queryGen(index._2))
      } yield (index, query)

      forAll(gen) {
        case (indexTuple, queryTuple) ⇒
          val (textQuery, _) = queryTuple
          val (_, _, routes) = indexTuple

          Get(s"/v0/datasets?${textQuery}") ~> addSingleTenantIdHeader ~> routes ~> check {
            status shouldBe OK
            val response = responseAs[SearchResult]
            whenever(response.hitCount > 0) {
              response.dataSets.forall(dataSet => dataSet.score.isDefined) shouldBe true
              response.dataSets.map(_.score.get).sortBy(-_) shouldEqual response.dataSets.map(_.score.get)
            }
          }
      }
    }
  }
}
