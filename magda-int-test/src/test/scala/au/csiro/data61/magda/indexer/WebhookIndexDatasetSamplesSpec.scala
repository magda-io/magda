package au.csiro.data61.magda.indexer

import akka.event.LoggingAdapter
import au.csiro.data61.magda.api.model.SearchResult
import spray.json._
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.model.misc.DataSet

import scala.io.BufferedSource
import scala.io.Source.fromFile
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.OK
import au.csiro.data61.magda.client.Conversions
import org.scalamock.scalatest.MockFactory
import akka.stream.scaladsl.Source
import au.csiro.data61.magda.indexer.search.SearchIndexer.IndexResult
import com.monsanto.labs.mwundo.GeoJson.Polygon
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.time.{Seconds, Span}

import java.time.ZoneOffset
import scala.concurrent.{Future, Promise}

class WebhookIndexDatasetSamplesSpec
    extends WebhookSpecBase
    with MockFactory
    with ScalaFutures {

  describe("Test indexing sample datasets") {

    implicit val defaultOffset: ZoneOffset =
      ZoneOffset.of(config.getString("time.defaultOffset"))

    val sampleFileDir = "magda-int-test/src/test/resources/sampleDatasets/"

    val noop = (_: Any, _: Any) => ()

    /**
      * Run test case on a sample dataset data file.
      *
      * @param fileName
      * @param validateDatasetFunc an optional customise validation func.
      *                            1st argument: original dataset data: Record type
      *                            2nd argument: indexed dataset data pulled from elasticsearch: Dataset type
      */
    def testSampleFile(
        fileName: String,
        validateDatasetFunc: Option[((Record, DataSet) => Unit)] = None,
        indexingResultValidationFunc: Option[(IndexResult) => Unit] = None,
        ignoreSpatialIndexError: Boolean = false
    ): Unit = {
      it(s"should index sample dataset file: ${fileName} with no error") {
        val jsonResSource: BufferedSource = fromFile(
          sampleFileDir + fileName
        )
        val jsonRes: String =
          try {
            jsonResSource.mkString
          } finally {
            jsonResSource.close()
          }

        val record = JsonParser(jsonRes).convertTo[Record]

        val mockLogger = mock[LoggingAdapter]
        (mockLogger.error _: String => Unit)
          .expects(*)
          .onCall { msg: String =>
            system.log.error(s"mockLogger: ${msg}")
            if (!ignoreSpatialIndexError) {
              fail(msg)
            }
          }
          .anyNumberOfTimes()

        val dataset = Conversions
          .convertRegistryDataSet(record, Some(mockLogger))

        val builtIndex = buildIndex()

        whenReady(
          builtIndex.indexer
            .index(Source(List(dataset))),
          timeout(Span(3, Seconds))
        ) { result =>
          withClue("Elasticsearch failed to index the dataset: ") {
            if (indexingResultValidationFunc.isDefined) {
              indexingResultValidationFunc.get(result)
            } else {
              result.successes shouldBe 1
              result.failures shouldBe 0
              result.warns shouldBe 0
            }
          }
        }

        builtIndex.indexNames.foreach { idxName =>
          refresh(idxName)
        }

        blockUntilExactCount(1, builtIndex.indexId)

        Get(s"/v0/datasets?query=*&limit=10") ~> addSingleTenantIdHeader ~> builtIndex.searchApi.routes ~> check {
          status shouldBe OK
          val response = responseAs[SearchResult]

          if (validateDatasetFunc.isDefined) {
            validateDatasetFunc.get(record, response.dataSets.head)
          } else {
            response.hitCount shouldBe 1
            response.dataSets.head.identifier shouldBe record.id
          }
        }

        builtIndex.indexNames.foreach { idxName =>
          deleteIndex(idxName)
        }
      }
    }

    /**
      * Ensure indexer will auto-fix polygons / MultiPolygons that don't topologically closed.
      * i.e. the last point should be a repeat of the first point
      */
    testSampleFile(
      "wa1.json",
      Some((sampleData, esDataset) => {
        val originalPolygon = sampleData.aspects
          .find(aspect => aspect._1 == "dcat-dataset-strings")
          .map(_._2.fields("spatial").asInstanceOf[JsString])
          .map(item => JsonParser(item.value).asInstanceOf[JsObject])
          .map(GeometryFormat.read(_))
          .get
          .asInstanceOf[Polygon]

        val esPolygon = esDataset.spatial.get.geoJson.get.asInstanceOf[Polygon]

        originalPolygon.coordinates.head.size shouldBe esPolygon.coordinates.head.size - 1
        originalPolygon.coordinates.head.head.x shouldBe esPolygon.coordinates.head.last.x
        originalPolygon.coordinates.head.head.y shouldBe esPolygon.coordinates.head.last.y
        originalPolygon.coordinates.head
          .zip(
            esPolygon.coordinates.head.take(esPolygon.coordinates.head.size - 1)
          )
          .foreach { pair =>
            pair._1.x shouldBe pair._2.x
            pair._1.y shouldBe pair._2.y
          }
      }),
      Some(result => {
        result.successes shouldBe 1
        result.failures shouldBe 0
        result.warns shouldBe 0
      })
    )

    /**
      * Ensure indexer will still index datasets with invalid spatial data (not auto-fixable) by
      * retrying indexing a new version dataset with spatial field removed
      */
    testSampleFile(
      "wa1-with-invalid-spatial-data.json",
      Some((sampleData, esDataset) => {
        esDataset.spatial.get.geoJson shouldBe None
        esDataset.spatial.get.text.isDefined shouldBe true
      }),
      Some(result => {
        result.successes shouldBe 0
        result.failures shouldBe 0
        result.warns shouldBe 1
      })
    )

  }
}
