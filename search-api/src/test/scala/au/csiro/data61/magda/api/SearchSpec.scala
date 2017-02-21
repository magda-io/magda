package au.csiro.data61.magda.api

import org.scalacheck._
import org.scalacheck.Arbitrary._
import org.scalacheck.Shrink
import org.scalatest._

import com.vividsolutions.jts.geom.GeometryFactory

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.ContentTypes.`application/json`
import akka.http.scaladsl.model.StatusCodes.OK
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.search.MatchAll
import au.csiro.data61.magda.test.util.Generators._
import com.monsanto.labs.mwundo.GeoJson.Polygon
import com.monsanto.labs.mwundo.GeoJson._
import au.csiro.data61.magda.util.MwundoJTSConversions._

class SearchSpec extends BaseApiSpec {
  describe("meta") {
    it("Mwundo <--> JTS conversions should work") {
      val geoFactory = new GeometryFactory()
      try {
        forAll(regionGen) { regionRaw =>
          val preConversion = regionRaw._2.fields("geometry").convertTo[Geometry]

          val jts = GeometryConverter.toJTSGeo(preConversion, geoFactory)
          val postConversion = GeometryConverter.fromJTSGeo(jts)

          preConversion should equal(postConversion)
        }
      } catch {
        case e: Throwable =>
          e.printStackTrace
          throw e
      }
    }
  }

  describe("searching") {
    describe("*") {
      it("should return all results") {
        forAll(indexGen) {
          case (indexName, dataSets, routes) ⇒
            Get(s"/datasets/search?query=*&limit=${dataSets.length}") ~> routes ~> check {
              status shouldBe OK
              contentType shouldBe `application/json`
              val response = responseAs[SearchResult]

              response.hitCount shouldEqual dataSets.length
              response.dataSets shouldEqual dataSets
            }
        }
      }

      it("hitCount should reflect all hits in the system, not just what is returned") {
        forAll(indexGen) {
          case (indexName, dataSets, routes) ⇒
            Get(s"/datasets/search?query=*&limit=${dataSets.length / 2}") ~> routes ~> check {
              status shouldBe OK
              val response = responseAs[SearchResult]

              response.hitCount shouldEqual dataSets.length
              response.dataSets should equal(dataSets.take(dataSets.length / 2))
            }
        }
      }
    }

    it("should return only filtered datasets with MatchAll, and only ones that wouldn't pass filter with MatchPart") {
      val filterQueryGen = queryGen
        .suchThat(query => query.dateFrom.isDefined || query.dateTo.isDefined || !query.formats.isEmpty || !query.publishers.isEmpty)

      forAll(indexGen, textQueryGen()) { (indexTuple, queryTuple) ⇒
        val (_, dataSets, routes) = indexTuple
        val (textQuery, query) = queryTuple
        Get(s"/datasets/search?query=${encodeForUrl(textQuery)}&limit=${dataSets.length}") ~> routes ~> check {
          status shouldBe OK
          val response = responseAs[SearchResult]
          whenever(response.strategy.get == MatchAll) {

            response.dataSets.foreach { dataSet =>
              val temporal = dataSet.temporal
              val dataSetDateFrom = temporal.flatMap(innerTemporal => innerTemporal.start.flatMap(_.date).orElse(innerTemporal.end.flatMap(_.date)))
              val dateFromMatched = (query.dateTo, dataSetDateFrom) match {
                case (Some(innerQueryDateTo), Some(innerDataSetDateFrom)) => innerDataSetDateFrom.isBefore(innerQueryDateTo)
                case (Some(_), None) => false
                case _ => true
              }

              val dataSetDateTo = temporal.flatMap(innerTemporal => innerTemporal.end.flatMap(_.date).orElse(innerTemporal.start.flatMap(_.date)))
              val dateToMatched = (query.dateFrom, dataSetDateTo) match {
                case (Some(innerQueryDateFrom), Some(innerDataSetDateTo)) => innerDataSetDateTo.isAfter(innerQueryDateFrom)
                case (Some(_), None) => false
                case _ => true
              }

              // TODO: The following are slightly flakey because they're imitating a keyword search with "contains"
              val dataSetPublisherName = dataSet.publisher.flatMap(_.name)
              val publisherMatched = if (!query.publishers.isEmpty) {
                query.publishers.exists(queryPublisher =>
                  dataSetPublisherName.map(_.contains(queryPublisher)).getOrElse(false)
                )
              } else true

              val formatMatched = if (!query.formats.isEmpty) {
                query.formats.exists(queryFormat =>
                  dataSet.distributions.exists(distribution =>
                    distribution.format.map(_.contains(queryFormat)).getOrElse(false)
                  )
                )
              } else true

              val geometryFactory: GeometryFactory = new GeometryFactory

              val queryRegions = query.regions.map { queryRegion =>
                val regionJsonOption = indexedRegions.find { innerRegion =>
                  regionJsonToQueryRegion(innerRegion._1, innerRegion._2).equals(queryRegion)
                }

                val regionJson = regionJsonOption.get._2.getFields("geometry").head
                regionJson.convertTo[Geometry]
              }

              // This one is trying to imitate an inaccurate ES query with JTS distance, which is also a bit flaky
              val distances = queryRegions.flatMap(queryRegion =>
                dataSet.spatial.flatMap(_.geoJson.map { geoJson =>
                  val jtsGeo = GeometryConverter.toJTSGeo(geoJson, geometryFactory)
                  val jtsRegion = GeometryConverter.toJTSGeo(queryRegion, geometryFactory)

                  (jtsGeo.distance(jtsRegion), Math.max(jtsGeo.getLength, jtsRegion.getLength))
                }))

              val geoMatched = if (!query.regions.isEmpty) {
                distances.exists { case (distance, length) => distance <= length * 0.05 }
              } else true

              val allValid = dateFromMatched && dateToMatched && publisherMatched && formatMatched && geoMatched

              withClue(s"with query $textQuery \n and dataSet" +
                s"\n\tdateTo $dataSetDateTo $dateFromMatched" +
                s"\n\tdateFrom $dataSetDateFrom $dateToMatched" +
                s"\n\tpublisher ${dataSet.publisher} $publisherMatched" +
                s"\n\tformats ${dataSet.distributions.map(_.format).mkString(",")} $formatMatched" +
                s"\n\tdistances ${distances.map(t => t._1 + "/" + t._2).mkString(",")}" +
                s"\n\t ${dataSet.spatial.map(_.geoJson).mkString(",")} $geoMatched" +
                s"\n\tqueryRegions $queryRegions\n") {
                allValid should be(true)
              }
            }
          }
        }
      }
    }

    it("for a dataset's title should return that dataset (eventually)") {
      forAll(indexGen) {
        case (indexName, dataSetsRaw, routes) ⇒
          val indexedDataSets = dataSetsRaw.filter(dataSet ⇒ dataSet.title.isDefined && !dataSet.title.get.isEmpty())

          whenever(!indexedDataSets.isEmpty) {
            val dataSetsPicker = for (dataset ← Gen.oneOf(indexedDataSets)) yield dataset

            forAll(dataSetsPicker) { dataSet ⇒
              Get(s"""/datasets/search?query=${encodeForUrl(dataSet.title.get)}&limit=${dataSetsRaw.size}""") ~> routes ~> check {
                status shouldBe OK
                val result = responseAs[SearchResult]
                withClue(s"title: ${dataSet.title.get} and identifier: ${dataSet.identifier} in ${dataSetsRaw.map(_.title.getOrElse("(none)")).mkString(", ")}") {
                  result.dataSets.exists(_.identifier.equals(dataSet.identifier)) shouldBe true
                }
              }
            }
          }
      }
    }
  }

  describe("pagination") {
    it("should match the result of getting all datasets and using .drop(start).take(limit) to select a subset") {
      forAll(indexGen) {
        case (indexName, dataSets, routes) ⇒
          val dataSetCount = dataSets.size

          val starts = for (n ← Gen.choose(0, dataSetCount)) yield n
          val limits = for (n ← Gen.choose(0, dataSetCount)) yield n

          forAll(starts, limits) { (start, limit) ⇒
            whenever(start >= 0 && start <= dataSetCount && limit >= 0 && limit <= dataSetCount) {
              Get(s"/datasets/search?query=*&start=${start}&limit=${limit}") ~> routes ~> check {
                status shouldBe OK
                val result = responseAs[SearchResult]

                val expectedResultIdentifiers = dataSets.drop(start).take(limit).map(_.identifier)
                expectedResultIdentifiers shouldEqual result.dataSets.map(_.identifier)
              }
            }
          }
      }
    }
  }

  describe("query") {
    it("should always be parsed correctly") {
      forAll(emptyIndexGen, textQueryGen()) { (indexTuple, queryTuple) ⇒
        val (textQuery, query) = queryTuple
        val (_, _, routes) = indexTuple

        Get(s"/datasets/search?query=${encodeForUrl(textQuery)}") ~> routes ~> check {
          status shouldBe OK
          val response = responseAs[SearchResult]
          if (textQuery.equals("")) {
            response.query should equal(Query(freeText = Some("*")))
          } else {
            response.query should equal(query)
          }
        }
      }
    }

    it("should not fail for queries that are full of arbitrary characters") {
      forAll(emptyIndexGen, Gen.listOf(arbitrary[String]).map(_.mkString(" "))) { (indexTuple, textQuery) =>
        val (_, _, routes) = indexTuple

        Get(s"/datasets/search?query=${encodeForUrl(textQuery)}") ~> routes ~> check {
          status shouldBe OK
        }
      }
    }
    
    it("should not fail for arbitrary characters interspersed with control words") {
      val controlWords = Seq("in", "by", "to", "from", "as")
      val controlWordGen = Gen.oneOf(controlWords)
      val queryWordGen = Gen.oneOf(controlWordGen, arbitrary[String])
      val queryTextGen = Gen.listOf(queryWordGen).map(_.mkString(" "))
      
      forAll(emptyIndexGen, queryTextGen) { (indexTuple, textQuery) =>
        val (_, _, routes) = indexTuple

        Get(s"/datasets/search?query=${encodeForUrl(textQuery)}") ~> routes ~> check {
          status shouldBe OK
        }
      }
    }
  }
}
