package au.csiro.data61.magda.api

import java.net.URL

import akka.event.Logging
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.Source
import akka.testkit.TestKit
import au.csiro.data61.magda.api.model.{Protocols, RegionSearchResult, SearchResult}
import au.csiro.data61.magda.search.elasticsearch._
import au.csiro.data61.magda.spatial.{RegionLoader, RegionSource}
import au.csiro.data61.magda.test.api.BaseApiSpec
import au.csiro.data61.magda.test.util.{MagdaElasticSugar, MagdaGeneratorTest, MagdaMatchers, TestActorSystem}
import com.sksamuel.elastic4s.http.ElasticDsl._
import com.sksamuel.elastic4s.http.{ElasticClient, ElasticDsl, RequestSuccess}
import com.typesafe.config.Config
import org.scalatest.{BeforeAndAfterAll, FunSpecLike, Matchers}
import spray.json._

import scala.concurrent.duration._
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.ContentTypes.`application/json`
import akka.http.scaladsl.model.StatusCodes.OK
import akka.http.scaladsl.server.Route
import akka.http.scaladsl.testkit.ScalatestRouteTest
import akka.stream.scaladsl.Source

class RegionsApiSpec
    extends FunSpecLike
    with BeforeAndAfterAll
    with Matchers
    with Protocols
    with ScalatestRouteTest
    with MagdaElasticSugar {

  implicit val ec = system.dispatcher
  implicit val config = TestActorSystem.config

  val logger = Logging(system, getClass)
  implicit val clientProvider = new DefaultClientProvider

  val searchQueryer = new ElasticSearchQueryer(fakeIndices)
  val api = new SearchApi(searchQueryer)(config, logger)

  override def client(): ElasticClient = clientProvider.getClient().await

  object fakeIndices extends Indices {
    override def getIndex(config: Config, index: Indices.Index): String =
      index match {
        case Indices.DataSetsIndex =>
          throw new RuntimeException(
            "Why are we here this is the regions test?")
        case Indices.PublishersIndex =>
          throw new RuntimeException(
            "Why are we here this is the regions test?")
        case Indices.FormatsIndex =>
          throw new RuntimeException(
            "Why are we here this is the regions test?")
        case Indices.RegionsIndex => "regions_test"
      }
  }

  override def beforeAll {
    super.beforeAll

    client
      .execute(IndexDefinition.regions.definition(fakeIndices, config))
      .await

    val fakeRegionLoader = new RegionLoader {
      override def setupRegions(): Source[(RegionSource, JsObject), _] =
        Source.fromIterator(() => BaseApiSpec.indexedRegions.toIterator)
    }

    logger.info("Setting up regions")
    IndexDefinition
      .setupRegions(client, fakeRegionLoader, DefaultIndices)
      .await(60 seconds)
    logger.info("Finished setting up regions")
  }

  override def afterAll {
    super.afterAll

    deleteIndex(fakeIndices.getIndex(config, Indices.RegionsIndex))
  }

  it("should return SA4 regions with extra id Fields") {
    Get(s"/v0/regions") ~> api.routes ~> check {
      status shouldBe OK
      contentType shouldBe `application/json`
      val response = responseAs[RegionSearchResult]

      response.hitCount shouldEqual indexedRegions.length
      1+1
    }
  }

  val indexedRegions = List(
    (new RegionSource("STE",
                      new URL("http://example.com"),
                      "STE_CODE11",
                      "STE_NAME11",
                      Some("STE_ABBREV"),
                      false,
                      false,
                      10),
     """
        |{
        |  "type": "Feature",
        |  "properties": {
        |    "STE_NAME11": "Test STE 1",
        |    "STE_CODE11": "1",
        |    "STE_ABBREV": "TSTE1"
        |  },
        |  "geometry": {
        |    "type": "Polygon",
        |    "coordinates": [
        |      [
        |        [
        |          146.63,
        |          -24.19
        |        ],
        |        [
        |          150.21,
        |          -24.19
        |        ],
        |        [
        |          150.21,
        |          -22.97
        |        ],
        |        [
        |          146.63,
        |          -22.97
        |        ],
        |        [
        |          146.63,
        |          -24.19
        |        ]
        |      ]
        |    ]
        |  }
        |}
      """.stripMargin.parseJson.asJsObject),
    (new RegionSource("STE",
                      new URL("http://example.com"),
                      "STE_CODE11",
                      "STE_NAME11",
                      Some("STE_ABBREV"),
                      false,
                      false,
                      10),
     """
        |{
        |  "type": "Feature",
        |  "properties": {
        |    "STE_NAME11": "Test STE 2",
        |    "STE_CODE11": "3",
        |    "STE_ABBREV": "TSTE2"
        |  },
        |  "geometry": {
        |    "type": "Polygon",
        |    "coordinates": [
        |      [
        |        [
        |          146.63,
        |          -24.19
        |        ],
        |        [
        |          150.21,
        |          -24.19
        |        ],
        |        [
        |          150.21,
        |          -22.97
        |        ],
        |        [
        |          146.63,
        |          -22.97
        |        ],
        |        [
        |          146.63,
        |          -24.19
        |        ]
        |      ]
        |    ]
        |  }
        |}
      """.stripMargin.parseJson.asJsObject),
    (new RegionSource("SA4",
                      new URL("http://example.com"),
                      "SA4_CODE11",
                      "SA4_NAME11",
                      None,
                      false,
                      false,
                      10,
                      STEIdField = Some("STE_CODE11")),
     """
        |{
        |  "type": "Feature",
        |  "properties": {
        |    "SA4_CODE11": "101",
        |    "SA4_NAME11": "Test SA4 1",
        |    "STE_CODE11": "1"
        |  },
        |  "geometry": {
        |    "type": "Polygon",
        |    "coordinates": [
        |      [
        |        [
        |          146.63,
        |          -24.19
        |        ],
        |        [
        |          150.21,
        |          -24.19
        |        ],
        |        [
        |          150.21,
        |          -22.97
        |        ],
        |        [
        |          146.63,
        |          -22.97
        |        ],
        |        [
        |          146.63,
        |          -24.19
        |        ]
        |      ]
        |    ]
        |  }
        |}
      """.stripMargin.parseJson.asJsObject),
    (new RegionSource("SA4",
                      new URL("http://example.com"),
                      "SA4_CODE11",
                      "SA4_NAME11",
                      None,
                      false,
                      false,
                      10,
                      STEIdField = Some("STE_CODE11")),
     """
        |{
        |  "type": "Feature",
        |  "properties": {
        |    "SA4_CODE11": "301",
        |    "SA4_NAME11": "Test SA4 2",
        |    "STE_CODE11": "3"
        |  },
        |  "geometry": {
        |    "type": "Polygon",
        |    "coordinates": [
        |      [
        |        [
        |          146.63,
        |          -24.19
        |        ],
        |        [
        |          150.21,
        |          -24.19
        |        ],
        |        [
        |          150.21,
        |          -22.97
        |        ],
        |        [
        |          146.63,
        |          -22.97
        |        ],
        |        [
        |          146.63,
        |          -24.19
        |        ]
        |      ]
        |    ]
        |  }
        |}
      """.stripMargin.parseJson.asJsObject),
    (new RegionSource("SA3",
                      new URL("http://example.com"),
                      "SA3_CODE11",
                      "SA3_NAME11",
                      None,
                      false,
                      false,
                      10,
                      STEIdField = Some("STE_CODE11"),
                      SA4IdField = Some("SA4_CODE11")),
     """
        |{
        |  "type": "Feature",
        |  "properties": {
        |    "SA3_CODE11": "10101",
        |    "SA3_NAME11": "Test SA3 1",
        |    "SA4_CODE11": "101",
        |    "STE_CODE11": "1"
        |  },
        |  "geometry": {
        |    "type": "Polygon",
        |    "coordinates": [
        |      [
        |        [
        |          146.63,
        |          -24.19
        |        ],
        |        [
        |          150.21,
        |          -24.19
        |        ],
        |        [
        |          150.21,
        |          -22.97
        |        ],
        |        [
        |          146.63,
        |          -22.97
        |        ],
        |        [
        |          146.63,
        |          -24.19
        |        ]
        |      ]
        |    ]
        |  }
        |}
      """.stripMargin.parseJson.asJsObject),
    (new RegionSource("SA3",
                      new URL("http://example.com"),
                      "SA3_CODE11",
                      "SA3_NAME11",
                      None,
                      false,
                      false,
                      10,
                      STEIdField = Some("STE_CODE11"),
                      SA4IdField = Some("SA4_CODE11")),
     """
        |{
        |  "type": "Feature",
        |  "properties": {
        |    "SA3_CODE11": "30101",
        |    "SA3_NAME11": "Test SA3 2",
        |    "SA4_CODE11": "301",
        |    "STE_CODE11": "3"
        |  },
        |  "geometry": {
        |    "type": "Polygon",
        |    "coordinates": [
        |      [
        |        [
        |          146.63,
        |          -24.19
        |        ],
        |        [
        |          150.21,
        |          -24.19
        |        ],
        |        [
        |          150.21,
        |          -22.97
        |        ],
        |        [
        |          146.63,
        |          -22.97
        |        ],
        |        [
        |          146.63,
        |          -24.19
        |        ]
        |      ]
        |    ]
        |  }
        |}
      """.stripMargin.parseJson.asJsObject),
    (new RegionSource(
       "SA2",
       new URL("http://example.com"),
       "SA2_MAIN11",
       "SA2_NAME11",
       None,
       false,
       false,
       10,
       STEIdField = Some("STE_CODE11"),
       SA4IdField = Some("SA4_CODE11"),
       SA3IdField = Some("SA3_CODE11")
     ),
     """
        |{
        |  "type": "Feature",
        |  "properties": {
        |    "SA2_MAIN11": "101011001",
        |    "SA3_CODE11": "10101",
        |    "SA3_NAME11": "Test SA2 1",
        |    "SA4_CODE11": "101",
        |    "STE_CODE11": "1"
        |  },
        |  "geometry": {
        |    "type": "Polygon",
        |    "coordinates": [
        |      [
        |        [
        |          146.63,
        |          -24.19
        |        ],
        |        [
        |          150.21,
        |          -24.19
        |        ],
        |        [
        |          150.21,
        |          -22.97
        |        ],
        |        [
        |          146.63,
        |          -22.97
        |        ],
        |        [
        |          146.63,
        |          -24.19
        |        ]
        |      ]
        |    ]
        |  }
        |}
      """.stripMargin.parseJson.asJsObject),
    (new RegionSource(
       "SA2",
       new URL("http://example.com"),
       "SA2_MAIN11",
       "SA2_NAME11",
       None,
       false,
       false,
       10,
       STEIdField = Some("STE_CODE11"),
       SA4IdField = Some("SA4_CODE11"),
       SA3IdField = Some("SA3_CODE11")
     ),
     """
        |{
        |  "type": "Feature",
        |  "properties": {
        |    "SA2_MAIN11": "301011001",
        |    "SA3_CODE11": "30101",
        |    "SA3_NAME11": "Test SA2 2",
        |    "SA4_CODE11": "301",
        |    "STE_CODE11": "3"
        |  },
        |  "geometry": {
        |    "type": "Polygon",
        |    "coordinates": [
        |      [
        |        [
        |          146.63,
        |          -24.19
        |        ],
        |        [
        |          150.21,
        |          -24.19
        |        ],
        |        [
        |          150.21,
        |          -22.97
        |        ],
        |        [
        |          146.63,
        |          -22.97
        |        ],
        |        [
        |          146.63,
        |          -24.19
        |        ]
        |      ]
        |    ]
        |  }
        |}
      """.stripMargin.parseJson.asJsObject),
    (new RegionSource(
       "SA1",
       new URL("http://example.com"),
       "SA1_MAIN11",
       "SA1_MAIN11",
       None,
       false,
       false,
       10,
       STEIdField = Some("STE_CODE11"),
       SA4IdField = Some("SA4_CODE11"),
       SA3IdField = Some("SA3_CODE11"),
       SA2IdField = Some("SA2_MAIN11")
     ),
     """
        |{
        |  "type": "Feature",
        |  "properties": {
        |    "SA1_MAIN11": "10101100101",
        |    "SA2_MAIN11": "101011001",
        |    "SA3_CODE11": "10101",
        |    "SA3_NAME11": "Test SA2 1",
        |    "SA4_CODE11": "101",
        |    "STE_CODE11": "1"
        |  },
        |  "geometry": {
        |    "type": "Polygon",
        |    "coordinates": [
        |      [
        |        [
        |          146.63,
        |          -24.19
        |        ],
        |        [
        |          150.21,
        |          -24.19
        |        ],
        |        [
        |          150.21,
        |          -22.97
        |        ],
        |        [
        |          146.63,
        |          -22.97
        |        ],
        |        [
        |          146.63,
        |          -24.19
        |        ]
        |      ]
        |    ]
        |  }
        |}
      """.stripMargin.parseJson.asJsObject),
    (new RegionSource(
       "SA1",
       new URL("http://example.com"),
       "SA1_MAIN11",
       "SA1_MAIN11",
       None,
       false,
       false,
       10,
       STEIdField = Some("STE_CODE11"),
       SA4IdField = Some("SA4_CODE11"),
       SA3IdField = Some("SA3_CODE11"),
       SA2IdField = Some("SA2_MAIN11")
     ),
     """
        |{
        |  "type": "Feature",
        |  "properties": {
        |    "SA1_MAIN11": "30101100101",
        |    "SA2_MAIN11": "301011001",
        |    "SA3_CODE11": "30101",
        |    "SA3_NAME11": "Test SA2 2",
        |    "SA4_CODE11": "301",
        |    "STE_CODE11": "3"
        |  },
        |  "geometry": {
        |    "type": "Polygon",
        |    "coordinates": [
        |      [
        |        [
        |          146.63,
        |          -24.19
        |        ],
        |        [
        |          150.21,
        |          -24.19
        |        ],
        |        [
        |          150.21,
        |          -22.97
        |        ],
        |        [
        |          146.63,
        |          -22.97
        |        ],
        |        [
        |          146.63,
        |          -24.19
        |        ]
        |      ]
        |    ]
        |  }
        |}
      """.stripMargin.parseJson.asJsObject)
  )

}
