package au.csiro.data61.magda.search.elasticsearch

import scala.concurrent.Future
import scala.math.BigDecimal.double2bigDecimal

import org.locationtech.spatial4j.context.jts.JtsSpatialContext

import com.monsanto.labs.mwundo.GeoJson
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.IndexAndTypes.apply
import com.sksamuel.elastic4s.TcpClient
import com.sksamuel.elastic4s.indexes.CreateIndexDefinition
import com.sksamuel.elastic4s.indexes.IndexContentBuilder
import com.sksamuel.elastic4s.mappings.FieldType._
import com.sksamuel.elastic4s.analyzers.{ CustomAnalyzerDefinition, LowercaseTokenFilter, KeywordTokenizer, StandardTokenizer }
import com.typesafe.config.Config
import com.vividsolutions.jts.geom.Geometry
import com.vividsolutions.jts.geom.GeometryFactory
import com.vividsolutions.jts.geom.LinearRing
import com.vividsolutions.jts.geom.MultiPolygon
import com.vividsolutions.jts.geom.Polygon
import com.vividsolutions.jts.simplify.TopologyPreservingSimplifier

import akka.actor.ActorSystem
import akka.stream.Materializer
import akka.stream.scaladsl.Sink
import au.csiro.data61.magda.model.misc.BoundingBox
import au.csiro.data61.magda.model.misc.Format
import au.csiro.data61.magda.model.misc.Publisher
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import au.csiro.data61.magda.spatial.RegionLoader
import au.csiro.data61.magda.spatial.RegionSource.generateRegionId
import au.csiro.data61.magda.spatial.RegionSources
import au.csiro.data61.magda.util.MwundoJTSConversions._
import spray.json._
import org.elasticsearch.common.xcontent.XContentBuilder
import com.sksamuel.elastic4s.analyzers.Analyzer
import com.sksamuel.elastic4s.mappings.FieldDefinition

case class IndexDefinition(
    name: String,
    version: Int,
    indicesIndex: Indices.Index,
    definition: (Indices, Config) => CreateIndexDefinition,
    create: Option[(TcpClient, Indices, Config) => (Materializer, ActorSystem) => Future[Any]] = None) {
}

object IndexDefinition extends DefaultJsonProtocol {
  def magdaTextField(name: String, extraFields: FieldDefinition*) = {
    val fields = extraFields ++ Seq(
      textField("english").analyzer("english"))

    textField(name).fields(fields)
  }

  val dataSets: IndexDefinition = new IndexDefinition(
    name = "datasets",
    version = 30,
    indicesIndex = Indices.DataSetsIndex,
    definition = (indices, config) => {
      val baseDefinition = createIndex(indices.getIndex(config, Indices.DataSetsIndex))
        .shards(config.getInt("elasticSearch.shardCount"))
        .replicas(config.getInt("elasticSearch.replicaCount"))
        .mappings(
          mapping(indices.getType(Indices.DataSetsIndexType)).fields(
            objectField("temporal").fields(
              objectField("start").fields(
                dateField("date"),
                textField("text")),
              objectField("end").fields(
                dateField("date"),
                textField("text"))),
            objectField("publisher").fields(
              keywordField("identifier"),
              magdaTextField("name",
                keywordField("keyword"),
                textField("keyword_lowercase").analyzer("quote"))),
            nestedField("distributions").fields(
              keywordField("identifier"),
              magdaTextField("title"),
              magdaTextField("description"),
              magdaTextField("format",
                keywordField("keyword"),
                textField("keyword_lowercase").analyzer("quote").fielddata(true))),
            objectField("spatial").fields(
              geoshapeField("geoJson")),
            magdaTextField("title"),
            magdaTextField("description"),
            magdaTextField("keywords"),
            magdaTextField("themes"),
            doubleField("quality"),
            keywordField("catalog"),
            keywordField("years"),
            dateField("indexed"),
            textField("english").analyzer("english")),
          mapping(indices.getType(indices.typeForFacet(Format))).fields(
            magdaTextField("value"),
            textField("english").analyzer("english")),
          mapping(indices.getType(indices.typeForFacet(Publisher))).fields(
            keywordField("identifier"),
            magdaTextField("value"),
            textField("english").analyzer("english")))
        .analysis(
          CustomAnalyzerDefinition(
            "quote",
            KeywordTokenizer,
            LowercaseTokenFilter))

      if (config.hasPath("indexer.refreshInterval")) {
        baseDefinition.indexSetting("refresh_interval", config.getString("indexer.refreshInterval"))
      } else {
        baseDefinition
      }
    })

  val REGION_LANGUAGE_FIELDS = Seq("regionName")
  val regions: IndexDefinition =
    new IndexDefinition(
      name = "regions",
      version = 17,
      indicesIndex = Indices.RegionsIndex,
      definition = (indices, config) =>
        create.index(indices.getIndex(config, Indices.RegionsIndex))
          .shards(config.getInt("elasticSearch.shardCount"))
          .replicas(config.getInt("elasticSearch.replicaCount"))
          .mappings(
            mapping(indices.getType(Indices.RegionsIndexType)).fields(
              field("regionType", KeywordType),
              field("regionId", KeywordType),
              magdaTextField("regionName"),
              field("boundingBox", GeoShapeType),
              field("geometry", GeoShapeType),
              field("order", IntegerType)))
          .analysis(
            CustomAnalyzerDefinition(
              "quote",
              KeywordTokenizer,
              LowercaseTokenFilter)),
      create = Some((client, indices, config) => (materializer, actorSystem) => setupRegions(client, indices)(config, materializer, actorSystem)))

  val indices = Seq(dataSets, regions)

  def setupRegions(client: TcpClient, indices: Indices)(implicit config: Config, materializer: Materializer, system: ActorSystem): Future[Any] = {
    val regionSourceConfig = config.getConfig("regionSources")
    val regionSources = new RegionSources(regionSourceConfig)

    val loader = RegionLoader(regionSources.sources.toList)

    setupRegions(client, loader, indices)
  }

  implicit val geometryFactory = JtsSpatialContext.GEO.getShapeFactory.getGeometryFactory

  def setupRegions(client: TcpClient, loader: RegionLoader, indices: Indices)(implicit config: Config, materializer: Materializer, system: ActorSystem): Future[Any] = {
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
            case (jsGeometry: JsObject) =>
              val geometry = jsGeometry.convertTo[GeoJson.Geometry]
              val jtsGeo = GeometryConverter.toJTSGeo(geometry, geometryFactory)

              val shortestSide = {
                val env = jtsGeo.getEnvelopeInternal
                Math.min(env.getWidth, env.getHeight)
              }
              val simplified = TopologyPreservingSimplifier.simplify(jtsGeo, shortestSide / 100)

              def removeInvalidHoles(polygon: Polygon): Polygon = {
                val holes = for { i <- 0 to polygon.getNumInteriorRing - 1 } yield polygon.getInteriorRingN(i).asInstanceOf[LinearRing]
                val filteredHoles = holes.filter(_.within(simplified))
                new Polygon(polygon.getExteriorRing.asInstanceOf[LinearRing], filteredHoles.toArray, geometryFactory)
              }

              // Remove holes that intersect the edge of the shape - TODO: Can we do something clever like use an intersection to trim the hole?
              val simplifiedFixed: Geometry = simplified.getGeometryType match {
                case "Polygon" =>
                  val x = simplified.asInstanceOf[Polygon]
                  removeInvalidHoles(x)
                case "MultiPolygon" =>
                  val x = simplified.asInstanceOf[MultiPolygon]
                  val geometries = for { i <- 0 to x.getNumGeometries - 1 } yield removeInvalidHoles(x.getGeometryN(i).asInstanceOf[Polygon])
                  new MultiPolygon(geometries.toArray, geometryFactory)
                case _ => simplified
              }

              Some(GeometryConverter.fromJTSGeo(simplifiedFixed))
            case _ => None
          }

          geometryOpt.map(geometry =>
            ElasticDsl.index
              .into(indices.getIndex(config, Indices.RegionsIndex) / indices.getType(Indices.RegionsIndexType))
              .id(generateRegionId(regionSource.name, id))
              .source(JsObject(
                "regionType" -> JsString(regionSource.name),
                "regionId" -> JsString(id),
                "regionName" -> name,
                "boundingBox" -> createEnvelope(geometry).toJson(EsBoundingBoxFormat),
                "geometry" -> geometry.toJson,
                "order" -> JsNumber(regionSource.order)).toJson))

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
        result.failures.foreach(failure =>
          logger.error("Failure: {}", failure.failureMessage))

        result.successes.length
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