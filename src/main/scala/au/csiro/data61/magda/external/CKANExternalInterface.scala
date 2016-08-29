package au.csiro.data61.magda.external

import akka.actor.ActorSystem
import akka.event.{ LoggingAdapter, Logging }
import akka.http.scaladsl.Http
import akka.http.scaladsl.client.RequestBuilding
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.marshalling.ToResponseMarshallable
import akka.http.scaladsl.model.{ HttpResponse, HttpRequest }
import akka.http.scaladsl.model.StatusCodes._
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.unmarshalling.Unmarshal
import akka.stream.{ ActorMaterializer, Materializer }
import akka.stream.scaladsl.{ Flow, Sink, Source }
import com.typesafe.config.Config
import com.typesafe.config.ConfigFactory
import java.io.IOException
import scala.concurrent.{ ExecutionContextExecutor, Future }
import scala.math._
import spray.json.DefaultJsonProtocol
import au.csiro.data61.magda.api.Types._

case class CKANSearchResponse(success: Boolean, result: CKANSearchResult)
case class CKANSearchResult(count: Int, results: List[CKANDataSet])
object CKANState extends Enumeration {
  type CKANState = Value
  val active, deleted = Value
}
import CKANState._
import spray.json.JsonFormat
import spray.json.JsValue
import spray.json.JsString
import java.time.Instant
import spray.json.JsonReader
import spray.json.JsNull

case class CKANDataSet(
  id: String,
  /** The name of the new dataset, must be between 2 and 100 characters long and contain only lowercase alphanumeric characters */
  name: String,
  /** the title of the dataset (optional, default: same as name) */
  title: Option[String],
  /** the name of the dataset’s author (optional) */
  author: Option[String],
  /**  the email address of the dataset’s author (optional) */
  author_email: Option[String],
  /** the name of the dataset’s maintainer (optional) */
  maintainer: Option[String],
  /**  the email address of the dataset’s maintainer (optional) */
  maintainer_email: Option[String],
  /** the id of the dataset’s license, see license_list() for available values (optional) */
  license_id: Option[String],
  /** a description of the dataset (optional) */
  notes: Option[String],
  /** a URL for the dataset’s source (optional) */
  url: Option[String],
  /** version (string, no longer than 100 characters) – (optional) */
  version: Option[String],
  /**  the current state of the dataset, e.g. 'active' or 'deleted', only active datasets show up in search results and other lists of datasets, this parameter will be ignored if you are not authorized to change the state of the dataset (optional, default: 'active') */
  state: CKANState,
  /**  the type of the dataset (optional), IDatasetForm plugins associate themselves with different dataset types and provide custom dataset handling behaviour for these types */
  `type`: Option[String],
  /** (list of resource dictionaries) – the dataset’s resources, see resource_create() for the format of resource dictionaries (optional) */
  resources: Option[Seq[CKANResource]],
  /** (list of tag dictionaries) – the dataset’s tags, see tag_create() for the format of tag dictionaries (optional) */
  tags: Option[Seq[CKANTag]],
  /** (list of dataset extra dictionaries) – the dataset’s extras (optional), extras are arbitrary (key: value) metadata items that can be added to datasets, each extra dictionary should have keys 'key' (a string), 'value' (a string) */
  extras: Option[Seq[Map[String, String]]],

  relationships_as_object: Option[Seq[CKANRelationship]],
  relationships_as_subject: Option[Seq[CKANRelationship]],

  /** the groups to which the dataset belongs (optional), each group dictionary should have one or more of the following keys which identify an existing group: 'id' (the id of the group, string), or 'name' (the name of the group, string), to see which groups exist call group_list() */
  groups: Seq[CKANGroup],

  /** the id of the dataset’s owning organization, see organization_list() or organization_list_for_user() for available values (optional) */
  owner_org: Option[String],

  license_title: Option[String],
  metadata_created: String,
  metadata_modified: String,
  contact_point: Option[String],
  temporal_coverage_from: Option[String],
  update_freq: Option[String])

case class CKANGroup(
  name: Option[String],
  id: Option[String])

case class CKANRelationship(
  subject: String,
  `object`: String,
  `type`: String,
  comment: Option[String])

case class CKANResource(
  /** id of package that the resource should be added to. */
  package_id: String,
  /** url of resource */
  id: String,
  revision_id: Option[String],
  description: Option[String],
  format: Option[String],
  hash: Option[String],
  name: Option[String],
  mimetype: Option[String],
  mimetype_inner: Option[String],
  cache_url: Option[String],
  size: Option[String],
  created: Option[String],
  last_modified: Option[String],
  cache_last_modified: Option[String])

case class CKANTag(
  id: String,
  name: String,
  display_name: String,
  vocabulary_id: Option[String])

trait CKANProtocols extends DefaultJsonProtocol {
  implicit val resourceFormat = jsonFormat14(CKANResource.apply)
  implicit val tagFormat = jsonFormat4(CKANTag.apply)
  implicit object CKANStateFormat extends JsonFormat[CKANState] {
    override def write(state: CKANState): JsString = JsString.apply(state.toString())
    override def read(json: JsValue): CKANState = CKANState.withName(json.convertTo[String])
  }
  implicit val relationshipFormat = jsonFormat4(CKANRelationship.apply)
  implicit val groupFormat = jsonFormat2(CKANGroup.apply)
  implicit object CKANDataSetFormat extends JsonFormat[CKANDataSet] {
    override def write(dataSet: CKANDataSet): JsString = ???
    override def read(json: JsValue): CKANDataSet = {
      val jsObject = json.asJsObject

      def convertOption[A: JsonReader](field: String): Option[A] = jsObject.getFields(field).headOption match {
        case Some(JsNull)         => None
        case Some(value: JsValue) => Some(value.convertTo[A])
        case None                 => None
      }

      new CKANDataSet(
        id = jsObject.getFields("id").head.convertTo[String],
        name = jsObject.getFields("name").head.convertTo[String],
        title = convertOption[String]("title"),
        author = convertOption[String]("author"),
        author_email = convertOption[String]("author_email"),
        maintainer = convertOption[String]("maintainer"),
        maintainer_email = convertOption[String]("maintainer_email"),
        license_id = convertOption[String]("license_id"),
        notes = convertOption[String]("notes"),
        url = convertOption[String]("url"),
        version = convertOption[String]("version"),
        state = jsObject.getFields("state").head.convertTo[CKANState],
        `type` = convertOption[String]("type"),
        resources = convertOption[Seq[CKANResource]]("resources"),
        tags = convertOption[Seq[CKANTag]]("tags"),
        extras = convertOption[Seq[Map[String, String]]]("extras"),
        relationships_as_object = convertOption[Seq[CKANRelationship]]("relationships_as_object"),
        relationships_as_subject = convertOption[Seq[CKANRelationship]]("relationships_as_subject"),
        groups = jsObject.getFields("groups").head.convertTo[Seq[CKANGroup]],
        owner_org = convertOption[String]("owner_org"),
        license_title = convertOption[String]("license_title"),
        metadata_created = jsObject.getFields("metadata_created").head.convertTo[String],
        metadata_modified = jsObject.getFields("metadata_modified").head.convertTo[String],
        contact_point = convertOption[String]("contact_point"),
        temporal_coverage_from = convertOption[String]("temporal_coverage_from"),
        update_freq = convertOption[String]("update_freq")
      )
    }
  }

  implicit val searchResultFormat = jsonFormat2(CKANSearchResult.apply)
  implicit val searchResponseFormat = jsonFormat2(CKANSearchResponse.apply)
}

//object CKANExternalInterface {
//  def apply(implicit config: Config, system: ActorSystem, executor: ExecutionContextExecutor, materializer: Materializer) = new CKANExternalInterface()
//}

class CKANExternalInterface(implicit val config: Config, implicit val system: ActorSystem, implicit val executor: ExecutionContextExecutor, implicit val materializer: Materializer) extends CKANProtocols with ExternalInterface {
  implicit val logger = Logging(system, getClass)
  implicit def ckanSearchConv(ckanResponse: CKANSearchResponse): SearchResult = SearchResult(hitCount = ckanResponse.result.count, dataSets = ckanResponse.result.results)
  implicit def ckanDataSetConv(hit: CKANDataSet): DataSet = DataSet(
    title = hit.title,
    identifier = hit.url.getOrElse("no url"),
    catalog = "DGA")
  implicit def ckanDataSetListConv(l: List[CKANDataSet]): List[DataSet] = l map ckanDataSetConv

  lazy val ckanApiConnectionFlow: Flow[HttpRequest, HttpResponse, Any] =
    Http().outgoingConnection(config.getString("services.dga-api.host"), config.getInt("services.dga-api.port"))

  def ckanRequest(request: HttpRequest): Future[HttpResponse] = Source.single(request).via(ckanApiConnectionFlow).runWith(Sink.head)

  def search(query: String): Future[Either[String, SearchResult]] = {
    ckanRequest(RequestBuilding.Get(s"/api/3/action/package_search?q=$query")).flatMap { response =>
      response.status match {
        case OK         => Unmarshal(response.entity).to[CKANSearchResponse].map(Right(_))
        case BadRequest => Future.successful(Left(s"$query: incorrect IP format"))
        case _ => Unmarshal(response.entity).to[String].flatMap { entity =>
          val error = s"CKAN request failed with status code ${response.status} and entity $entity"
          logger.error(error)
          Future.failed(new IOException(error))
        }
      }
    }
  }
}