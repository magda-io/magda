package au.csiro.data61.magda
import java.net.URLEncoder
import java.nio.file.{Files, Paths}

import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.marshalling.{Marshal, PredefinedToEntityMarshallers}
import akka.http.scaladsl.model._
import akka.stream.Materializer
import akka.stream.scaladsl.{Flow, Sink, Source}
import au.csiro.data61.magda.model.misc.{DataSet, Protocols}
import spray.json.JsObject
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.unmarshalling.Unmarshal
import au.csiro.data61.magda.external.InterfaceConfig
import au.csiro.data61.magda.search.elasticsearch.ClientProvider
import com.typesafe.config.Config
import spray.json._

import scala.concurrent.{ExecutionContext, Future}

class MagdaRegistry(
    val clientProvider: ClientProvider,
    val config: Config)(
        implicit val system: ActorSystem,
        implicit val ec: ExecutionContext,
        implicit val materializer: Materializer) extends Registry with Protocols {
  private val http = Http()

  private val registryBaseUri = Uri(config.getString("registry.url"))

  override def initialize(): Future[Any] = {
    val sections = List(
      createAspectDefinition("basic", "Basic Information", getJsonSchemaResource("/basic.schema.json")),
      createAspectDefinition("source", "Source", getJsonSchemaResource("/source.schema.json")),
      createAspectDefinition("dataset-summary", "Dataset Summary", JsObject()),
      createAspectDefinition("distribution-summary", "Distribution Summary", JsObject())
    )

    Source(sections).mapAsync(6)(section => {
      val id = URLEncoder.encode(section.fields("id").convertTo[String], "UTF-8")
      for {
        entity <- Marshal(section).to[MessageEntity]
        put <- http.singleRequest(HttpRequest(
          uri = Uri("0.1/aspects/" + id).resolvedAgainst(registryBaseUri),
          method = HttpMethods.PUT,
          entity = entity
        ))
        result <- put.status match {
          case StatusCodes.OK => Unmarshal(put.entity).to[JsObject]
          case StatusCodes.BadRequest => Unmarshal(put.entity).to[JsObject].map(badRequest => throw new RuntimeException("The request to define an aspect failed.  Failure response was:\n" + badRequest.prettyPrint))
          case _ => {
            put.discardEntityBytes()
            throw new RuntimeException("Aspect definition creation failed.")
          }
        }
      } yield result
    }).runFold(Seq[JsObject]())((definitions, definition) => definition +: definitions)
  }

  override def add(source: InterfaceConfig, dataSets: List[DataSet]): Future[Any] = {
    val result = Source(dataSets).mapAsync(6)((dataset: DataSet) => {
      val qualifiedId = source.name + ":" + dataset.identifier
      val qualifiedIdInUrl = URLEncoder.encode(qualifiedId, "UTF-8")
      val idInUrl = URLEncoder.encode(dataset.identifier, "UTF-8")
      val sourceUrl = Uri("api/3/action/package_show").withQuery(Uri.Query("id" -> idInUrl)).resolvedAgainst(Uri(source.baseUrl.toString))

      val record = JsObject(
        "id" -> JsString(qualifiedId),
        "name" -> JsString(dataset.title.getOrElse(dataset.identifier)),
        "aspects" -> JsObject(
          "source" -> JsObject(
            "type" -> JsString("ckan-dataset"),
            "url" -> JsString(sourceUrl.toString())
          ),
          "basic" -> JsObject(
            "title" -> JsString(dataset.title.getOrElse("")),
            "description" -> JsString(dataset.description.getOrElse(""))
          )
        )
      )

      Marshal(record).to[MessageEntity].flatMap(entity => {
        http.singleRequest(HttpRequest(
          uri = Uri("0.1/records/" + qualifiedIdInUrl).resolvedAgainst(registryBaseUri),
          method = HttpMethods.PUT,
          entity = entity
        )).flatMap(response => {
          if (response.status == StatusCodes.OK) {
            Unmarshal(response.entity).to[JsObject]
          } else if (response.status == StatusCodes.BadRequest) {
            Unmarshal(response.entity).to[JsObject].map(badRequest => throw new RuntimeException("The request to PUT a record failed.  Failure response was:\n" + badRequest.prettyPrint))
          } else {
            response.discardEntityBytes()
            throw new RuntimeException("Record creation failed.")
          }
        })
      })
    })

    result.runForeach(record => println("Added/Updated " + record.fields("name")))
  }

  override def needsReindexing(source: InterfaceConfig): Future[Boolean] = {
    Future(true)
  }

  private def getJsonSchemaResource(name: String): JsObject = {
    val url = getClass.getResource(name)
    val resPath = Paths.get(url.toURI())
    JsonParser(new String(Files.readAllBytes(resPath), "UTF8")).asJsObject
  }

  private def createAspectDefinition(id: String, name: String, jsonSchema: JsObject) =
    JsObject(
      "id" -> JsString(id),
      "name" -> JsString(name),
      "jsonSchema" -> jsonSchema
    )

}