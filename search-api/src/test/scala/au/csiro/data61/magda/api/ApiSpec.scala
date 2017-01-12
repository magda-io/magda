package au.csiro.data61.magda.api

import java.io.File
import java.util.Properties

import scala.concurrent.ExecutionContext
import scala.concurrent.Future
import scala.concurrent.duration.DurationInt

import org.scalacheck.Gen
import org.scalatest.BeforeAndAfter
import org.scalatest.FunSpec
import org.scalatest.Matchers
import org.scalatest.prop.PropertyChecks
import org.scalatest._
import org.scalatest.Matchers._

import com.sksamuel.elastic4s.ElasticDsl.RichFuture
import com.sksamuel.elastic4s.testkit.ElasticSugar
import com.typesafe.config.ConfigFactory

import akka.actor.Scheduler
import akka.event.Logging
import akka.event.LoggingAdapter
import akka.http.scaladsl.model.ContentTypes.`application/json`
import akka.http.scaladsl.model.StatusCodes.OK
import akka.http.scaladsl.testkit.ScalatestRouteTest
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.api.model.Protocols
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.crawler.Crawler
import au.csiro.data61.magda.external.InterfaceConfig
import au.csiro.data61.magda.search.SearchIndexer
import au.csiro.data61.magda.search.elasticsearch.ClientProvider
import au.csiro.data61.magda.search.elasticsearch.ElasticClientAdapter
import au.csiro.data61.magda.search.elasticsearch.ElasticClientTrait
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchQueryer
import au.csiro.data61.magda.search.elasticsearch.FacetDefinition
import au.csiro.data61.magda.search.elasticsearch.PublisherFacetDefinition
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.search.elasticsearch.YearFacetDefinition

class ApiSpec extends FunSpec with Matchers with ScalatestRouteTest with ElasticSugar with BeforeAndAfter with Protocols with PropertyChecks {
  override def testConfigSource = "akka.loglevel = DEBUG"
  val RESULT_COUNT = 921
  val QUERIES = Seq("*", "water", "2016", "history")
  val logger = Logging(system, getClass)

  override def testConfig = ConfigFactory.empty()

  class Fixture {
    implicit object MockClientProvider extends ClientProvider {
      override def getClient(implicit scheduler: Scheduler, logger: LoggingAdapter, ec: ExecutionContext): Future[ElasticClientTrait] = Future(new ElasticClientAdapter(client))
    }

    val properties = new Properties()
    properties.setProperty("regionLoading.cachePath", new File("./src/test/resources").getAbsolutePath())
    val generatedConf = ConfigFactory.parseProperties(properties)

    implicit val config = generatedConf.withFallback(AppConfig.conf(Some("test")))

    val indexer = SearchIndexer(MockClientProvider, config)
    val searchQueryer = ElasticSearchQueryer.apply
    val api = new Api(logger, searchQueryer)
    val routes = api.routes

    val interfaceConfigs = Seq(
      InterfaceConfig(config.getConfig("indexedServices.test"))
    )

    val crawler = new Crawler(interfaceConfigs, indexer)

    crawler.crawl().await(100 seconds)

    def blah(): Future[Unit] = searchQueryer.search(Query(Some("*")), 0, RESULT_COUNT, 0).flatMap { result =>
      if (result.hitCount != RESULT_COUNT) {
        Thread.sleep(500)
        blah()
      } else {
        Future(Unit)
      }
    }

    blah().await(100 seconds)
  }

  val fixture = new Fixture

  describe("dataset search") {
    it("* should return all results") {
      Get(s"/datasets/search?query=*&limit=$RESULT_COUNT") ~> fixture.routes ~> check {
        status shouldBe OK
        contentType shouldBe `application/json`
        val response = responseAs[SearchResult]
        response.hitCount shouldEqual RESULT_COUNT
        response.dataSets.size shouldEqual RESULT_COUNT
      }
    }

    it("hitCount should reflect all hits in the system, not just what is returned") {
      Get(s"/datasets/search?query=*&limit=${RESULT_COUNT / 2}") ~> fixture.routes ~> check {
        val response = responseAs[SearchResult]
        response.hitCount shouldEqual RESULT_COUNT
        response.dataSets.size should not equal RESULT_COUNT
      }
    }

    it("querying a dataset's title should return that dataset") {
      Get(s"/datasets/search?query=*") ~> fixture.routes ~> check {
        val dataSets = for (dataset <- Gen.oneOf(responseAs[SearchResult].dataSets)) yield dataset

        forAll(dataSets) { dataSet =>
          Get(s"/datasets/search?query=${java.net.URLEncoder.encode(dataSet.title.get, "UTF-8")}&limit=$RESULT_COUNT") ~> fixture.routes ~> check {
            val result = responseAs[SearchResult]
            result.dataSets.exists(_.identifier.equals(dataSet.identifier)) shouldBe true
          }
        }
      }
    }
  }

  describe("pagination") {
    it("should match the result of getting all datasets and using .drop(start).take(limit) to select a subset") {
      Get(s"/datasets/search?query=*&start=0&limit=$RESULT_COUNT") ~> fixture.routes ~> check {
        val originalResult = responseAs[SearchResult]

        val starts = for (n <- Gen.choose(0, 100)) yield n
        val limits = for (n <- Gen.choose(0, 100)) yield n

        forAll(starts, limits) { (start, limit) =>
          whenever(start >= 0 && start <= RESULT_COUNT && limit >= 0 && limit <= RESULT_COUNT) {
            Get(s"/datasets/search?query=*&start=${start}&limit=${limit}") ~> fixture.routes ~> check {
              val result = responseAs[SearchResult]

              val expectedResultIdentifiers = originalResult.dataSets.drop(start).take(limit).map(_.identifier)
              expectedResultIdentifiers shouldEqual result.dataSets.map(_.identifier)
            }
          }
        }
      }
    }
  }

  describe("facets") {
    val FACET_SIZE = 10
    val queries = for (dataset <- Gen.oneOf(QUERIES)) yield dataset
    val facetSizes = for (n <- Gen.choose(0, 10)) yield n

    describe("publisher") {
      it("should be consistent with grouping all the facet results by publisher id") {
        forAll(queries, facetSizes) { (query, facetSize) =>
          whenever(QUERIES.contains(query) && facetSize > 0) {
            Get(s"/datasets/search?query=$query&start=0&limit=$RESULT_COUNT&facetSize=$facetSize") ~> fixture.routes ~> check {
              val result = responseAs[SearchResult]
              val groupedResult = result.dataSets.groupBy(_.publisher.get.name.get)

              val publisherFacet = result.facets.get.find(_.id.equals(Publisher.id)).get

              publisherFacet.options.size should be <= facetSize

              val facetMinimal = publisherFacet.options.map(facet => (facet.value, facet.hitCount))

              facetMinimal shouldEqual groupedResult.mapValues(_.size).toList.sortBy(_._1).sortBy(-_._2).take(facetSize)
            }
          }
        }
      }
    }

    describe("year") {
      it("should generate even, non-overlapping facets") {
        forAll(queries, facetSizes) { (query, facetSize) =>
          whenever(QUERIES.contains(query) && facetSize > 0) {
            Get(s"/datasets/search?query=$query&start=0&limit=$RESULT_COUNT&facetSize=$facetSize") ~> fixture.routes ~> check {
              val result = responseAs[SearchResult]
              val yearFacet = result.facets.get.find(_.id.equals(Year.id)).get

              yearFacet.options.size should be > 0
              yearFacet.options.size should be <= facetSize

              yearFacet.options.foreach { option =>
                val upperBound = option.upperBound.get.toInt
                val lowerBound = option.lowerBound.get.toInt
                val size = upperBound - lowerBound + 1

                option.value should equal (s"$lowerBound - $upperBound") 
                YearFacetDefinition.YEAR_BIN_SIZES should contain (size)
                if (facetSize > 1) withClue(s"[$lowerBound-$upperBound with size $size]") { lowerBound % size shouldEqual 0 }
              }

              if (facetSize > 1)
                yearFacet.options.sliding(2).foreach {
                  case Seq(higherOption, lowerOption) =>
                    lowerOption.upperBound.get.toInt shouldEqual higherOption.lowerBound.get.toInt - 1
                }
            }
          }
        }
      }

      it("should be consistent with grouping all the facet results by temporal coverage year") {
        forAll(queries, facetSizes) { (query, facetSize) =>
          whenever(QUERIES.contains(query) && facetSize > 0) {
            Get(s"/datasets/search?query=$query&start=0&limit=$RESULT_COUNT&facetSize=$facetSize") ~> fixture.routes ~> check {
              val result = responseAs[SearchResult]
              val yearFacet = result.facets.get.find(_.id.equals(Year.id)).get

              yearFacet.options.foreach { option =>
                val matchingDatasets = result.dataSets
                  .filter(x => x.temporal.isDefined && (x.temporal.get.start.isDefined || x.temporal.get.end.isDefined))
                  .filter(dataSet => dataSet.temporal.get.start.orElse(dataSet.temporal.get.end).get.date.get.getYear <= option.upperBound.get.toInt)
                  .filter(dataSet => dataSet.temporal.get.end.orElse(dataSet.temporal.get.start).get.date.get.getYear >= option.lowerBound.get.toInt)

                matchingDatasets.size shouldEqual option.hitCount
              }
            }
          }
        }
      }
    }

    describe("format") {
      it("should be consistent with grouping all the facet results by format") {
        forAll(queries, facetSizes) { (query, facetSize) =>
          whenever(QUERIES.contains(query) && facetSize > 0) {
            Get(s"/datasets/search?query=$query&start=0&limit=$RESULT_COUNT&facetSize=$facetSize") ~> fixture.routes ~> check {
              val result = responseAs[SearchResult]
              val formatFacet = result.facets.get.find(_.id.equals(Format.id)).get

              formatFacet.options.foreach { option =>
                val matchingDatasets = result.dataSets
                  .filter(_.distributions.exists(_.format.map(_.equalsIgnoreCase(option.value)).getOrElse(false)))

                matchingDatasets.size shouldEqual option.hitCount
              }
            }
          }
        }
      }
    }

  }
}
