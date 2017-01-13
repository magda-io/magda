package au.csiro.data61.magda.search.elasticsearch

import akka.actor.ActorSystem
import akka.stream.Materializer
import akka.stream.scaladsl.Sink
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.model.misc.{ Format, Publisher }
import au.csiro.data61.magda.spatial.RegionSource.generateRegionId
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.analyzers.{ CustomAnalyzerDefinition, KeywordTokenizer, LowercaseTokenFilter }
import com.sksamuel.elastic4s.mappings.FieldType.{ GeoShapeType, StringType }
import com.sksamuel.elastic4s.{ CreateIndexDefinition, ElasticClient, ElasticDsl }
import spray.json._

import scala.concurrent.Future
import au.csiro.data61.magda.spatial.RegionSource
import com.typesafe.config.Config
import au.csiro.data61.magda.spatial.RegionSources

case class IndexDefinition(
    name: String,
    version: Int,
    definition: (Option[String]) => CreateIndexDefinition,
    create: Option[(ElasticClientTrait, Config, Materializer, ActorSystem) => Future[Any]] = None) {
  def indexName: String = this.name + this.version
}

object IndexDefinition extends DefaultJsonProtocol {
  val DATASETS_TYPE_NAME = "datasets"
  val REGIONS_TYPE_NAME = "regions"
  
  val datasets: IndexDefinition = new IndexDefinition(
    name = "datasets",
    version = 14,
    definition = (overrideIndexName) =>
      create.index(overrideIndexName.getOrElse(datasets.indexName))
        .indexSetting("recovery.initial_shards", 1)
        .indexSetting("requests.cache.enable", true)
        .mappings(
          mapping(DATASETS_TYPE_NAME).fields(
            field("temporal").inner(
              field("start").inner(
                field("text").typed(StringType)
              ),
              field("end").inner(
                field("text").typed(StringType)
              )
            ),
            field("publisher").inner(
              field("name").typed(StringType).analyzer("english").fields(
                field("untouched").typed(StringType).index("not_analyzed")
              )
            ),
            field("distributions").nested(
              field("title").typed(StringType).analyzer("english"),
              field("description").typed(StringType).analyzer("english"),
              field("format").typed(StringType).fields(
                field("untokenized").typed(StringType).analyzer("untokenized")
              )
            ),
            field("spatial").inner(
              field("geoJson").typed(GeoShapeType)
            ),
            field("title").typed(StringType).analyzer("english"),
            field("description").typed(StringType).analyzer("english"),
            field("keyword").typed(StringType).analyzer("english"),
            field("theme").typed(StringType).analyzer("english"),
            field("years").typed(StringType).analyzer("untokenized")
          ),
          mapping(Format.id),
          mapping(Publisher.id)
        ).analysis(CustomAnalyzerDefinition("untokenized", KeywordTokenizer, LowercaseTokenFilter))
  )

  val regions: IndexDefinition =
    new IndexDefinition(
      name = "regions",
      version = 13,
      definition = (overrideIndexName) =>
        create.index(overrideIndexName.getOrElse(regions.indexName))
          .indexSetting("recovery.initial_shards", 1)
          .mappings(
            mapping(REGIONS_TYPE_NAME).fields(
              field("type").typed(StringType),
              field("id").typed(StringType),
              field("name").typed(StringType),
              field("rectangle").typed(GeoShapeType),
              field("geometry").typed(GeoShapeType)
            )
          ),
      create = Some((client, config, materializer, actorSystem) => setupRegions(client)(config, materializer, actorSystem))
    )

  val indices = Seq(datasets, regions)

  def setupRegions(client: ElasticClientTrait)(implicit config: Config, materializer: Materializer, system: ActorSystem): Future[Any] = {
    val logger = system.log
    val regionSourceConfig = config.getConfig("regionSources")
    val regionSources = new RegionSources(regionSourceConfig)

    val loader = new RegionLoader(regionSources.sources.toList)
    implicit val ec = system.dispatcher

    loader.setupRegions
      .map {
        case (regionSource, jsonRegion) =>
          val properties = jsonRegion.fields("properties").asJsObject
          val name = if (regionSource.includeIdInName) {
            JsString(properties.fields(regionSource.nameProperty).convertTo[String] + " - " + properties.fields(regionSource.idProperty).convertTo[String])
          } else {
            properties.fields(regionSource.nameProperty)
          }

          ElasticDsl.index
            .into(IndexDefinition.regions.indexName / IndexDefinition.regions.name)
            .id(generateRegionId(regionSource.name, jsonRegion.getFields("properties").head.asJsObject.fields(regionSource.idProperty).convertTo[String]))
            .source(JsObject(
              "type" -> JsString(regionSource.name),
              "id" -> properties.fields(regionSource.idProperty),
              "name" -> name,
              "rectangle" -> createEnvelope(jsonRegion.fields("geometry")),
              "geometry" -> jsonRegion.fields("geometry"),
              "order" -> JsNumber(regionSource.order)
            ).toJson)
      }
      // This creates a buffer of regionBufferMb (roughly) of indexed regions that will be bulk-indexed in the next ES request
      .batchWeighted(config.getLong("regionLoading.regionBufferMb") * 1000000, defin => defin.build.source().length(), Seq(_))(_ :+ _)
      // This ensures that only one indexing request is executed at a time - while the index request is in flight, the entire stream backpressures
      // right up to reading from the file, so that new bytes will only be read from the file, parsed, turned into IndexDefinitions etc if ES is
      // available to index them right away
      .mapAsync(1) { values =>
        logger.debug("Indexing {} regions", values.length)
        client.execute(bulk(values))
      }
      .map { result =>
        if (result.hasFailures) {
          logger.error("Failure: {}", result.failureMessage)
        }

        result.items.length
      }
      .recover {
        case e: Throwable =>
          logger.error(e, "Encountered error while indexing regions")
          throw e
      }
      .runWith(Sink.reduce((oldLength: Int, latestValuesLength: Int) => oldLength + latestValuesLength))
      .map { count => logger.info("Successfully indexed {} regions", count) }
  }

  def createEnvelope(geometry: JsValue): JsValue = geometry match {
    case JsObject(fields) => {
      var west = 180.0
      var east = -180.0
      var south = 90.0
      var north = -90.0

      val adjustEnvelopeWithLinearRing = (linearRing: Vector[JsValue]) => linearRing.foreach {
        case JsArray(positions) => {
          val longitude = positions(0).convertTo[Double]
          val latitude = positions(1).convertTo[Double]
          west = Math.min(west, longitude)
          east = Math.max(east, longitude)
          south = Math.min(south, latitude)
          north = Math.max(north, latitude)
        }
        case _ => Unit
      }

      val adjustEnvelopeWithPolygon = (linearRings: Vector[JsValue]) => linearRings.foreach {
        case JsArray(linearRing) => adjustEnvelopeWithLinearRing(linearRing)
        case _                   => Unit
      }

      if (fields("type").convertTo[String] == "Polygon") {
        fields.foreach {
          case ("coordinates", JsArray(linearRings)) => adjustEnvelopeWithPolygon(linearRings)
          case (others, value)                       => Unit
        }
      } else if (fields("type").convertTo[String] == "MultiPolygon") {
        fields.foreach {
          case ("coordinates", JsArray(polygons)) => polygons.foreach {
            case JsArray(linearRings) => adjustEnvelopeWithPolygon(linearRings)
            case _                    => Unit
          }
          case (others, value) => Unit
        }
      }

      if (west == 180.0 && south == 90.0 && east == -180.0 && north == 90.0) JsNull
      else JsObject(
        "type" -> JsString("envelope"),
        "coordinates" -> JsArray(
          JsArray(JsNumber(west), JsNumber(north)),
          JsArray(JsNumber(east), JsNumber(south))
        )
      )
    }
    case _ => JsNull
  }
}
