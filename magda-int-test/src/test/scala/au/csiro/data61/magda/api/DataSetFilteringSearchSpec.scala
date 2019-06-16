package au.csiro.data61.magda.api

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.OK
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.search.SearchStrategy.MatchAll
import au.csiro.data61.magda.test.util.ApiGenerators._
import au.csiro.data61.magda.test.util.MagdaMatchers
import au.csiro.data61.magda.util.MwundoJTSConversions.GeometryConverter
import org.locationtech.jts.geom.GeometryFactory


class DataSetFilteringSearchSpec extends DataSetFilteringSpecBase {

  describe("filtering") {
    it("should return only filtered datasets with MatchAll, and only ones that wouldn't pass filter with MatchPart") {
      try {
        //        val filterQueryGen = queryGen
        //          .suchThat(query => query.dateFrom.isDefined || query.dateTo.isDefined || !query.formats.isEmpty || !query.publishers.isEmpty)
        val gen = for {
          index <- mediumIndexGen
          query <- textQueryGen(queryGen(index._2))
        } yield (index, query)

        forAll(gen) {
          case (indexTuple, queryTuple) ⇒
            val (_, dataSets, routes) = indexTuple
            val (textQuery, query) = queryTuple

            Get(s"/v0/datasets?$textQuery&limit=${dataSets.length}") ~> addSingleTenantIdHeader ~> routes ~> check {
              status shouldBe OK
              val response = responseAs[SearchResult]
              whenever(response.strategy.get == MatchAll) {

                response.dataSets.foreach { dataSet =>
                  val temporal = dataSet.temporal
                  val dataSetDateFrom = temporal.flatMap(innerTemporal => innerTemporal.start.flatMap(_.date).orElse(innerTemporal.end.flatMap(_.date)))
                  val dataSetDateTo = temporal.flatMap(innerTemporal => innerTemporal.end.flatMap(_.date).orElse(innerTemporal.start.flatMap(_.date)))

                  val dateUnspecified = (query.dateTo, query.dateFrom) match {
                    case (Some(Unspecified()), Some(Unspecified())) | (Some(Unspecified()), None) | (None, Some(Unspecified())) => dataSetDateFrom.isEmpty && dataSetDateTo.isEmpty
                    case _ => false
                  }

                  val dateFromMatched = (query.dateTo, dataSetDateFrom) match {
                    case (Some(Specified(innerQueryDateTo)), Some(innerDataSetDateFrom)) => innerDataSetDateFrom.isBefore(innerQueryDateTo)
                    case _ => true
                  }

                  val dateToMatched = (query.dateFrom, dataSetDateTo) match {
                    case (Some(Specified(innerQueryDateFrom)), Some(innerDataSetDateTo)) => innerDataSetDateTo.isAfter(innerQueryDateFrom)
                    case _ => true
                  }

                  val dataSetPublisherName = dataSet.publisher.flatMap(_.name)
                  val publisherMatched = if (query.publishers.nonEmpty) {
                    query.publishers.exists { queryPublisher =>
                      queryPublisher match {
                        case Specified(specifiedPublisher) => dataSetPublisherName.exists(innerDataSetPublisher =>
                          MagdaMatchers.extractAlphaNum(innerDataSetPublisher).contains(MagdaMatchers.extractAlphaNum(specifiedPublisher)))
                        case Unspecified() => dataSet.publisher.flatMap(_.name).isEmpty
                      }
                    }
                  } else true

                  val formatMatched = if (query.formats.nonEmpty) {
                    query.formats.exists(queryFormat =>
                      dataSet.distributions.exists(distribution =>
                        queryFormat match {
                          case Specified(specifiedFormat) => distribution.format.exists(dataSetFormat =>
                            MagdaMatchers.extractAlphaNum(dataSetFormat).contains(MagdaMatchers.extractAlphaNum(specifiedFormat)))
                          case Unspecified() => distribution.format.isEmpty
                        }))
                  } else true

                  val geometryFactory: GeometryFactory = new GeometryFactory

                  val queryRegions = query.regions.filter(_.isDefined).map { region =>
                    findIndexedRegion(region.get.queryRegion)
                  }

                  // This one is trying to imitate an inaccurate ES query with JTS distance, which is also a bit flaky
                  val distances = queryRegions.flatMap(queryRegion =>
                    dataSet.spatial.flatMap(_.geoJson.map { geoJson =>
                      val jtsGeo = GeometryConverter.toJTSGeo(geoJson, geometryFactory)
                      val jtsRegion = GeometryConverter.toJTSGeo(queryRegion._3, geometryFactory)

                      val length = {
                        val jtsGeoEnv = jtsGeo.getEnvelopeInternal
                        val jtsRegionEnv = jtsRegion.getEnvelopeInternal

                        Seq(jtsGeoEnv.getHeight, jtsGeoEnv.getWidth, jtsRegionEnv.getHeight, jtsRegionEnv.getWidth).sorted.last
                      }

                      (jtsGeo.distance(jtsRegion), if (length > 0) length else 1)
                    }))

                  val unspecifiedRegion = query.regions.exists(_.isEmpty)
                  val geoMatched = if (query.regions.nonEmpty) {
                    unspecifiedRegion || distances.exists { case (distance, length) => distance <= length * 0.05 }
                  } else true

                  val allValid = (dateUnspecified || (dateFromMatched && dateToMatched)) && publisherMatched && formatMatched && geoMatched

                  withClue(s"with query $textQuery \n and dataSet" +
                    s"\n\tdateUnspecified $dateUnspecified" +
                    s"\n\tdateTo $dataSetDateTo $dateToMatched" +
                    s"\n\tdateFrom $dataSetDateFrom $dateFromMatched" +
                    s"\n\tpublisher ${dataSet.publisher} $publisherMatched" +
                    s"\n\tformats ${dataSet.distributions.map(_.format).mkString(",")} $formatMatched" +
                    s"\n\tdistances ${distances.map(t => t._1 + "/" + t._2).mkString(",")}" +
                    s"\n\tgeomatched ${dataSet.spatial.map(_.geoJson).mkString(",")} $geoMatched" +
                    s"\n\tqueryRegions $queryRegions\n") {
                    allValid should be(true)
                  }
                }
              }
            }

            Get(s"/v0/datasets?$textQuery&limit=${dataSets.length}") ~> addTenantIdHeader(tenant1) ~> routes ~> check {
              status shouldBe OK
              val response = responseAs[SearchResult]
              whenever(response.strategy.get == MatchAll) {
                response.hitCount shouldBe 0
              }
            }
        }
      } catch {
        case e: Throwable =>
          e.printStackTrace()
          throw e
      }
    }
  }
}
