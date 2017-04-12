package au.csiro.data61.magda.registry

import au.csiro.data61.magda.model.Registry._
import spray.json.JsObject
import java.time.format.DateTimeParseException
import java.time.{ OffsetDateTime, ZoneOffset }

import au.csiro.data61.magda.indexer.external.InterfaceConfig
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.model.Registry.{ Record, Protocols => RegistryProtocols }
import au.csiro.data61.magda.model.temporal.{ ApiDate, PeriodOfTime, Periodicity }
import spray.json.lenses.JsonLenses._
import spray.json.DefaultJsonProtocol._
import spray.json._
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import au.csiro.data61.magda.model.misc.{ Protocols => ModelProtocols }
import au.csiro.data61.magda.api.model.{ Protocols => ApiProtocols }

import scala.util.Try
import au.csiro.data61.magda.test.api.BaseApiSpec
import com.typesafe.config.ConfigFactory
import au.csiro.data61.magda.test.util.Generators
import java.util.UUID
import au.csiro.data61.magda.indexer.search.elasticsearch.{ElasticSearchIndexer}
import au.csiro.data61.magda.search.elasticsearch.Indices
import au.csiro.data61.magda.indexer.external.registry.RegistryIndexerApi
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchQueryer
import au.csiro.data61.magda.api.SearchApi
import akka.http.scaladsl.model.StatusCodes.{ OK, Accepted }
import akka.http.scaladsl.model.HttpMethods.POST
import akka.http.scaladsl.client.RequestBuilding
import spray.json.JsNull
import au.csiro.data61.magda.api.model.SearchResult
import java.time.temporal.ChronoUnit

class WebhookSpec extends BaseApiSpec with RegistryProtocols with ModelProtocols with ApiProtocols {
  override def buildConfig = ConfigFactory.parseString("indexer.requestThrottleMs=1").withFallback(super.buildConfig)

  describe("hello") {
    it("blah") {
      val dataSetsGen = Generators.listSizeBetween(0, 20, Generators.dataSetGen)

      forAll(dataSetsGen) { dataSets =>
        try {
          val indexId = UUID.randomUUID().toString

          val indices = new FakeIndices(indexId.toString)
          val indexer = new ElasticSearchIndexer(MockClientProvider, indices)
          val webhookApi = new RegistryIndexerApi(indexer)
          val searchQueryer = new ElasticSearchQueryer(indices)
          val searchApi = new SearchApi(searchQueryer)(config, logger)

          val routes = webhookApi.routes
          indexer.ready.await

          val payload = new RecordsChangedWebHookPayload(
            action = "records.changed",
            lastEventId = 104856,
            events = None, // Not needed yet - soon?
            records = Some(dataSets.map(dataSetToRecord))
          )

          val post = new RequestBuilder(POST).apply("/", payload)

          post ~> routes ~> check {
            status shouldBe Accepted
          }

          refresh(indexId)
          blockUntilExactCount(dataSets.size, indexId, indices.getType(Indices.DataSetsIndexType))

          Get(s"/datasets/search?query=*&limit=${dataSets.size}") ~> searchApi.routes ~> check {
            status shouldBe OK
            val response = responseAs[SearchResult]

            val cleanedInputDataSets = dataSets.map(dataSet => dataSet.copy(
              publisher = dataSet.publisher.map(publisher => Agent(name = publisher.name)),
              accrualPeriodicity = dataSet.accrualPeriodicity.flatMap(_.duration).map(duration => Periodicity(text = Some(duration.get(ChronoUnit.SECONDS) * 1000 + " ms"))),
              distributions = dataSet.distributions.map(distribution => distribution.copy(
                license = distribution.license.map(license => License(license.name))
              )),
              contactPoint = dataSet.contactPoint.map(contactPoint => Agent(contactPoint.name)),
              catalog = "MAGDA Registry"
            ))

            val cleanedOutputDataSets = response.dataSets.map(dataSet => dataSet.copy(
              indexed = None
            ))

            withClue(cleanedOutputDataSets.toJson.prettyPrint + "\n should equal \n" + cleanedInputDataSets.toJson.prettyPrint) {
              cleanedOutputDataSets should equal(cleanedInputDataSets)
            }
          }
        } catch {
          case e: Throwable =>
            e.printStackTrace
            throw e
        }
      }
    }
  }

  def removeNulls(jsObject: JsObject) = jsObject.copy(jsObject.fields.filterNot(_._2 == JsNull))
  //  def removeText(date: 
  def modifyJson(jsObject: JsObject, values: Map[String, JsValue]): JsObject = removeNulls(jsObject.copy(jsObject.fields ++ values))

  def dataSetToRecord(dataSet: DataSet): Record = {
    val record = Record(
      id = dataSet.identifier,
      name = dataSet.title.getOrElse("No Title"),
      aspects = Map(
        "dcat-dataset-strings" -> modifyJson(
          dataSet.copy(
            distributions = Seq(),
            publisher = None,
            temporal = None,
            accrualPeriodicity = None
          ).toJson.asJsObject, Map(
            "accrualPeriodicity" -> dataSet.accrualPeriodicity.flatMap(_.duration).map(duration => duration.get(ChronoUnit.SECONDS) * 1000 + " ms").toJson,
            "contactPoint" -> dataSet.contactPoint.flatMap(_.name).toJson,
            "publisher" -> dataSet.publisher.map(_.name).toJson
          )
        ),
        "dataset-distributions" -> JsObject(
          "distributions" -> dataSet.distributions.map(dist =>
            JsObject(
              "id" -> dist.title.toJson,
              "name" -> dist.title.toJson,
              "aspects" -> JsObject(
                "dcat-distribution-strings" ->
                  modifyJson(dist.toJson.asJsObject, Map(
                    "license" -> dist.license.map(_.name).toJson
                  ))
              )
            )
          ).toJson
        ),
        "temporal-coverage" -> dataSet.temporal
          .map(temporal => (temporal.start.flatMap(_.date), temporal.end.flatMap(_.date)))
          .flatMap {
            case (None, None) => None
            case (from, to) =>
              Some(JsObject(
                "intervals" -> Seq(
                  removeNulls(JsObject(
                    "start" -> from.toJson,
                    "end" -> to.toJson
                  ))
                ).toJson
              ))
          }.map(_.toJson.asJsObject)
          .getOrElse(JsObject())

      )
    )

    record
  }
}