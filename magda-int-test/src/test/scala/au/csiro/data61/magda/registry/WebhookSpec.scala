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
import au.csiro.data61.magda.model.Temporal.PeriodOfTime
import au.csiro.data61.magda.model.Temporal.Periodicity
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchQueryer
import au.csiro.data61.magda.search.elasticsearch.Indices
import au.csiro.data61.magda.test.api.BaseApiSpec
import au.csiro.data61.magda.test.util.Generators
import spray.json._
import spray.json.JsNull
import spray.json.JsObject
import au.csiro.data61.magda.model.Temporal.ApiDate
import scala.concurrent.duration._

class WebhookSpec extends BaseApiSpec with RegistryProtocols with ModelProtocols with ApiProtocols {
  override def buildConfig = ConfigFactory.parseString("indexer.requestThrottleMs=1").withFallback(super.buildConfig)

  describe("records.changed") {
    it("should index new datasets") {
      val cachedListCache: scala.collection.mutable.Map[String, List[_]] = scala.collection.mutable.HashMap.empty
      try {
        val dataSetsGen = Generators.listSizeBetween(0, 20, Generators.dataSetGen(cachedListCache))
        val dataSetsBatchesGen = Generators.listSizeBetween(0, 3, dataSetsGen)

        forAll(dataSetsBatchesGen) { dataSetsBatches =>
          val indexId = UUID.randomUUID().toString

          val indices = new FakeIndices(indexId.toString)
          val indexer = new ElasticSearchIndexer(MockClientProvider, indices)
          val webhookApi = new WebhookApi(indexer)
          val searchQueryer = new ElasticSearchQueryer(indices)
          val searchApi = new SearchApi(searchQueryer)(config, logger)

          val routes = webhookApi.routes
          indexer.ready.await

          blockUntilIndexExists(indices.getIndex(config, Indices.DataSetsIndex))

          val payloads = dataSetsBatches.map(dataSets =>
            new WebHookPayload(
              action = "records.changed",
              lastEventId = 104856,
              events = None, // Not needed yet - soon?
              records = Some(dataSets.map(dataSetToRecord)),
              aspectDefinitions = None))

          val posts = payloads.map { payload =>
            new RequestBuilder(POST).apply("/", payload)
          }

          val responses = posts.map { post =>
            post ~> routes ~> check {
              status shouldBe Accepted
            }
          }
          val allDataSets = dataSetsBatches.flatten

          refresh(indexId)

          blockUntilExactCount(allDataSets.size, indexId, indices.getType(Indices.DataSetsIndexType))

          Get(s"/v0/datasets?query=*&limit=${allDataSets.size}") ~> searchApi.routes ~> check {
            status shouldBe OK
            val response = responseAs[SearchResult]

            val cleanedInputDataSets = allDataSets.map(dataSet => dataSet.copy(
              // The registry only looks for the duration text so copy the actual duration into the text
              accrualPeriodicity = dataSet.accrualPeriodicity.flatMap(_.duration).map(duration => Periodicity(text = Some(duration.get(ChronoUnit.SECONDS) * 1000 + " ms"))),

              publisher = dataSet.publisher.map(publisher =>
                Agent(
                  identifier = publisher.identifier,
                  name = publisher.name,
                  imageUrl = publisher.imageUrl)),

              distributions = dataSet.distributions.map(distribution => distribution.copy(
                // Distribution only takes into account the name
                license = distribution.license.flatMap(_.name).map(name => License(Some(name))),

                // Code derives media type from the format rather than reading it directly.
                mediaType = None)),

              source = None,

              // Contact points only look for name at the moment
              contactPoint = dataSet.contactPoint.flatMap(_.name).map(name => Agent(Some(name))),

              // Registry doesn't know how to do spatial extent yet, so just keep the text, no text == None
              spatial = dataSet.spatial match {
                case Some(Location(None, _)) => None
                case Some(spatial)           => Some(Location(spatial.text))
                case other                   => other
              },

              temporal = dataSet.temporal match {
                // The registry -> dataset converter rightly does this conversion.
                case Some(PeriodOfTime(None, None)) => None

                // The converter also filters out spatial extends that are a blank string, so we need to do that.
                case Some(PeriodOfTime(from, to)) => PeriodOfTime(filterDate(from), filterDate(to)) match {
                  case PeriodOfTime(None, None) => None
                  case other                    => Some(other)
                }
                case other => other
              }))

            val cleanedOutputDataSets = response.dataSets.map(dataSet => dataSet.copy(
              // We don't care about this. 
              indexed = None,
              source = None,

              distributions = dataSet.distributions.map(distribution => distribution.copy(
                // This will be derived from the format so might not match the input 
                mediaType = None))))

            withClue(cleanedOutputDataSets.toJson.prettyPrint + "\n should equal \n" + cleanedInputDataSets.toJson.prettyPrint) {
              cleanedOutputDataSets should equal(cleanedInputDataSets)
            }

            deleteIndex(indexId)
          }
        }
      } catch {
        case (e: Throwable) =>
          e.printStackTrace
          throw e
      }
    }
  }
  def filterDate(input: Option[ApiDate]): Option[ApiDate] = input.flatMap {
    case ApiDate(None, "") => None
    case other             => Some(other)
  }

  def dataSetToRecord(dataSet: DataSet): Record = {
    def removeNulls(jsObject: JsObject) = JsObject(jsObject.fields.filter {
      case (_, value) => value match {
        case JsNull => false
        case JsObject(fields) if fields.filterNot(_._2 == JsNull).isEmpty =>
          println("Got one!")
          false
        case _ => true
      }
    })
    def modifyJson(jsObject: JsObject, values: Map[String, JsValue]): JsObject = removeNulls(JsObject(jsObject.fields ++ values))

    val record = Record(
      id = dataSet.identifier,
      name = dataSet.title.getOrElse("No Title"),
      aspects = {
        val aspects: Map[String, JsObject] = Map(
          "dcat-dataset-strings" -> modifyJson(
            dataSet.copy(
              distributions = Seq(),
              publisher = None,
              accrualPeriodicity = None).toJson.asJsObject, Map(
              "accrualPeriodicity" -> dataSet.accrualPeriodicity.flatMap(_.duration).map(duration => duration.get(ChronoUnit.SECONDS) * 1000 + " ms").toJson,
              "contactPoint" -> dataSet.contactPoint.flatMap(_.name).map(_.toJson).getOrElse(JsNull),
              "temporal" -> dataSet.temporal.map {
                case PeriodOfTime(None, None) => JsNull
                case PeriodOfTime(start, end) =>
                  removeNulls(JsObject(
                    "start" -> start.map(_.text).toJson,
                    "end" -> end.map(_.text).toJson))
              }.getOrElse(JsNull),
              "spatial" -> dataSet.spatial.map(_.text).toJson)),
          "dataset-distributions" -> JsObject(
            "distributions" -> dataSet.distributions.map(dist =>
              JsObject(
                "id" -> dist.identifier.toJson,
                "name" -> dist.title.toJson,
                "aspects" -> JsObject(
                  "dcat-distribution-strings" ->
                    modifyJson(dist.toJson.asJsObject, Map(
                      "license" -> dist.license.flatMap(_.name).map(_.toJson).getOrElse(JsNull)))))).toJson),
          "source" -> JsObject(
            "name" -> dataSet.catalog.toJson),
          "dataset-publisher" -> dataSet.publisher.map(publisher => JsObject(
            "publisher" -> JsObject(
              "id" -> publisher.identifier.toJson,
              "name" -> publisher.name.toJson,
              "aspects" -> JsObject(
                "organization-details" -> removeNulls(JsObject(
                  "title" -> publisher.name.toJson,
                  "imageUrl" -> publisher.imageUrl.toJson)))))).toJson).filter { case (_, value) => value.isInstanceOf[JsObject] }
          .asInstanceOf[Map[String, JsObject]]

        val temporal = dataSet.temporal
          .map(temporal => (temporal.start.flatMap(_.date), temporal.end.flatMap(_.date)))
          .flatMap {
            case (None, None) => None
            case (from, to) =>
              Some(JsObject(
                "intervals" -> Seq(
                  removeNulls(JsObject(
                    "start" -> from.toJson,
                    "end" -> to.toJson))).toJson))
          }.map(_.toJson.asJsObject)

        temporal match {
          case Some(innerTemporal) => aspects + (("temporal-coverage", innerTemporal))
          case None                => aspects
        }
      })

    record
  }
}