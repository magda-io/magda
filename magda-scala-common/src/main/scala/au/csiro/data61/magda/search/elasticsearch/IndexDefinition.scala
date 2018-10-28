package au.csiro.data61.magda.search.elasticsearch

import scala.concurrent.Future
import scala.math.BigDecimal.double2bigDecimal
import org.locationtech.spatial4j.context.jts.JtsSpatialContext
import com.monsanto.labs.mwundo.GeoJson
import com.sksamuel.elastic4s.http.bulk.BulkResponse
import com.sksamuel.elastic4s.mappings.{Analysis, Nulls, TextFieldDefinition}
import com.sksamuel.elastic4s.http.ElasticDsl._
import com.sksamuel.elastic4s.http.{ RequestFailure, RequestSuccess }
import com.sksamuel.elastic4s.IndexAndTypes.apply
import com.sksamuel.elastic4s.http.HttpClient
import com.sksamuel.elastic4s.indexes.CreateIndexDefinition
import com.sksamuel.elastic4s.indexes.IndexContentBuilder
import com.sksamuel.elastic4s.mappings.FieldType._
import com.sksamuel.elastic4s.analyzers.{
  CustomAnalyzerDefinition,
  StopTokenFilter,
  LowercaseTokenFilter,
  KeywordTokenizer,
  StandardTokenizer,
  UppercaseTokenFilter,
  StemmerTokenFilter,
  NamedStopTokenFilter,
  Tokenizer,
  TokenFilterDefinition,
  WhitespaceTokenizer
}
import com.sksamuel.elastic4s.analyzers.{
  SynonymTokenFilter,
  SynonymGraphTokenFilter
}
import com.typesafe.config.Config
import org.locationtech.jts.geom.Geometry
import org.locationtech.jts.geom.GeometryFactory
import org.locationtech.jts.geom.LinearRing
import org.locationtech.jts.geom.MultiPolygon
import org.locationtech.jts.geom.Polygon
import org.locationtech.jts.simplify.TopologyPreservingSimplifier

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
import com.sksamuel.elastic4s.mappings.FieldDefinition
import scala.collection.JavaConverters._

case class IndexDefinition(
    name: String,
    version: Int,
    indicesIndex: Indices.Index,
    definition: (Indices, Config) => CreateIndexDefinition,
    create: Option[(HttpClient, Indices, Config) => (Materializer, ActorSystem) => Future[Any]] = None) {
}

object IndexDefinition extends DefaultJsonProtocol {

  def magdaTextField(name: String, extraFields: FieldDefinition*) = {
    val fields = extraFields ++ Seq(keywordField("keyword"), textField("quote").analyzer("quote"))

    textField(name).analyzer("english").fields(fields)
  }

  def magdaSynonymTextField(name: String, extraFields: FieldDefinition*) = {
    val fields = extraFields ++ Seq(keywordField("keyword"), textField("quote").analyzer("quote_partial_match"))

    textField(name)
        .analyzer("english_with_synonym")
        .searchAnalyzer("english_without_synonym_for_search")
        .fields(fields)
  }

  val MagdaSynonymTokenFilter = SynonymTokenFilter(
    "synonym",
    Some("analysis/wn_s.pl"),
    Set.empty,
    None,
    Some("wordnet")
  )

  val dataSets: IndexDefinition = new IndexDefinition(
    name = "datasets",
    version = 37,
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
              textField("acronym").analyzer("keyword").searchAnalyzer("uppercase"),
              magdaTextField("description"),
              keywordField("imageUrl"),
              keywordField("phone"),
              keywordField("email"),
              magdaTextField("addrStreet", keywordField("keyword")),
              magdaTextField("addrSuburb", keywordField("keyword")),
              magdaTextField("addrState", keywordField("keyword")),
              keywordField("addrPostCode"),
              keywordField("addrCountry"),
              keywordField("website"),
              magdaTextField("name",
                keywordField("keyword"),
                textField("keyword_lowercase").analyzer("quote").fielddata(true))),
            nestedField("distributions").fields(
              keywordField("identifier"),
              magdaTextField("title"),
              magdaSynonymTextField("description"),
              magdaTextField("format",
                textField("keyword_lowercase").analyzer("quote").fielddata(true))),
            objectField("spatial").fields(
              geoshapeField("geoJson")),
            magdaTextField("title"),
            magdaSynonymTextField("description"),
            magdaTextField("keywords"),
            magdaSynonymTextField("themes"),
            doubleField("quality"),
            booleanField("hasQuality"),
            keywordField("catalog"),
            keywordField("years"),
            /*
            * not sure whether is Elasticsearch or elastic4s
            * Any field without mapping will be created as Text type --- which will create no `fielddata` error for aggregation
            * */
            keywordField("identifier"),
            objectField("contactPoint").fields(
              keywordField("identifier")),
            dateField("indexed"))
        )
        .analysis(
          CustomAnalyzerDefinition(
            "quote",
            KeywordTokenizer,
            LowercaseTokenFilter
          ),
          /*
            allow quoted query string match a portion of the field content rather than whole field
            the exact form of whole quoted query string still have to be matched exactly in field content
          */
          CustomAnalyzerDefinition(
            "quote_partial_match",
            StandardTokenizer,
            LowercaseTokenFilter
          ),
          CustomAnalyzerDefinition(
            "uppercase",
            KeywordTokenizer,
            UppercaseTokenFilter
          ),
          /* Customised from new english analyzer as per:
             https://www.elastic.co/guide/en/elasticsearch/reference/current/analysis-lang-analyzer.html#english-analyzer
             In order to apply synonym filter
           */
          CustomAnalyzerDefinition(
            "english_with_synonym",
            StandardTokenizer,
            List(
              LowercaseTokenFilter,
              StemmerTokenFilter("english_possessive_stemmer", "possessive_english"),
              StemmerTokenFilter("light_english_stemmer", "light_english"),
              //Es 6.x doesn't allow `stop` before Synonym
              //StopTokenFilter("english_stop", Some(NamedStopTokenFilter.English)),
              MagdaSynonymTokenFilter,
              StemmerTokenFilter("english_possessive_stemmer", "possessive_english"),
              StopTokenFilter("english_stop", Some(NamedStopTokenFilter.English))
            )
          ),
          CustomAnalyzerDefinition(
            "english_without_synonym_for_search",
            StandardTokenizer,
            List(
              LowercaseTokenFilter,
              StemmerTokenFilter("english_possessive_stemmer", "possessive_english"),
              StemmerTokenFilter("light_english_stemmer", "light_english"),
              StopTokenFilter("english_stop", Some(NamedStopTokenFilter.English))
            )
          )
        )

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
      version = 21,
      indicesIndex = Indices.RegionsIndex,
      definition = (indices, config) =>
        createIndex(indices.getIndex(config, Indices.RegionsIndex))
          .shards(config.getInt("elasticSearch.shardCount"))
          .replicas(config.getInt("elasticSearch.replicaCount"))
          .mappings(
            mapping(indices.getType(Indices.RegionsIndexType)).fields(
              keywordField("regionType"),
              keywordField("regionId"),
              magdaTextField("regionName"),
              magdaTextField("regionShortName"),
              geoshapeField("boundingBox"),
              geoshapeField("geometry"),
              intField("order")
            )
          )
          .analysis(
            CustomAnalyzerDefinition(
              "quote",
              KeywordTokenizer,
              LowercaseTokenFilter)),
      create = Some((client, indices, config) => (materializer, actorSystem) => setupRegions(client, indices)(config, materializer, actorSystem)))


  val publishers: IndexDefinition =
    new IndexDefinition(
      name = "publishers",
      version = 2,
      indicesIndex = Indices.PublishersIndex,
      definition = (indices, config) =>
        createIndex(indices.getIndex(config, Indices.PublishersIndex))
          .shards(config.getInt("elasticSearch.shardCount"))
          .replicas(config.getInt("elasticSearch.replicaCount"))
          .mappings(
            mapping(indices.getType(Indices.PublisherIndexType)).fields(
              keywordField("identifier"),
              textField("acronym").analyzer("keyword").searchAnalyzer("uppercase"),
              magdaTextField("value"),
              magdaTextField("description"),
              keywordField("imageUrl"),
              keywordField("phone"),
              keywordField("email"),
              magdaTextField("addrStreet", keywordField("keyword")),
              magdaTextField("addrSuburb", keywordField("keyword")),
              magdaTextField("addrState", keywordField("keyword")),
              keywordField("addrPostCode"),
              keywordField("addrCountry"),
              keywordField("website"),
              dateField("indexed")
            ))
          .analysis(
            CustomAnalyzerDefinition(
              "quote",
              KeywordTokenizer,
              LowercaseTokenFilter),
            CustomAnalyzerDefinition(
              "uppercase",
              KeywordTokenizer,
              UppercaseTokenFilter
            )
          )
    )

  val formats: IndexDefinition =
    new IndexDefinition(
      name = "formats",
      version = 1,
      indicesIndex = Indices.FormatsIndex,
      definition = (indices, config) =>
        createIndex(indices.getIndex(config, Indices.FormatsIndex))
          .shards(config.getInt("elasticSearch.shardCount"))
          .replicas(config.getInt("elasticSearch.replicaCount"))
          .mappings(
            mapping(indices.getType(Indices.FormatsIndexType)).fields(
              magdaTextField("value"),
              dateField("indexed")
            ))
          .analysis(
            CustomAnalyzerDefinition(
              "quote",
              KeywordTokenizer,
              LowercaseTokenFilter)
          )
    )

  val indices = Seq(dataSets, regions, publishers, formats)

  def setupRegions(client: HttpClient, indices: Indices)(implicit config: Config, materializer: Materializer, system: ActorSystem): Future[Any] = {
    val regionSourceConfig = config.getConfig("regionSources")
    val regionSources = new RegionSources(regionSourceConfig)

    val loader = RegionLoader(regionSources.sources.toList)

    setupRegions(client, loader, indices)
  }

  implicit val geometryFactory = JtsSpatialContext.GEO.getShapeFactory.getGeometryFactory

  def setupRegions(client: HttpClient, loader: RegionLoader, indices: Indices)(implicit config: Config, materializer: Materializer, system: ActorSystem): Future[Any] = {
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
          val shortName = regionSource.shortNameProperty.map(shortNameProp => properties.fields(shortNameProp).convertTo[String])

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
            indexInto(indices.getIndex(config, Indices.RegionsIndex) / indices.getType(Indices.RegionsIndexType))
              .id(generateRegionId(regionSource.name, id))
              .source(JsObject(
                "regionType" -> JsString(regionSource.name),
                "regionId" -> JsString(id),
                "regionName" -> name,
                "regionShortName" -> shortName.map(JsString(_)).getOrElse(JsNull),
                "boundingBox" -> createEnvelope(geometry).toJson(EsBoundingBoxFormat),
                "geometry" -> geometry.toJson,
                "order" -> JsNumber(regionSource.order)).toJson))

      }
      .filter(_.isDefined).map(_.get)
      // Limit to max 2000 region to bulk index
      // ES recommended 1000 ~ 5000 actions in one bulk request and previous buffer could lead to over 6K actions in one request
      .batch(1000, Seq(_))(_ :+ _)
      // This ensures that only one indexing request is executed at a time - while the index request is in flight, the entire stream backpressures
      // right up to reading from the file, so that new bytes will only be read from the file, parsed, turned into IndexDefinitions etc if ES is
      // available to index them right away
      .mapAsync(1) { values =>
        logger.info("Indexing {} regions", values.length)
        client.execute(bulk(values))
      }
      .map { result =>
        result match {
          case Left(failure) => logger.error("Failure: {}", failure.error)
          case Right(results) =>
            logger.debug("Took {} seconds to execute request.", results.result.took)
            results.result.items.length
        }
      }
      .recover {
        case e: Throwable =>
          logger.error(e, "Encountered error while indexing regions")
          throw e
      }
      .runWith(Sink.reduce((oldLength: AnyVal, latestValuesLength: AnyVal) => oldLength.asInstanceOf[Int] + latestValuesLength.asInstanceOf[Int]))
      .map { count => logger.info("Successfully indexed {} regions", count) }
  }

  val geoFactory = new GeometryFactory()
  def createEnvelope(geometry: GeoJson.Geometry): BoundingBox = {
    val indexedEnvelope = GeometryConverter.toJTSGeo(geometry, geoFactory).getEnvelopeInternal

    BoundingBox(indexedEnvelope.getMaxY, indexedEnvelope.getMinX, indexedEnvelope.getMinY, indexedEnvelope.getMaxX)
  }
}
