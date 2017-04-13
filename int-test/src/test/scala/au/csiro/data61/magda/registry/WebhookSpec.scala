package au.csiro.data61.magda.registry

import java.time.temporal.ChronoUnit
import java.util.UUID

import com.typesafe.config.ConfigFactory

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.HttpMethods.POST
import akka.http.scaladsl.model.StatusCodes.Accepted
import akka.http.scaladsl.model.StatusCodes.OK
import au.csiro.data61.magda.api.SearchApi
import au.csiro.data61.magda.api.model.{ Protocols => ApiProtocols }
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.indexer.external.registry.WebhookApi
import au.csiro.data61.magda.indexer.search.elasticsearch.ElasticSearchIndexer
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.model.Registry.{ Protocols => RegistryProtocols }
import au.csiro.data61.magda.model.Registry.Record
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.model.misc.{ Protocols => ModelProtocols }
import au.csiro.data61.magda.model.temporal.PeriodOfTime
import au.csiro.data61.magda.model.temporal.Periodicity
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchQueryer
import au.csiro.data61.magda.search.elasticsearch.Indices
import au.csiro.data61.magda.test.api.BaseApiSpec
import au.csiro.data61.magda.test.util.Generators
import spray.json._
import spray.json.JsNull
import spray.json.JsObject
import au.csiro.data61.magda.model.temporal.ApiDate

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
          val webhookApi = new WebhookApi(indexer)
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
              publisher = dataSet.publisher.flatMap(_.name).map(name => Agent(name = Some(name))),
              accrualPeriodicity = dataSet.accrualPeriodicity.flatMap(_.duration).map(duration => Periodicity(text = Some(duration.get(ChronoUnit.SECONDS) * 1000 + " ms"))),
              distributions = dataSet.distributions.map(distribution => distribution.copy(
                license = distribution.license.flatMap(_.name).map(name => License(Some(name))),
                mediaType = None
              )),
              contactPoint = dataSet.contactPoint.flatMap(_.name).map(name => Agent(Some(name))),
              catalog = "MAGDA Registry",
              spatial = dataSet.spatial match {
                case Some(Location(None, _)) => None
                case Some(spatial)              => Some(Location(spatial.text))
                case other                      => other
              },
              temporal = dataSet.temporal match {
                case Some(PeriodOfTime(None, None)) => 
                  println("None None")
                  None
                case Some(PeriodOfTime(from, to)) => PeriodOfTime(filterDate(from), filterDate(to)) match {
                  case PeriodOfTime(None, None) => None
                  case other                    => Some(other)
                }
                case other => other
              }
            ))

            val cleanedOutputDataSets = response.dataSets.map(dataSet => dataSet.copy(
              indexed = None,
              distributions = dataSet.distributions.map(distribution => distribution.copy(
                mediaType = None
              ))
            ))

            withClue(cleanedOutputDataSets.toJson.prettyPrint + "\n should equal \n" + cleanedInputDataSets.toJson.prettyPrint) {
              cleanedOutputDataSets should equal(cleanedInputDataSets)
            }
          }
        } catch {
          case e: Throwable =>
            //            e.printStackTrace
            throw e
        }
      }
    }
  }
  def filterDate(input: Option[ApiDate]): Option[ApiDate] = input.flatMap {
    case ApiDate(None, "") => None
    case other             => Some(other)
  }

  def removeNulls(jsObject: JsObject) = JsObject(jsObject.fields.filter {
    case (_, value) => value match {
      case JsNull => false
      case JsObject(fields) if fields.filterNot(_._2 == JsNull).isEmpty =>
        println("Got one!")
        false
      case _ => true
    }
  })
  //  def removeText(date: 
  def modifyJson(jsObject: JsObject, values: Map[String, JsValue]): JsObject = removeNulls(JsObject(jsObject.fields ++ values))

  def dataSetToRecord(dataSet: DataSet): Record = {
    val record = Record(
      id = dataSet.identifier,
      name = dataSet.title.getOrElse("No Title"),
      aspects = {
        val aspects = Map(
          "dcat-dataset-strings" -> modifyJson(
            dataSet.copy(
              distributions = Seq(),
              publisher = None,
              accrualPeriodicity = None
            ).toJson.asJsObject, Map(
              "accrualPeriodicity" -> dataSet.accrualPeriodicity.flatMap(_.duration).map(duration => duration.get(ChronoUnit.SECONDS) * 1000 + " ms").toJson,
              "contactPoint" -> dataSet.contactPoint.flatMap(_.name).map(_.toJson).getOrElse(JsNull),
              "publisher" -> dataSet.publisher.flatMap(_.name).map(_.toJson).getOrElse(JsNull),
              "temporal" -> dataSet.temporal.map {
                case PeriodOfTime(None, None) => JsNull
                case PeriodOfTime(start, end) =>
                  removeNulls(JsObject(
                    "start" -> start.map(_.text).toJson,
                    "end" -> end.map(_.text).toJson
                  ))
              }.getOrElse(JsNull),
              "spatial" -> dataSet.spatial.map(_.text).toJson
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
                      "license" -> dist.license.flatMap(_.name).map(_.toJson).getOrElse(JsNull)
                    ))
                )
              )
            ).toJson
          )
        )

        val temporal = dataSet.temporal
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

        temporal match {
          case Some(innerTemporal) => aspects + (("temporal-coverage", innerTemporal))
          case None                => aspects
        }
      }
    )

    record
  }
}