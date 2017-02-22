package au.csiro.data61.magda.api

import java.io.File
import java.time.{ Instant, OffsetDateTime }
import java.util.Properties
import java.util.concurrent.ConcurrentHashMap

import akka.actor.{ ActorSystem, Scheduler }
import akka.event.{ Logging, LoggingAdapter }
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.ContentTypes.`application/json`
import akka.http.scaladsl.model.StatusCodes.{ InternalServerError, OK }
import akka.http.scaladsl.server.Route
import akka.http.scaladsl.testkit.{ RouteTestTimeout, ScalatestRouteTest }
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.api.model.{ Protocols, SearchResult }
import au.csiro.data61.magda.model.misc.{ DataSet, _ }
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import au.csiro.data61.magda.search.elasticsearch._
import au.csiro.data61.magda.test.util.Generators._
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.testkit.ElasticSugar
import com.typesafe.config.{ Config, ConfigFactory }
import org.elasticsearch.common.settings.Settings
import org.scalacheck.Shrink
import org.scalacheck._
import org.scalactic.anyvals.PosInt
import org.scalatest.{ BeforeAndAfter, Matchers, _ }
import org.scalatest.prop.GeneratorDrivenPropertyChecks
import spray.json._

import scala.collection.JavaConverters._
import scala.concurrent.{ ExecutionContext, Future }
import scala.concurrent.duration.DurationInt
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicInteger
import java.util.function.Consumer
import au.csiro.data61.magda.util.SetExtractor
import org.scalacheck.Arbitrary._
import au.csiro.data61.magda.model.temporal.PeriodOfTime
import au.csiro.data61.magda.search.{ MatchAll, MatchPart }
import java.util.HashMap
import com.sksamuel.elastic4s.TcpClient
import com.sksamuel.elastic4s.ElasticDsl
import org.elasticsearch.cluster.health.ClusterHealthStatus
import com.sksamuel.elastic4s.embedded.LocalNode
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.api.model.Protocols

class SearchSpec extends BaseApiSpec {
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

      forAll(indexGen, textQueryGen(exactQueryGen)) { (indexTuple, queryTuple) ⇒
        val (_, dataSets, routes) = indexTuple
        val (textQuery, query) = queryTuple
        Get(s"/datasets/search?query=${encodeForUrl(textQuery)}&limit=${dataSets.length}") ~> routes ~> check {
          status shouldBe OK
          val response = responseAs[SearchResult]

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

            val dataSetPublisherName = dataSet.publisher.flatMap(_.name)
            val publisherMatched = if (!query.publishers.isEmpty) {
              query.publishers.exists(queryPublisher =>
                dataSetPublisherName.map(_.equals(queryPublisher)).getOrElse(false)
              )
            } else true

            val formatMatched = if (!query.formats.isEmpty) {
              query.formats.exists(queryFormat =>
                dataSet.distributions.exists(distribution =>
                  distribution.format.map(_.equals(queryFormat)).getOrElse(false)
                )
              )
            } else true

            val allValid = dateFromMatched && dateToMatched && publisherMatched && formatMatched

            withClue(s"with query $textQuery and dataSet dateTo $dataSetDateTo dateFrom $dataSetDateFrom publisher ${dataSet.publisher} formats ${dataSet.distributions.map(_.format).mkString(",")}") {
              if (response.strategy.get == MatchAll) {
                allValid should be(true)
              } else if (query.quotes.isEmpty && query.freeText.isEmpty) {
                allValid should be(false)
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
      forAll(smallIndexGen, textQueryGen()) { (indexTuple, queryTuple) ⇒
        val (textQuery, query) = queryTuple
        val (_, _, routes) = indexTuple

        whenever(noFiltersInFreeText(query)) {
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
    }
  }
}
