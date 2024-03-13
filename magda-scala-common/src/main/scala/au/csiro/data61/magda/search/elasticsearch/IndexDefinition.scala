package au.csiro.data61.magda.search.elasticsearch

import akka.actor.ActorSystem
import akka.stream.Materializer
import akka.stream.scaladsl.Sink
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import au.csiro.data61.magda.spatial.RegionSource.generateRegionId
import au.csiro.data61.magda.spatial.{RegionLoader, RegionSource, RegionSources}
import au.csiro.data61.magda.spatial.GeometryUtils.createEnvelope
import au.csiro.data61.magda.util.MwundoJTSConversions._
import com.monsanto.labs.mwundo.GeoJson
import com.sksamuel.elastic4s.analysis._
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.bulk.BulkResponse
import com.sksamuel.elastic4s.{ElasticClient, RequestFailure, RequestSuccess}
import com.sksamuel.elastic4s.requests.indexes.CreateIndexRequest
import com.sksamuel.elastic4s.fields.{ElasticField, GeoShapeField, ObjectField}
import com.typesafe.config.Config
import org.locationtech.jts.geom._
import org.locationtech.jts.simplify.TopologyPreservingSimplifier
import org.locationtech.spatial4j.context.jts.JtsSpatialContext
import spray.json._
import au.csiro.data61.magda.util.RichConfig._

import scala.concurrent.Future

case class IndexDefinition(
    name: String,
    version: Int,
    indicesIndex: Indices.Index,
    definition: (Indices, Config) => CreateIndexRequest,
    create: Option[
      (ElasticClient, Indices, Config) => (
          Materializer,
          ActorSystem
      ) => Future[Any]
    ] = None
) {}

object IndexDefinition extends DefaultJsonProtocol {

  def magdaGeoShapeField(name: String) = {
    GeoShapeField(name).tree("geohash")
  }

  def magdaTextField(name: String, extraFields: ElasticField*) = {
    val fields = extraFields ++ Seq(
      keywordField("keyword"),
      textField("quote").analyzer("quote")
    )

    textField(name).analyzer("english").fields(fields)
  }

  def magdaSynonymTextField(name: String, extraFields: ElasticField*) = {
    val fields = extraFields ++ Seq(
      keywordField("keyword"),
      textField("quote").analyzer("quote_partial_match")
    )

    textField(name)
      .analyzer("english_with_synonym")
      .searchAnalyzer("english_without_synonym_for_search")
      .fields(fields)
  }

  def magdaSynonymLongHtmlTextField(
      name: String,
      extraFields: ElasticField*
  ) = {
    val fields = extraFields ++ Seq(
      textField("quote").analyzer("quote_partial_match")
    )

    textField(name)
      .analyzer("english_with_synonym_strip_html")
      .searchAnalyzer("english_without_synonym_for_search")
      .fields(fields)
  }

  val magdaEdgeNgramFilter =
    EdgeNGramTokenFilter("magda_edge_ngram_filter", 1, 20)

  def magdaAutocompleteField(name: String, extraFields: ElasticField*) = {

    val fields = extraFields ++ Seq(
      keywordField("keyword"),
      textField("quote").analyzer("quote"),
      textField("autoComplete")
        .analyzer("magda_edge_ngram")
        .searchAnalyzer("standard")
    )

    textField(name).analyzer("english").fields(fields)
  }

  val magdaSynonymTokenFilter = SynonymTokenFilter(
    "synonym",
    Some("analysis/wn_s.pl"),
    Set.empty,
    None,
    Some("wordnet")
  )

  val englishPossessiveStemmerFilter = StemmerTokenFilter(
    "english_possessive_stemmer",
    "possessive_english"
  )

  val lightEnglishStemmerFilter = StemmerTokenFilter(
    "light_english_stemmer",
    "light_english"
  )

  val englishStopFilter = StopTokenFilter(
    "english_stop",
    Some(NamedStopTokenFilter.English)
  )

  /* Customised from new english analyzer as per:
   https://www.elastic.co/guide/en/elasticsearch/reference/current/analysis-lang-analyzer.html#english-analyzer
   In order to apply synonym filter
   */
  val englishWithSynonymAnalyzer = CustomAnalyzer(
    "english_with_synonym",
    tokenizer = "standard",
    tokenFilters = List(
      "lowercase",
      englishPossessiveStemmerFilter.name,
      lightEnglishStemmerFilter.name,
      //Es 6.x doesn't allow `stop` before Synonym
      //StopTokenFilter("english_stop", Some(NamedStopTokenFilter.English)),
      magdaSynonymTokenFilter.name,
      englishPossessiveStemmerFilter.name,
      englishStopFilter.name
    )
  )

  val englishWithSynonymStripHtmlAnalyzer = CustomAnalyzer(
    "english_with_synonym_strip_html",
    tokenizer = "standard",
    charFilters = List("html_strip"),
    tokenFilters = List(
      "lowercase",
      englishPossessiveStemmerFilter.name,
      lightEnglishStemmerFilter.name,
      //Es 6.x doesn't allow `stop` before Synonym
      //StopTokenFilter("english_stop", Some(NamedStopTokenFilter.English)),
      magdaSynonymTokenFilter.name,
      englishPossessiveStemmerFilter.name,
      englishStopFilter.name
    )
  )

  val englishWithoutSynonymForSearchAnalyzer = CustomAnalyzer(
    "english_without_synonym_for_search",
    tokenizer = "standard",
    tokenFilters = List(
      "lowercase",
      englishPossessiveStemmerFilter.name,
      lightEnglishStemmerFilter.name,
      englishStopFilter.name
    )
  )

  // this analyzer is created only for indexing purpose
  // do not use as search analyzer
  val magdaEdgeNgramAnalyzer = CustomAnalyzer(
    "magda_edge_ngram",
    tokenizer = "standard",
    tokenFilters = List(
      "lowercase",
      magdaEdgeNgramFilter.name
    )
  )

  def applyIndexConfig(
      config: Config,
      indexReq: CreateIndexRequest,
      processRefreshIntervalSetting: Boolean = false
  ) = {
    var req = indexReq.copy()
    if (processRefreshIntervalSetting) {
      config
        .getOptionalString("indexer.refreshInterval")
        .foreach(v => req = req.indexSetting("refresh_interval", v))
    }
    req
  }

  val dataSets: IndexDefinition = new IndexDefinition(
    name = "datasets",
    version = 51,
    indicesIndex = Indices.DataSetsIndex,
    definition = (indices, config) => {
      val esInstanceSupport =
        config.getBoolean("elasticSearch.esInstanceSupport")
      val createIdxReq =
        createIndex(indices.getIndex(config, Indices.DataSetsIndex))
          .shards(config.getInt("elasticSearch.shardCount"))
          .replicas(config.getInt("elasticSearch.replicaCount"))
          .mapping(
            properties(
              ObjectField(
                "accrualPeriodicity",
                properties = List(magdaTextField("text"))
              ),
              keywordField("accrualPeriodicityRecurrenceRule"),
              ObjectField(
                "temporal",
                properties = List(
                  ObjectField(
                    "start",
                    properties = List(dateField("date"), textField("text"))
                  ),
                  ObjectField(
                    "end",
                    properties = List(dateField("date"), textField("text"))
                  )
                )
              ),
              ObjectField(
                "publisher",
                properties = List(
                  keywordField("identifier"),
                  textField("acronym")
                    .analyzer("keyword")
                    .searchAnalyzer("uppercase"),
                  magdaTextField("jurisdiction"),
                  // --- the field used to merge org records by jurisdiction
                  // --- if jurisdiction is not null, its value is jurisdiction + org name
                  // --- if null, its value is org record identifier (thus, avoid merging)
                  textField("aggregation_keywords").analyzer("keyword"),
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
                  magdaTextField(
                    "name",
                    keywordField("keyword"),
                    textField("keyword_lowercase")
                      .analyzer("quote")
                      .fielddata(true)
                  )
                )
              ),
              nestedField("distributions").fields(
                keywordField("identifier"),
                magdaTextField("title"),
                magdaSynonymLongHtmlTextField("description"),
                magdaTextField(
                  "format",
                  textField("keyword_lowercase")
                    .analyzer("quote")
                    .fielddata(true)
                ),
                ObjectField(
                  "accessControl",
                  properties = List(
                    keywordField("ownerId"),
                    keywordField("orgUnitId"),
                    booleanField("constraintExemption"),
                    keywordField("preAuthorisedPermissionIds")
                  )
                )
              ),
              ObjectField(
                "spatial",
                properties = List(magdaGeoShapeField("geoJson"))
              ),
              magdaTextField("title"),
              magdaSynonymLongHtmlTextField("description"),
              magdaTextField("keywords"),
              magdaSynonymTextField("themes"),
              doubleField("quality"),
              booleanField("hasQuality"),
              keywordField("catalog"),
              ObjectField(
                "source",
                properties = List(
                  keywordField("id"),
                  magdaTextField("name"),
                  keywordField("url"),
                  magdaTextField("originalName"),
                  keywordField("originalUrl"),
                  ObjectField(
                    "extras",
                    dynamic =
                      if (esInstanceSupport) Some("runtime")
                      else Some("true")
                  )
                )
              ),
              ObjectField(
                "provenance",
                properties = List(
                  magdaTextField("mechanism"),
                  magdaTextField("sourceSystem"),
                  booleanField("isOpenData"),
                  magdaTextField("affiliatedOrganisationIds")
                )
              ),
              ObjectField(
                "accessControl",
                properties = List(
                  keywordField("ownerId"),
                  keywordField("orgUnitId"),
                  booleanField("constraintExemption"),
                  keywordField("preAuthorisedPermissionIds")
                )
              ),
              keywordField("years"),
              /*
               * not sure whether is Elasticsearch or elastic4s
               * Any field without mapping will be created as Text type --- which will create no `fielddata` error for aggregation
               * */
              keywordField("identifier"),
              keywordField("tenantId"),
              ObjectField(
                "contactPoint",
                properties = List(keywordField("identifier"))
              ),
              dateField("indexed"),
              keywordField("publishingState"),
              ObjectField(
                "accessNotes",
                properties = List(
                  magdaTextField("notes"),
                  magdaAutocompleteField("location")
                )
              )
            )
          )
          .analysis(
            new Analysis(
              tokenFilters = List(
                englishPossessiveStemmerFilter,
                lightEnglishStemmerFilter,
                magdaSynonymTokenFilter,
                englishPossessiveStemmerFilter,
                englishStopFilter,
                magdaEdgeNgramFilter
              ),
              analyzers = List(
                CustomAnalyzer(
                  "quote",
                  tokenizer = "keyword",
                  tokenFilters = List("lowercase")
                ),
                /*
                allow quoted query string match a portion of the field content rather than whole field
                the exact form of whole quoted query string still have to be matched exactly in field content
                 */
                CustomAnalyzer(
                  "quote_partial_match",
                  tokenizer = "standard",
                  tokenFilters = List("lowercase")
                ),
                CustomAnalyzer(
                  "uppercase",
                  tokenizer = "keyword",
                  tokenFilters = List("uppercase")
                ),
                englishWithSynonymAnalyzer,
                englishWithSynonymStripHtmlAnalyzer,
                englishWithoutSynonymForSearchAnalyzer,
                magdaEdgeNgramAnalyzer
              )
            )
          )
      applyIndexConfig(config, createIdxReq, true)
    }
  )

  val magdaRegionSynonymTokenFilter = SynonymGraphTokenFilter(
    "search_region_synonym_graph_filter",
    Some("analysis/regionSynonyms.txt"),
    Set.empty,
    None
  )

  val REGION_LANGUAGE_FIELDS = Seq("regionName")

  val regions: IndexDefinition =
    new IndexDefinition(
      name = "regions",
      version = 26,
      indicesIndex = Indices.RegionsIndex,
      definition = (indices, config) => {
        val createIdxReq =
          createIndex(indices.getIndex(config, Indices.RegionsIndex))
            .shards(config.getInt("elasticSearch.shardCount"))
            .replicas(config.getInt("elasticSearch.replicaCount"))
            .mapping(
              properties(
                keywordField("regionType"),
                keywordField("regionId"),
                magdaTextField("regionName"),
                magdaTextField("regionShortName"),
                keywordField("lv1Id"),
                keywordField("lv2Id"),
                keywordField("lv3Id"),
                keywordField("lv4Id"),
                keywordField("lv5Id"),
                textField("regionSearchId")
                  .analyzer("regionSearchIdIndex")
                  .searchAnalyzer("regionSearchIdInput"),
                magdaGeoShapeField("boundingBox"),
                magdaGeoShapeField("geometry"),
                intField("order")
              )
            )
            .analysis(
              new Analysis(
                analyzers = List(
                  CustomAnalyzer(
                    "quote",
                    tokenizer = "keyword",
                    tokenFilters = List("lowercase")
                  ),
                  CustomAnalyzer(
                    "regionSearchIdInput",
                    tokenizer = "whitespace",
                    tokenFilters = List(
                      "lowercase",
                      magdaRegionSynonymTokenFilter.name
                    )
                  ),
                  CustomAnalyzer(
                    "regionSearchIdIndex",
                    tokenizer = "keyword",
                    tokenFilters = List(
                      "lowercase"
                    )
                  )
                )
              )
            )
        applyIndexConfig(config, createIdxReq)
      },
      create = Some(
        (client, indices, config) =>
          (materializer, actorSystem) => {
            implicit val ec = actorSystem.dispatcher
            setupRegions(client, indices)(config, materializer, actorSystem)
            // do not return a future of setup region so that region setup won't block indexer processing request
            Future(Unit)
          }
      )
    )

  val publishers: IndexDefinition =
    new IndexDefinition(
      name = "publishers",
      version = 8,
      indicesIndex = Indices.PublishersIndex,
      definition = (indices, config) => {
        val createIdxReq =
          createIndex(indices.getIndex(config, Indices.PublishersIndex))
            .shards(config.getInt("elasticSearch.shardCount"))
            .replicas(config.getInt("elasticSearch.replicaCount"))
            .mapping(
              properties(
                keywordField("identifier"),
                textField("acronym")
                  .analyzer("keyword")
                  .searchAnalyzer("uppercase"),
                magdaTextField("jurisdiction"),
                textField("aggregation_keywords").analyzer("keyword"),
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
              )
            )
            .analysis(
              new Analysis(
                analyzers = List(
                  CustomAnalyzer(
                    "quote",
                    tokenizer = "keyword",
                    tokenFilters = List(
                      "lowercase"
                    )
                  ),
                  CustomAnalyzer(
                    "uppercase",
                    tokenizer = "keyword",
                    tokenFilters = List(
                      "uppercase"
                    )
                  )
                )
              )
            )
        applyIndexConfig(config, createIdxReq)
      }
    )

  val formats: IndexDefinition =
    new IndexDefinition(
      name = "formats",
      version = 3,
      indicesIndex = Indices.FormatsIndex,
      definition = (indices, config) => {
        val createIdxReq =
          createIndex(indices.getIndex(config, Indices.FormatsIndex))
            .shards(config.getInt("elasticSearch.shardCount"))
            .replicas(config.getInt("elasticSearch.replicaCount"))
            .mapping(
              properties(
                magdaTextField("value"),
                dateField("indexed")
              )
            )
            .analysis(
              new Analysis(
                analyzers = List(
                  CustomAnalyzer(
                    "quote",
                    tokenizer = "keyword",
                    tokenFilters = List(
                      "lowercase"
                    )
                  )
                )
              )
            )
        applyIndexConfig(config, createIdxReq)
      }
    )

  val indices = Seq(dataSets, regions, publishers, formats)

  def setupRegions(client: ElasticClient, indices: Indices)(
      implicit
      config: Config,
      materializer: Materializer,
      system: ActorSystem
  ): Future[Any] = {
    val regionSourceConfig = config.getConfig("regionSources")
    val regionSources = new RegionSources(regionSourceConfig)

    val loader = RegionLoader(regionSources.sources.toList)

    setupRegions(client, loader, indices)
  }

  implicit val geometryFactory =
    JtsSpatialContext.GEO.getShapeFactory.getGeometryFactory

  def getRegionSourceConfigValue(
      regionSource: RegionSource,
      fieldName: String
  ): Option[String] = {
    val field = regionSource.getClass.getDeclaredField(fieldName)
    field.setAccessible(true)
    field.get(regionSource).asInstanceOf[Option[String]]
  }

  def getOptionalIdFieldValue(
      idLevel: Int,
      jsonRegion: JsObject,
      regionSource: RegionSource
  ): JsValue = {
    getRegionSourceConfigValue(regionSource, s"""lv${idLevel}Id""") match {
      case Some(idValue: String) => JsString(idValue)
      case None =>
        getRegionSourceConfigValue(regionSource, s"""lv${idLevel}IdField""") match {
          case None => JsNull
          case Some(idFieldConfig: String) =>
            val properties = jsonRegion.fields("properties").asJsObject
            properties.getFields(idFieldConfig).headOption match {
              case Some(id: JsString) => id
              case _                  => JsNull
            }
        }
    }
  }

  def setupRegions(
      client: ElasticClient,
      loader: RegionLoader,
      indices: Indices
  )(
      implicit
      config: Config,
      materializer: Materializer,
      system: ActorSystem
  ): Future[Any] = {
    implicit val ec = system.dispatcher
    val logger = system.log
    loader.setupRegions
      .map {
        case (regionSource, jsonRegion) =>
          val properties = jsonRegion.fields("properties").asJsObject
          val id = properties.fields(regionSource.idProperty).convertTo[String]
          val name = if (regionSource.includeIdInName) {
            JsString(
              properties
                .fields(regionSource.nameProperty)
                .convertTo[String] + " - " + id
            )
          } else {
            properties.fields(regionSource.nameProperty)
          }
          val shortName = regionSource.shortNameProperty.map(
            shortNameProp => properties.fields(shortNameProp).convertTo[String]
          )

          // --- allow simplifyToleranceRatio to be specified per file or per region
          val simplifyToleranceRatio: Double = properties
            .getFields("simplifyToleranceRatio")
            .headOption
            .map(_.convertTo[Double])
            .getOrElse(regionSource.simplifyToleranceRatio)

          // --- allow requireSimplify to be specified per file or per region
          val requireSimplify: Boolean = properties
            .getFields("requireSimplify")
            .headOption
            .map(_.convertTo[Boolean])
            .getOrElse(regionSource.requireSimplify)

          val geometryOpt = jsonRegion.fields("geometry") match {
            case (jsGeometry: JsObject) =>
              val geometry = jsGeometry.convertTo[GeoJson.Geometry]

              if (!requireSimplify) {
                logger.info(
                  "Skipped simplifying GeoData {}/{}/{}",
                  regionSource.idProperty,
                  id,
                  name
                )
                Some(geometry)
              } else {

                val jtsGeo =
                  GeometryConverter.toJTSGeo(geometry, geometryFactory)

                val shortestSide = {
                  val env = jtsGeo.getEnvelopeInternal
                  Math.min(env.getWidth, env.getHeight)
                }
                val simplified =
                  TopologyPreservingSimplifier.simplify(
                    jtsGeo,
                    shortestSide * simplifyToleranceRatio
                  )

                def removeInvalidHoles(polygon: Polygon): Polygon = {
                  val holes = for { i <- 0 to polygon.getNumInteriorRing - 1 } yield
                    polygon.getInteriorRingN(i).asInstanceOf[LinearRing]
                  val filteredHoles = holes.filter(_.within(simplified))
                  new Polygon(
                    polygon.getExteriorRing.asInstanceOf[LinearRing],
                    filteredHoles.toArray,
                    geometryFactory
                  )
                }

                // Remove holes that intersect the edge of the shape - TODO: Can we do something clever like use an intersection to trim the hole?
                val simplifiedFixed: Geometry =
                  simplified.getGeometryType match {
                    case "Polygon" =>
                      val x = simplified.asInstanceOf[Polygon]
                      removeInvalidHoles(x)
                    case "MultiPolygon" =>
                      val x = simplified.asInstanceOf[MultiPolygon]
                      val geometries = for { i <- 0 to x.getNumGeometries - 1 } yield
                        removeInvalidHoles(
                          x.getGeometryN(i).asInstanceOf[Polygon]
                        )
                      new MultiPolygon(geometries.toArray, geometryFactory)
                    case _ => simplified
                  }

                Some(GeometryConverter.fromJTSGeo(simplifiedFixed))
              }
            case _ => None
          }

          val uniqueRegionId = generateRegionId(regionSource.name, id)

          geometryOpt.map(
            geometry =>
              indexInto(
                indices.getIndex(config, Indices.RegionsIndex)
              ).id(uniqueRegionId)
                .source(
                  JsObject(
                    "regionType" -> JsString(regionSource.name),
                    "regionId" -> JsString(id),
                    "regionName" -> name,
                    "regionShortName" -> shortName
                      .map(JsString(_))
                      .getOrElse(JsNull),
                    "regionSearchId" -> JsString(uniqueRegionId),
                    "boundingBox" -> createEnvelope(geometry).toJson(
                      EsBoundingBoxFormat
                    ),
                    "geometry" -> geometry.toJson,
                    "order" -> JsNumber(regionSource.order),
                    "lv1Id" -> getOptionalIdFieldValue(
                      1,
                      jsonRegion,
                      regionSource
                    ),
                    "lv2Id" -> getOptionalIdFieldValue(
                      2,
                      jsonRegion,
                      regionSource
                    ),
                    "lv3Id" -> getOptionalIdFieldValue(
                      3,
                      jsonRegion,
                      regionSource
                    ),
                    "lv4Id" -> getOptionalIdFieldValue(
                      4,
                      jsonRegion,
                      regionSource
                    ),
                    "lv5Id" -> getOptionalIdFieldValue(
                      5,
                      jsonRegion,
                      regionSource
                    )
                  ).toJson
                )
          )

      }
      .filter(_.isDefined)
      .map(_.get)
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
          case failure: RequestFailure =>
            logger.error("Failure: {}", failure.error)
            0
          case results: RequestSuccess[BulkResponse] =>
            if (result.result.errors) {
              logger.error("Failure: {}", result.body)
              0
            } else {
              logger.debug(
                "Took {} seconds to execute request.",
                results.result.took
              )
              results.result.successes.size
            }
        }
      }
      .recover {
        case e: Throwable =>
          logger.error(e, "Encountered error while indexing regions")
          throw e
      }
      .runWith(
        Sink.reduce(
          (oldLength: AnyVal, latestValuesLength: AnyVal) =>
            oldLength.asInstanceOf[Int] + latestValuesLength.asInstanceOf[Int]
        )
      )
      .map { count =>
        logger.info("Successfully indexed {} regions", count)
      }
  }
}
