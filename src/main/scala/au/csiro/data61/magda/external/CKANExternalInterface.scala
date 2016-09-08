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
import spray.json.JsonFormat
import spray.json.JsValue
import spray.json.JsString
import java.time.Instant
import spray.json.JsonReader
import spray.json.JsNull
import scala.concurrent.ExecutionContext
import java.net.URL

case class CKANSearchResponse(success: Boolean, result: CKANSearchResult)
case class CKANSearchResult(count: Int, results: List[CKANDataSet])
object CKANState extends Enumeration {
  type CKANState = Value
  val active, deleted = Value
}
import CKANState._

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
  organization: Option[CKANOrganization],

  spatial: Option[String],
  spatial_coverage: Option[String],

  license_title: Option[String],
  metadata_created: String,
  metadata_modified: String,
  contact_point: Option[String],
  temporal_coverage_from: Option[String],
  temporal_coverage_to: Option[String],
  update_freq: Option[String],
  language: Option[String])

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

case class CKANOrganization(
  id: String,
  name: String,
  title: Option[String],
  description: Option[String],
  created: Option[String],
  state: Option[CKANState],
  image_url: Option[String],
  `type`: Option[String])

trait CKANProtocols extends DefaultJsonProtocol {
  implicit val resourceFormat = jsonFormat14(CKANResource.apply)
  implicit val tagFormat = jsonFormat4(CKANTag.apply)
  implicit object CKANStateFormat extends JsonFormat[CKANState] {
    override def write(state: CKANState): JsString = JsString.apply(state.toString())
    override def read(json: JsValue): CKANState = CKANState.withName(json.convertTo[String])
  }
  implicit val relationshipFormat = jsonFormat4(CKANRelationship.apply)
  implicit val groupFormat = jsonFormat2(CKANGroup.apply)
  implicit val orgFormat = jsonFormat8(CKANOrganization.apply)
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
        organization = convertOption[CKANOrganization]("organization"),
        license_title = convertOption[String]("license_title"),
        metadata_created = jsObject.getFields("metadata_created").head.convertTo[String],
        metadata_modified = jsObject.getFields("metadata_modified").head.convertTo[String],
        contact_point = convertOption[String]("contact_point"),
        temporal_coverage_from = convertOption[String]("temporal_coverage_from"),
        temporal_coverage_to = convertOption[String]("temporal_coverage_to"),
        update_freq = convertOption[String]("update_freq"),
        spatial = convertOption[String]("spatial"),
        spatial_coverage = convertOption[String]("spatial_coverage"),
        language = convertOption[String]("language")
      )
    }
  }

  implicit val searchResultFormat = jsonFormat2(CKANSearchResult.apply)
  implicit val searchResponseFormat = jsonFormat2(CKANSearchResponse.apply)
}

class CKANExternalInterface(baseUrl: URL, implicit val system: ActorSystem, implicit val executor: ExecutionContext, implicit val materializer: Materializer) extends CKANProtocols with ExternalInterface {
  implicit val logger = Logging(system, getClass)
  implicit def ckanSearchConv(ckanResponse: CKANSearchResponse): SearchResult = {
    val dataSets = ckanResponse.result.results

    val facets = Seq(new Facet(
      name = "Publishers",
      id = "publisher",
      options = dataSets.groupBy(_.publisher)
        .filter(a => a._1.isDefined && a._1.get.name.isDefined)
        .map {
          case (publisher: Some[Agent], dataSets) => new FacetOption(id = publisher.get.name.get, name = publisher.get.name.get, hitCount = dataSets.length)
          case (None, _)                          => ???
        }
        .toSeq
    ))

    SearchResult(hitCount = ckanResponse.result.count, dataSets = dataSets, facets = Some(facets))
  }
  implicit def ckanOrgConv(ckanOrg: CKANOrganization): Agent = new Agent(
    name = ckanOrg.title,
    extraFields = Map(
      "description" -> ckanOrg.description.getOrElse("")

    ).filterNot(tuple => tuple._2 == "")
  )
  implicit def ckanOptionOrgConv(ckanOrg: Option[CKANOrganization]): Option[Agent] = ckanOrg map ckanOrgConv
  implicit def ckanDataSetConv(hit: CKANDataSet): DataSet = DataSet(
    identifier = hit.name,
    catalog = "DGA",
    title = hit.title,
    description = hit.notes,
    issued = Some(Instant.parse(hit.metadata_created + "Z")),
    modified = Some(Instant.parse(hit.metadata_modified + "Z")),
    language = hit.language,
    publisher = hit.organization,
    accrualPeriodicity = hit.update_freq map (new Periodicity(_)),
    spatial = hit.spatial_coverage map (name => new Location(name = Some(name))),
    temporal = {
      if (hit.temporal_coverage_from.isEmpty && hit.temporal_coverage_to.isEmpty) None
      else Some(new PeriodOfTime(
        start = hit.temporal_coverage_from.map(text => new ApiInstant(text = Some(text))),
        end = hit.temporal_coverage_to.map(text => new ApiInstant(text = Some(text)))
      ))
    },
    theme = List(), // ???
    keyword = hit.tags match {
      case Some(tags) => tags.map(_.display_name)
      case None       => List()
    },
    contactPoint = {
      val email = if (hit.contact_point.isDefined) hit.contact_point else hit.author_email
      email.map(email => new Agent(email = Some(email), name = hit.author))
    },
    landingPage = Some("https://data.gov.au/dataset/" + hit.name) // FIXME!!!
  )
  implicit def ckanDataSetListConv(l: List[CKANDataSet]): List[DataSet] = l map ckanDataSetConv

  lazy val ckanApiConnectionFlow: Flow[HttpRequest, HttpResponse, Any] =
    Http().outgoingConnection(baseUrl.getHost, getPort)

  def getPort = if (baseUrl.getPort == -1) 80 else baseUrl.getPort

  def ckanRequest(request: HttpRequest): Future[HttpResponse] = Source.single(request).via(ckanApiConnectionFlow).runWith(Sink.head)

  def search(query: String): Future[Either[String, SearchResult]] = {
    val encodedQuery = java.net.URLEncoder.encode(query, "UTF-8")
    val path = baseUrl.getPath
    ckanRequest(RequestBuilding.Get(s"${path}action/package_search?rows=500&q=$encodedQuery")).flatMap { response =>
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

  def getDataSets(start: Long, number: Int): scala.concurrent.Future[List[DataSet]] = ckanRequest(RequestBuilding.Get(s"${baseUrl.getPath}action/package_search?start=$start&rows=$number")).flatMap { response =>
    response.status match {
      case OK => Unmarshal(response.entity).to[CKANSearchResponse].map(_.result.results)
      case _ => Unmarshal(response.entity).to[String].flatMap { entity =>
        val error = s"CKAN request failed with status code ${response.status} and entity $entity"
        logger.error(error)
        Future.failed(new IOException(error))
      }
    }
  }

  def getTotalDataSetCount(): scala.concurrent.Future[Long] = ckanRequest(RequestBuilding.Get(s"${baseUrl.getPath}action/package_search?rows=0")).flatMap { response =>
    response.status match {
      case OK => Unmarshal(response.entity).to[CKANSearchResponse].map(_.result.count)
      case _ => Unmarshal(response.entity).to[String].flatMap { entity =>
        val error = s"CKAN request failed with status code ${response.status} and entity $entity"
        logger.error(error)
        Future.failed(new IOException(error))
      }
    }
  }
}