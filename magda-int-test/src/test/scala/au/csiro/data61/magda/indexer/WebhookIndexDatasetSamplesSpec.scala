package au.csiro.data61.magda.indexer

import akka.event.LoggingAdapter
import au.csiro.data61.magda.api.model.SearchResult
import spray.json._
import au.csiro.data61.magda.model.Registry._

import scala.io.BufferedSource
import scala.io.Source.fromFile
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.OK
import au.csiro.data61.magda.client.Conversions
import org.scalamock.scalatest.MockFactory
import akka.stream.scaladsl.Source
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.time.{Seconds, Span}

import java.time.ZoneOffset

class WebhookIndexDatasetSamplesSpec
    extends WebhookSpecBase
    with MockFactory
    with ScalaFutures {

  describe("Test indexing sample datasets") {

    implicit val defaultOffset: ZoneOffset =
      ZoneOffset.of(config.getString("time.defaultOffset"))

    val sampleFileDir = "magda-int-test/src/test/resources/sampleDatasets/"

    def testSampleFile(fileName: String): Unit = {
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
            fail(msg)
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
          withClue("Elasticsearch failed to index the dataset: "){
            result.successes shouldBe 1
            result.failures.size shouldBe 0
          }
        }

        builtIndex.indexNames.foreach { idxName =>
          refresh(idxName)
        }

        blockUntilExactCount(1, builtIndex.indexId)

        Get(s"/v0/datasets?query=*&limit=10") ~> addSingleTenantIdHeader ~> builtIndex.searchApi.routes ~> check {
          status shouldBe OK
          val response = responseAs[SearchResult]

          response.hitCount shouldBe 1
          response.dataSets.head.identifier shouldBe record.id
        }

        builtIndex.indexNames.foreach { idxName =>
          deleteIndex(idxName)
        }
      }
    }

    testSampleFile("wa1.json")

  }
}
