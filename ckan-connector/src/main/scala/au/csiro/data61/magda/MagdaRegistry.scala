package au.csiro.data61.magda
import akka.actor.{Actor, ActorLogging, ActorRef, ActorSystem}
import akka.http.scaladsl.Http
import akka.http.scaladsl.marshalling.{Marshal, PredefinedToEntityMarshallers}
import akka.http.scaladsl.model._
import akka.stream.Materializer
import akka.stream.scaladsl.{Flow, Sink, Source}
import au.csiro.data61.magda.model.misc.{DataSet, Protocols}
import au.csiro.data61.magda.util.Http._
import spray.json.JsObject
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.unmarshalling.Unmarshal
import au.csiro.data61.magda.external.InterfaceConfig
import au.csiro.data61.magda.search.elasticsearch.ClientProvider
import com.typesafe.config.Config
import spray.json._
import spray.json.DefaultJsonProtocol._

import scala.concurrent.{ExecutionContext, Future, Promise}

case class Record(
                   id: String,
                   name: String,
                   aspects: Map[String, JsObject]
)

case class AspectDefinition(
  id: String,
  name: String,
  jsonSchema: JsObject
)

case class SourceSection(
  `type`: String,
  url: String
)

case class BadRequest(message: String) {
}

class MagdaRegistry(
    val clientProvider: ClientProvider,
    val config: Config)(
        implicit val system: ActorSystem,
        implicit val ec: ExecutionContext,
        implicit val materializer: Materializer) extends Registry with Protocols {
  private val http = Http()

  private implicit val recordFormat = jsonFormat3(Record)
  private implicit val sourceSectionFormat = jsonFormat2(SourceSection)
  private implicit val badRequestFormat = jsonFormat1(BadRequest)
  private implicit val sectionDefinitionFormat = jsonFormat3(AspectDefinition)

  private val registryBaseUri = Uri(config.getString("registry.url"))

  override def initialize(): Future[Any] = {
    val sections = List(
      AspectDefinition("source", "Source", JsObject()),
      AspectDefinition("dataset-summary", "Dataset Summary", JsObject()),
      AspectDefinition("distribution-summary", "Distribution Summary", JsObject())
    )

    Source(sections).mapAsync(6)(section => {
      for {
        entity <- Marshal(section).to[MessageEntity]
        put <- http.singleRequest(HttpRequest(
          // TODO: get  the base URL from configuration
          // TODO: URI encode the ID
          uri = Uri("0.1/aspects/" + section.id).resolvedAgainst(registryBaseUri),
          method = HttpMethods.PUT,
          entity = entity
        ))
        result <- put.status match {
          case StatusCodes.OK => Unmarshal(put.entity).to[AspectDefinition]
          case StatusCodes.BadRequest => Unmarshal(put.entity).to[BadRequest].map(badRequest => throw new RuntimeException(badRequest.message))
          case anythingElse => {
            put.discardEntityBytes()
            throw new RuntimeException("Aspect definition creation failed.")
          }
        }
      } yield result
    }).runFold(Seq[AspectDefinition]())((definitions, definition) => definition +: definitions)
  }

  override def add(source: InterfaceConfig, dataSets: List[DataSet]): Future[Any] = {
    val result = Source(dataSets).mapAsync(6)((dataset: DataSet) => {
      val source = SourceSection(
        `type` = "ckan-dataset", // TODO
        url = "https://data.gov.au/api/3/action/package_show?id=" + dataset.identifier
      )

      val record = Record(
        // TODO: prefix the identifier, e.g. "dga:" + dataset.identifier
        id = dataset.identifier,
        name = dataset.title.getOrElse(dataset.identifier),
        aspects = Map(
          "source" -> source.toJson.asJsObject(),
          "dataset-summary" -> dataset.toJson.asJsObject()
        )
      )

      Marshal(record).to[MessageEntity].flatMap(entity => {
        http.singleRequest(HttpRequest(
          // TODO: get  the base URL from configuration
          // TODO: URI encode the ID
          uri = Uri("0.1/records/" + dataset.identifier).resolvedAgainst(registryBaseUri),
          method = HttpMethods.PUT,
          entity = entity
        )).flatMap(response => {
          if (response.status == StatusCodes.OK) {
            Unmarshal(response.entity).to[Record]
          } else if (response.status == StatusCodes.BadRequest) {
            Unmarshal(response.entity).to[BadRequest].map(badRequest => throw new RuntimeException(badRequest.message))
          } else {
            response.discardEntityBytes()
            throw new RuntimeException("Record creation failed.")
          }
        })
      })
    })

    result.runForeach(record => println("Added/Updated " + record.name))
  }

  override def needsReindexing(source: InterfaceConfig): Future[Boolean] = {
    Future(true)
  }
}
