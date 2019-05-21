package au.csiro.data61.magda.indexer

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.{Accepted, OK}
import akka.stream.scaladsl.Source
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.test.util.Generators
import spray.json.{JsObject, _}

import scala.concurrent.Await
import scala.concurrent.duration._

class Webhook_1_Spec extends WebhookSpecBase {

  override def beforeAll() = {
    println("Testing Webhook_1_Spec")
    super.beforeAll()
  }

  describe("when webhook received") {
    println("Testing when webhook received")

    it("should delete datasets mentioned in deletion events") {
      println("  - Testing should delete datasets mentioned in deletion events")

      val gen = for {
        gennedDataSets <- dataSetsGen
        dataSets = gennedDataSets.map(_._1)
        dataSetsToDelete <- Generators.subListGen(dataSets)
      } yield (dataSets, dataSetsToDelete)

      var counter = 0
      forAll(gen, workers(1), minSuccessful(2), maxDiscardedFactor(2.0), minSize(1), sizeRange(2)) {
        case (dataSets, dataSetsToDelete) =>
          val builtIndex = buildIndex()
          Await.result(builtIndex.indexer.index(Source.fromIterator(() => dataSets.iterator)), 30 seconds)

          Await.result(builtIndex.indexer.ready, 120 seconds)
          builtIndex.indexNames.foreach { idxName =>
            refresh(idxName)
          }
          blockUntilExactCount(dataSets.size, builtIndex.indexId)

          val events = dataSetsToDelete.map(dataSet =>
            RegistryEvent(
              id = None,
              eventTime = None,
              eventType = EventType.DeleteRecord,
              userId = 0,
              data = JsObject("recordId" -> JsString(dataSet.identifier))
            ))

          val payload = WebHookPayload(
            action = "records.changed",
            lastEventId = 104856,
            events = Some(events.toList),
            records = None,
            aspectDefinitions = None,
            deferredResponseUrl = None
          )

          Post("/", payload) ~> builtIndex.webhookApi.routes ~> check {
            status shouldBe Accepted
          }

          val expectedDataSets = dataSets.filter(dataSet => !dataSetsToDelete.contains(dataSet))

          builtIndex.indexNames.foreach { idxName =>
            refresh(idxName)
          }

          counter += 1
          println(s"    ***** counter = $counter")
          blockUntilExactCount(expectedDataSets.size, builtIndex.indexId)

          Get("/v0/datasets?query=*&limit=10000") ~> addSingleTenantIdHeader ~> builtIndex.searchApi.routes ~> check {
            status shouldBe OK
            val result = responseAs[SearchResult]

            result.dataSets.length shouldEqual expectedDataSets.length
            result.dataSets.map(_.identifier).toSet shouldEqual expectedDataSets.map(_.identifier).toSet
          }

          builtIndex.indexNames.foreach { idxName =>
            deleteIndex(idxName)
          }
      }
    }

  }
}
