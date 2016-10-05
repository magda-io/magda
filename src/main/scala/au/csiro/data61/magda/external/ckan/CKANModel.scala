package au.csiro.data61.magda.external.ckan

import spray.json.DefaultJsonProtocol
import akka.http.scaladsl.model.MediaTypes
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.marshalling.ToResponseMarshallable
import spray.json._
import au.csiro.data61.magda.model.temporal._
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.model.misc.Distribution
import au.csiro.data61.magda.model.misc.Protocols._
import au.csiro.data61.magda.model._
import java.time.Instant
import java.text.SimpleDateFormat
import akka.http.scaladsl.model.MediaType

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
  cache_last_modified: Option[String],
  url: Option[String],
  webstore_url: Option[String])

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

trait CKANConverters {
  val ckanDateTimeWithMsFormat = new SimpleDateFormat("yyyy-MM-dd'T'hh:mm:ss.SSSSS")
  val ckanDateTimeFormat = new SimpleDateFormat("yyyy-MM-dd'T'hh:mm:ss")

  implicit def ckanOrgConv(ckanOrg: CKANOrganization): Agent = new Agent(
    name = ckanOrg.title,
    extraFields = Map(
      "description" -> ckanOrg.description.getOrElse("")

    ).filterNot(tuple => tuple._2 == "")
  )
  implicit def ckanOptionOrgConv(ckanOrg: Option[CKANOrganization]): Option[Agent] = ckanOrg map ckanOrgConv

  implicit def ckanDataSetConv(hit: CKANDataSet): DataSet = {
    val modified = ckanDateTimeWithMsFormat.parse(hit.metadata_modified).toInstant
    DataSet(
      identifier = hit.name,
      catalog = "DGA",
      title = hit.title,
      description = hit.notes,
      issued = Some(ckanDateTimeWithMsFormat.parse(hit.metadata_created).toInstant),
      modified = Some(modified),
      language = hit.language,
      publisher = hit.organization,
      accrualPeriodicity = hit.update_freq map (Periodicity.fromString(_)),
      spatial = hit.spatial_coverage.map(Location(_)),
      temporal = {
        if (hit.temporal_coverage_from.isEmpty && hit.temporal_coverage_to.isEmpty) None
        else PeriodOfTime.parse(hit.temporal_coverage_from, hit.temporal_coverage_to, modified)
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
      landingPage = Some("https://data.gov.au/dataset/" + hit.name), // FIXME!!!
      distributions = hit.resources.map(_.map(ckanDistributionConv(_, hit)))
    )
  }
  implicit def ckanDataSetListConv(l: List[CKANDataSet]): List[DataSet] = l map ckanDataSetConv

  def ckanDistributionConv(resource: CKANResource, dataset: CKANDataSet): Distribution = {
    // Get the mediatype first because we'll need it to determine the format if none is provided.
    val mediaType = Distribution.parseMediaType(resource.mimetype orElse resource.mimetype_inner, resource.format, resource.url)
    val format = Distribution.parseFormat(resource.format, resource.url, mediaType)

    new Distribution(
      title = resource.name.getOrElse(resource.id),
      description = resource.description,
      issued = resource.created.map(ckanDateTimeFormat.parse(_).toInstant),
      modified = resource.last_modified.map(ckanDateTimeFormat.parse(_).toInstant),
      license = (dataset.license_id, dataset.license_title) match {
        case (None, None)           => None
        case (idOption, nameOption) => Some(new License(idOption.getOrElse(""), nameOption.getOrElse("")))
      },
      rights = None,
      accessURL = resource.webstore_url,
      downloadURL = resource.url,
      byteSize = None,
      mediaType = mediaType orElse (format.flatMap(Distribution.mediaTypeFromFormat(_))),
      format = format
    )
  }
}

trait CKANProtocols extends DefaultJsonProtocol {
  implicit val resourceFormat = jsonFormat16(CKANResource.apply)
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