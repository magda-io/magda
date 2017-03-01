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
import com.sksamuel.elastic4s.mappings.FieldType._
import com.sksamuel.elastic4s.{ TcpClient, ElasticDsl }
import com.sksamuel.elastic4s.indexes.CreateIndexDefinition
import spray.json._

import scala.concurrent.Future
import au.csiro.data61.magda.spatial.RegionSource
import com.typesafe.config.Config
import au.csiro.data61.magda.spatial.RegionSources
import com.sksamuel.elastic4s.indexes.IndexContentBuilder
import com.sksamuel.elastic4s.mappings.PrefixTree
import com.monsanto.labs.mwundo.GeoJson
import au.csiro.data61.magda.model.misc.BoundingBox
import com.vividsolutions.jts.geom.GeometryFactory
import au.csiro.data61.magda.util.MwundoJTSConversions._
import com.vividsolutions.jts.simplify.TopologyPreservingSimplifier
import com.vividsolutions.jts.geom.Polygon
import com.vividsolutions.jts.geom.MultiPolygon
import au.csiro.data61.magda.search.elasticsearch.RegionLoader
import com.vividsolutions.jts.geom.LinearRing

case class IndexDefinition(
    name: String,
    version: Int,
    definition: (Option[String]) => CreateIndexDefinition,
    create: Option[(TcpClient, Config, Materializer, ActorSystem) => Future[Any]] = None) {
  def indexName: String = this.name + this.version
}

object IndexDefinition extends DefaultJsonProtocol {
  val DATASETS_TYPE_NAME = "datasets"
  val REGIONS_TYPE_NAME = "regions"

  val dataSets: IndexDefinition = new IndexDefinition(
    name = "datasets",
    version = 17,
    definition = (overrideIndexName) =>
      create.index(overrideIndexName.getOrElse(dataSets.indexName))
        .indexSetting("recovery.initial_shards", 1)
        .indexSetting("requests.cache.enable", true)
        .mappings(
          mapping(DATASETS_TYPE_NAME).fields(
            field("temporal").inner(
              field("start").inner(
                field("text", TextType)
              ),
              field("end").inner(
                field("text").typed(TextType)
              )
            ),
            field("publisher").inner(
              field("name").typed(TextType).analyzer("english").fields(
                field("untouched").typed(KeywordType).index("not_analyzed")
              )
            ),
            field("distributions").nested(
              field("title").typed(TextType).analyzer("english"),
              field("description").typed(TextType).analyzer("english"),
              field("format").typed(TextType).fields(
                field("untokenized").typed(KeywordType)
              )
            ),
            field("spatial").inner(
              field("geoJson").typed(GeoShapeType)
            ),
            field("title").typed(TextType).analyzer("english"),
            field("description").typed(TextType).analyzer("english"),
            field("keyword").typed(TextType).analyzer("english"),
            field("theme").typed(TextType).analyzer("english"),
            field("years").typed(KeywordType)
          ),
          mapping(Format.id),
          mapping(Publisher.id)
        ).analysis(CustomAnalyzerDefinition("untokenized", KeywordTokenizer, LowercaseTokenFilter))
  )

  val regions: IndexDefinition =
    new IndexDefinition(
      name = "regions",
      version = 15,
      definition = (overrideIndexName) =>
        create.index(overrideIndexName.getOrElse(regions.indexName))
          .indexSetting("recovery.initial_shards", 1)
          .mappings(
            mapping(REGIONS_TYPE_NAME).fields(
              field("regionType").typed(StringType),
              field("regionId").typed(StringType),
              field("regionName").typed(StringType),
              field("boundingBox").typed(GeoShapeType),
              field("geometry").typed(GeoShapeType),
              field("order").typed(IntegerType)
            )
          ),
      create = Some((client, config, materializer, actorSystem) => setupRegions(client)(config, materializer, actorSystem))
    )

  val indices = Seq(dataSets, regions)

  def setupRegions(client: TcpClient)(implicit config: Config, materializer: Materializer, system: ActorSystem): Future[Any] = {
    val regionSourceConfig = config.getConfig("regionSources")
    val regionSources = new RegionSources(regionSourceConfig)

    val loader = RegionLoader(regionSources.sources.toList)

    setupRegions(client, loader)
  }

  implicit val geometryFactory = new GeometryFactory()

  def setupRegions(client: TcpClient, loader: RegionLoader)(implicit config: Config, materializer: Materializer, system: ActorSystem): Future[Any] = {
    implicit val ec = system.dispatcher
    val logger = system.log
    loader.setupRegions
      .map {
        case (regionSource, jsonRegion) =>
          val properties = jsonRegion.fields("properties").asJsObject
          val id = properties.fields(regionSource.idProperty).convertTo[String]
          val name = if (regionSource.includeIdInName) {
            JsString(properties.fields(regionSource.nameProperty).convertTo[String] + " - " + id)
          } else {
            properties.fields(regionSource.nameProperty)
          }

          val geometryOpt = jsonRegion.fields("geometry") match {
            case JsNull => None
            case jsGeometry =>
              val geometry = jsGeometry.convertTo[GeoJson.Geometry]
              //              val jtsGeo = GeometryConverter.toJTSGeo(geometry, geometryFactory)
              //
              //              geometry match {
              //                case GeoJson.Polygon(inner) => println("Holes: " + inner.drop(1))
              //                case _                      => //println("Not polygon: " + geometry)
              //              }
              //
              //              val simplified = TopologyPreservingSimplifier.simplify(jtsGeo, 1)
              //              println("Before: " + jtsGeo.getCoordinates.length + " After: " + simplified.getCoordinates.length)
              //
              //              def makePolygonValid(polygon: Polygon): Polygon = {
              //                val holes = for { i <- 0 to polygon.getNumInteriorRing - 1 } yield polygon.getInteriorRingN(i).asInstanceOf[LinearRing]
              //                val filteredHoles = holes.filter(_.coveredBy(simplified))
              //                new Polygon(polygon.getExteriorRing.asInstanceOf[LinearRing], filteredHoles.toArray, geometryFactory)
              //              }
              //
              //              val madeValid = simplified match {
              //                case (polygon: Polygon) => makePolygonValid(polygon)
              //                case (multiPolygon: MultiPolygon) =>
              //                  val interiorPolygons = for { i <- 0 to multiPolygon.getNumGeometries - 1 } yield multiPolygon.getGeometryN(i).asInstanceOf[Polygon]
              //                  val validPolygons = interiorPolygons.map(makePolygonValid)
              //                  new MultiPolygon(validPolygons.toArray, geometryFactory)
              //                case x => x
              //              }

              //              val simplifiedValidated = GeoValidator.validate(simplified)

              //              Some(GeometryConverter.fromJTSGeo(simplified))
              Some(geometry)
          }

          geometryOpt.map(geometry =>
            ElasticDsl.index
              .into(IndexDefinition.regions.indexName / REGIONS_TYPE_NAME)
              .id(generateRegionId(regionSource.name, id))
              .source(JsObject(
                "regionType" -> JsString(regionSource.name),
                "regionId" -> JsString(id),
                "regionName" -> name,
                "boundingBox" -> createEnvelope(geometry).toJson,
                "geometry" -> geometry.toJson,
                "order" -> JsNumber(regionSource.order)
              ).toJson))

      }
      .filter(_.isDefined).map(_.get)
      // This creates a buffer of regionBufferMb (roughly) of indexed regions that will be bulk-indexed in the next ES request
      .batchWeighted(config.getLong("regionLoading.regionBufferMb") * 1000000, defin => IndexContentBuilder(defin).string.length, Seq(_))(_ :+ _)
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

  val geoFactory = new GeometryFactory()
  def createEnvelope(geometry: GeoJson.Geometry): BoundingBox = {
    val indexedEnvelope = GeometryConverter.toJTSGeo(geometry, geoFactory).getEnvelopeInternal

    BoundingBox(indexedEnvelope.getMaxY, indexedEnvelope.getMinX, indexedEnvelope.getMinY, indexedEnvelope.getMaxX)
  }
}
