package au.csiro.data61.magda.search.eval

import java.io.{File, PrintWriter}
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths}
import java.security.MessageDigest

import akka.actor.ActorSystem
import akka.http.scaladsl.marshalling.ToEntityMarshaller
import akka.http.scaladsl.model.{HttpHeader, HttpResponse}
import akka.stream.ActorMaterializer
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.api.Query
import au.csiro.data61.magda.api.model.SearchAuthDecision
import au.csiro.data61.magda.client.{EmbeddingApiClient, HttpFetcher}
import au.csiro.data61.magda.model.Auth.UnconditionalTrueDecision
import au.csiro.data61.magda.model.TenantId.SpecifiedTenantId
import au.csiro.data61.magda.model.misc.Region
import au.csiro.data61.magda.search.SearchStrategy.MatchAll
import au.csiro.data61.magda.search.elasticsearch._
import com.sksamuel.elastic4s.{ElasticClient, ElasticProperties}
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.http.JavaClient
import com.sksamuel.elastic4s.requests.searches.SearchHandlers
import com.typesafe.config.{Config, ConfigFactory, ConfigRenderOptions}
import spray.json._

import scala.concurrent.{Await, ExecutionContext, Future}
import scala.concurrent.duration._
import scala.io.Source

/** Evaluation-only test-scope CLI. Never constructs or transforms search DSL.
  * The authoritative baseline commit is recorded by the evaluation owner with
  * --baseline-commit (default is the owner-provided main revision ba181562).
  * This is a public, all-accessible corpus scenario, NOT an authorization test.
  */
object ExportBaselineRequests {
  private val hybridPath = HybridSearchConfig.configPath
  private val usage = """ExportBaselineRequests --input tasks.jsonl --output baseline.jsonl --index eval-datasets
    |  [--config runtime.conf] [--dimension 768] [--k N] [--limit 50]
    |  [--facet-size 10] [--mapping-output mapping.json]
    |  [--config-output config.json]
    |  [--regions-endpoint http://127.0.0.1:19200] [--baseline-commit ba181562]
    |
    |Input: {"id":"q1","query":"water quality","vector":[...],
    |        "filters":{"publisher":"Example","format":["CSV"],"dateFrom":"2020","regions":["ste:1"]}}
    |Supported filters: publisher/publishers, format/formats, region/regions, dateFrom, dateTo.
    |No endpoint is needed unless --regions-endpoint explicitly enables read-only region augmentation.
    |Mapping export uses production IndexDefinition, with local shardCount=1/replicaCount=0 defaults.
    |Provision the production analysis/wn_s.pl synonym file in the target OpenSearch node.
    |""".stripMargin

  private def options(args: Array[String]): Map[String, String] = {
    if (args.contains("--help")) { println(usage); return Map.empty }
    require(args.length % 2 == 0, usage)
    val pairs = args.grouped(2).map { pair =>
      require(pair(0).startsWith("--"), usage)
      pair(0).drop(2) -> pair(1)
    }.toVector
    require(pairs.map(_._1).distinct.size == pairs.size, "Duplicate CLI options")
    val known = Set("input", "output", "index", "config", "dimension", "k", "limit",
      "facet-size", "mapping-output", "config-output", "regions-endpoint", "baseline-commit")
    require(pairs.forall(p => known(p._1)), "Unknown CLI option; use --help")
    val result = pairs.toMap
    Seq("input", "output", "index").foreach(k => require(result.contains(k), s"Missing --$k\n$usage"))
    result
  }

  private def sha(text: String): String = MessageDigest.getInstance("SHA-256")
    .digest(text.getBytes(StandardCharsets.UTF_8)).map(b => f"${b & 0xff}%02x").mkString

  // elastic4s show starts with POST/PUT and a URL, not with a JSON object.
  private def requestBody(shown: String): JsValue = {
    val json = shown.dropWhile(_ != '{')
    require(json.nonEmpty, "Production request rendering did not contain a JSON body")
    json.parseJson
  }

  private def writeJson(path: String, value: JsValue): Unit = {
    val writer = new PrintWriter(new File(path), "UTF-8")
    try writer.println(value.prettyPrint) finally writer.close()
  }

  private def regionJson(region: Region): JsObject = {
    def text(value: Option[String]): JsValue = value.map(JsString(_)).getOrElse(JsNull)
    val bounds: JsValue = region.boundingBox.map { b =>
      JsObject("north" -> JsNumber(b.north), "east" -> JsNumber(b.east),
        "south" -> JsNumber(b.south), "west" -> JsNumber(b.west))
    }.getOrElse(JsNull)
    JsObject("id" -> JsString(region.queryRegion.toString), "regionName" -> text(region.regionName),
      "regionShortName" -> text(region.regionShortName), "boundingBox" -> bounds,
      "lv1Id" -> text(region.lv1Id), "lv2Id" -> text(region.lv2Id), "lv3Id" -> text(region.lv3Id),
      "lv4Id" -> text(region.lv4Id), "lv5Id" -> text(region.lv5Id))
  }

  private def inputQuery(row: JsObject)(implicit config: Config): (String, Query) = {
    val fields = row.fields
    def requiredString(name: String): String = fields.get(name) match {
      case Some(JsString(value)) if value.trim.nonEmpty => value
      case _ => throw new IllegalArgumentException(s"Expected nonempty string '$name'")
    }
    val id = requiredString("id")
    val text = requiredString("query")
    val vector = fields.get("vector") match {
      case Some(JsArray(values)) => values.map {
        case JsNumber(value) =>
          val number = value.toDouble
          require(!number.isNaN && !number.isInfinity, s"$id: nonfinite embedding")
          number
        case _ => throw new IllegalArgumentException(s"$id: vector must contain numbers")
      }.toArray
      case _ => throw new IllegalArgumentException(s"$id: missing vector array")
    }
    require(vector.length == HybridSearchConfig.dimension,
      s"$id: vector dimension ${vector.length} != configured ${HybridSearchConfig.dimension}")
    val filters = fields.get("filters") match {
      case None | Some(JsNull) => Map.empty[String, JsValue]
      case Some(value: JsObject) => value.fields
      case _ => throw new IllegalArgumentException(s"$id: filters must be an object")
    }
    val known = Set("publisher", "publishers", "format", "formats", "region", "regions", "dateFrom", "dateTo")
    require(filters.keys.forall(known), s"$id: unsupported filters: ${filters.keySet -- known}")
    def strings(key: String): Vector[String] = filters.get(key) match {
      case None | Some(JsNull) => Vector.empty
      case Some(JsString(value)) => Vector(value)
      case Some(JsArray(values)) => values.map {
        case JsString(value) => value
        case _ => throw new IllegalArgumentException(s"$id: $key must contain strings")
      }
      case _ => throw new IllegalArgumentException(s"$id: $key must be a string or string array")
    }
    def date(key: String): Option[String] = {
      val values = strings(key)
      require(values.size <= 1, s"$id: $key accepts at most one value")
      values.headOption
    }
    val parsed = Query.fromQueryParams(
      Some(text), strings("publisher") ++ strings("publishers"), date("dateFrom"), date("dateTo"),
      strings("region") ++ strings("regions"), strings("format") ++ strings("formats"), Seq("published"),
      Some(SearchAuthDecision(UnconditionalTrueDecision, UnconditionalTrueDecision)), SpecifiedTenantId(BigInt(0)))
    require(date("dateFrom").isEmpty || parsed.dateFrom.nonEmpty, s"$id: invalid dateFrom")
    require(date("dateTo").isEmpty || parsed.dateTo.nonEmpty, s"$id: invalid dateTo")
    val inputRegions = strings("region") ++ strings("regions")
    require(inputRegions.isEmpty || parsed.regions.size == inputRegions.distinct.size, s"$id: invalid region filter")
    id -> parsed.copy(freeTextVector = Some(vector), hybridSearch = true)
  }

  def main(args: Array[String]): Unit = {
    val opts = options(args)
    if (opts.isEmpty) return
    val indexName = opts("index")
    require(indexName.matches("[a-z0-9][a-z0-9_.-]*"), "--index must be a single lower-case index name")
    val limit = opts.getOrElse("limit", "50").toInt
    val facetSize = opts.getOrElse("facet-size", "10").toInt
    require(limit >= 10, "--limit must be >= 10")
    require(facetSize > 0, "--facet-size must be positive")
    var overrides = ConfigFactory.empty()
    opts.get("dimension").foreach { n =>
      require(n.toInt > 0, "--dimension must be positive")
      overrides = overrides.withFallback(ConfigFactory.parseString(s"$hybridPath.knnVectorFieldConfig.dimension=$n"))
    }
    opts.get("k").foreach { n =>
      require(n.toInt > 0, "--k must be positive")
      overrides = overrides.withFallback(ConfigFactory.parseString(s"$hybridPath.k=$n"))
    }
    val supplied = opts.get("config").map { path =>
      require(Files.isRegularFile(Paths.get(path)), s"Config file does not exist: $path")
      ConfigFactory.parseFile(new File(path))
    }.getOrElse(ConfigFactory.empty())
    // AppConfig honors ordinary -Dconfig.file, too. Do not substitute synthetic query settings.
    // shard/replica defaults fill the common.conf omission; explicit runtime config takes precedence.
    implicit val config: Config = overrides.withFallback(supplied).withFallback(AppConfig.conf())
      .withFallback(ConfigFactory.parseString("elasticSearch.shardCount=1\nelasticSearch.replicaCount=0")).resolve()
    val previousHybridConfig = HybridSearchConfig._conf
    HybridSearchConfig.setAppConfig(config)
    require(HybridSearchConfig.enabled, "Baseline export requires hybrid search enabled")
    implicit val system: ActorSystem = ActorSystem("SearchRelevanceBaselineExport", config)
    implicit val ec: ExecutionContext = system.dispatcher
    implicit val materializer: ActorMaterializer = ActorMaterializer()
    // JavaClient connects only on execute. In export-only mode even this client's port is unreachable.
    val client = ElasticClient(JavaClient(ElasticProperties(opts.getOrElse("regions-endpoint", "http://127.0.0.1:1"))))
    implicit val provider: ClientProvider = new ClientProvider {
      override def getClient(): Future[ElasticClient] = Future.successful(client)
    }
    // Same fail-fast fixture pattern as production ElasticSearchQueryerSpec: input vectors only.
    val noHttp = new HttpFetcher {
      private def unexpected(): Nothing = throw new AssertionError("Baseline exporter must not request embeddings or HTTP via HttpFetcher")
      override def get(path: String, headers: Seq[HttpHeader]): Future[HttpResponse] = unexpected()
      override def post[T](path: String, payload: T, headers: Seq[HttpHeader], autoRetryConnection: Boolean)
        (implicit m: ToEntityMarshaller[T]): Future[HttpResponse] = unexpected()
      override def put[T](path: String, payload: T, headers: Seq[HttpHeader], autoRetryConnection: Boolean)
        (implicit m: ToEntityMarshaller[T]): Future[HttpResponse] = unexpected()
    }
    implicit val embeddingClient: EmbeddingApiClient = new EmbeddingApiClient(noHttp)
    val indices = new Indices {
      override def getIndex(conf: Config, index: Indices.Index): String =
        if (index == Indices.DataSetsIndex) indexName else super.getIndex(conf, index)
    }
    val renderOptions = ConfigRenderOptions.concise().setJson(true).setComments(false).setOriginComments(false)
    // Hash full effective config, but never export secrets from its non-search sections.
    val configSha = sha(config.root().render(renderOptions))
    val safeConfig = config.getConfig("elasticSearch").root().render(renderOptions).parseJson
    val queryer = new ElasticSearchQueryer(indices)
    var source: Option[Source] = None
    var writer: Option[PrintWriter] = None
    try {
      opts.get("mapping-output").foreach { path =>
        writeJson(path, requestBody(client.show(IndexDefinition.dataSets.definition(indices, config)).query))
      }
      opts.get("config-output").foreach { path =>
        writeJson(path, JsObject("config_sha" -> JsString(configSha), "elasticSearch" -> safeConfig))
      }
      val input = Source.fromFile(opts("input"), "UTF-8")
      source = Some(input)
      val output = new PrintWriter(new File(opts("output")), "UTF-8")
      writer = Some(output)
      val seen = scala.collection.mutable.Set.empty[String]
      input.getLines().zipWithIndex.filter(_._1.trim.nonEmpty).foreach { case (line, number) =>
        try {
          val (id, initial) = inputQuery(line.parseJson.asJsObject)
          require(!seen(id), s"Duplicate query id: $id")
          seen += id
          val query = if (opts.contains("regions-endpoint")) {
            val augment = Await.result(queryer.augmentWithBoostRegions(initial)(client), 60.seconds)
            augment(initial)
          } else initial
          val request = queryer.buildQueryWithAggregations(query, 0L, limit, MatchAll, facetSize)
          val lowLevel = SearchHandlers.SearchHandler.build(request)
          val params = JsObject(lowLevel.params.map { case (key, value) => key -> JsString(value) })
          val body = requestBody(client.show(request).query)
          val boosts = JsArray(query.boostRegions.toVector.sortBy(_.queryRegion.toString).map(regionJson))
          output.println(JsObject(
            "query_id" -> JsString(id),
            "request" -> JsObject("body" -> body, "query_params" -> params,
              "method" -> JsString(lowLevel.method), "path" -> JsString(lowLevel.endpoint)),
            "config_sha" -> JsString(configSha),
            "baseline_commit" -> JsString(opts.getOrElse("baseline-commit", "ba181562")),
            "boost_regions_augmentation" -> JsString(if (opts.contains("regions-endpoint")) "production" else "disabled"),
            "boost_regions_index" -> JsString(indices.getIndex(config, Indices.RegionsIndex)),
            "boost_regions" -> boosts,
            "public_corpus_assumptions" -> JsObject("tenant_id" -> JsNumber(0),
              "publishing_state" -> JsString("published"), "dataset_and_distribution_auth" -> JsString("UnconditionalTrueDecision"))
          ).compactPrint)
        } catch {
          case error: Exception => throw new IllegalArgumentException(s"Input line ${number + 1}: ${error.getMessage}", error)
        }
      }
      output.flush()
      require(!output.checkError(), "Failed writing baseline JSONL")
      System.err.println(s"Exported ${seen.size} production baseline requests to ${opts("output")}; config_sha=$configSha")
    } finally {
      writer.foreach(_.close())
      source.foreach(_.close())
      HybridSearchConfig._conf = previousHybridConfig
      try client.close() finally Await.result(system.terminate(), 10.seconds)
    }
  }
}
