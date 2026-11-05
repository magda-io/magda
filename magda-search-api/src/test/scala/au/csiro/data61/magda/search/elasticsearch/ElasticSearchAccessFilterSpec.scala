package au.csiro.data61.magda.search.elasticsearch

import java.net.{HttpURLConnection, URL}
import java.nio.charset.StandardCharsets
import java.time.OffsetDateTime
import java.util.UUID

import akka.actor.ActorSystem
import akka.http.scaladsl.marshalling.ToEntityMarshaller
import akka.http.scaladsl.model.{HttpHeader, HttpResponse}
import akka.stream.ActorMaterializer
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.api.{Query, Specified}
import au.csiro.data61.magda.api.model.SearchAuthDecision
import au.csiro.data61.magda.client.{EmbeddingApiClient, HttpFetcher}
import au.csiro.data61.magda.model.Auth._
import au.csiro.data61.magda.model.TenantId.{AllTenantsId, SpecifiedTenantId}
import au.csiro.data61.magda.search.SearchStrategy.MatchAll
import com.sksamuel.elastic4s.{ElasticClient, ElasticProperties}
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.http.JavaClient
import com.typesafe.config.{Config, ConfigFactory}
import org.scalatest.{
  BeforeAndAfterAll,
  BeforeAndAfterEach,
  FunSpec,
  Matchers,
  Outcome
}
import spray.json._

import scala.concurrent.{Await, ExecutionContext, Future}
import scala.concurrent.duration._
import scala.io.Source

/** Optional real-engine regressions for #3886. Never touches a catalog index.
  * Set MAGDA_SEARCH_TEST_OPENSEARCH_URL to an isolated OpenSearch 2.19.1 endpoint.
  * Requests are serialized from the production query builder, not hand-written DSL.
  */
class ElasticSearchAccessFilterSpec
    extends FunSpec
    with Matchers
    with BeforeAndAfterEach
    with BeforeAndAfterAll {

  implicit val config: Config =
    ConfigFactory.parseString("""
                                |elasticSearch.indices.datasets.hybridSearch {
                                |  enabled = true
                                |  k = null
                                |  maxDistance = null
                                |  minScore = 0.8
                                |}
                                |""".stripMargin).withFallback(AppConfig.conf())
  implicit val system: ActorSystem =
    ActorSystem("ElasticSearchAccessFilterSpec", config)
  implicit val ec: ExecutionContext = system.dispatcher
  implicit val materializer: ActorMaterializer = ActorMaterializer()
  private val client = ElasticClient(
    JavaClient(ElasticProperties("http://127.0.0.1:1"))
  )
  implicit val clientProvider: ClientProvider = new ClientProvider {
    override def getClient(): Future[ElasticClient] = Future.successful(client)
  }
  private val noHttp = new HttpFetcher {
    private def unexpected(): Nothing =
      throw new AssertionError("Embedding HTTP is not needed")
    override def get(
        path: String,
        headers: Seq[HttpHeader]
    ): Future[HttpResponse] = unexpected()
    override def post[T](
        path: String,
        payload: T,
        headers: Seq[HttpHeader],
        autoRetryConnection: Boolean
    )(
        implicit m: ToEntityMarshaller[T]
    ): Future[HttpResponse] = unexpected()
    override def put[T](
        path: String,
        payload: T,
        headers: Seq[HttpHeader],
        autoRetryConnection: Boolean
    )(
        implicit m: ToEntityMarshaller[T]
    ): Future[HttpResponse] = unexpected()
  }
  implicit val embeddingClient: EmbeddingApiClient = new EmbeddingApiClient(
    noHttp
  )

  private var previousHybridConfig: Option[Config] = None
  private var hybridConfigChanged = false
  private var endpoint = ""
  private var indexName: Option[String] = None
  private val indices = new Indices {
    override def getIndex(config: Config, index: Indices.Index): String =
      indexName.get
  }
  private val queryer = new ElasticSearchQueryer(indices)

  override protected def beforeEach(): Unit = {
    super.beforeEach()
    endpoint = sys.env
      .get("MAGDA_SEARCH_TEST_OPENSEARCH_URL")
      .filter(_.trim.nonEmpty)
      .map(_.trim.stripSuffix("/"))
      .getOrElse("")
    if (endpoint.nonEmpty) {
      previousHybridConfig = HybridSearchConfig._conf
      HybridSearchConfig.setAppConfig(config)
      hybridConfigChanged = true
      val name = "magda-search-access-test-" + UUID.randomUUID().toString
      // Record only our UUID-named index; cleanup never uses a wildcard or catalog alias.
      indexName = Some(name)
      request("PUT", s"/$name", mapping)
    }
  }

  override protected def withFixture(test: NoArgTest): Outcome = {
    // Cancellation belongs to the test fixture, not beforeEach: ScalaTest 3
    // treats an exception from beforeEach as a suite abort.
    if (endpoint.isEmpty) {
      cancel(
        "Set MAGDA_SEARCH_TEST_OPENSEARCH_URL to run real OpenSearch access-filter tests"
      )
    }
    super.withFixture(test)
  }

  override protected def afterEach(): Unit = {
    try indexName.foreach(name => request("DELETE", s"/$name"))
    finally {
      indexName = None
      if (hybridConfigChanged) HybridSearchConfig._conf = previousHybridConfig
      hybridConfigChanged = false
      super.afterEach()
    }
  }

  override protected def afterAll(): Unit = {
    try client.close()
    finally {
      try Await.result(system.terminate(), 10.seconds)
      finally super.afterAll()
    }
  }

  private def request(
      method: String,
      path: String,
      body: String = ""
  ): JsValue = {
    val connection =
      new URL(endpoint + path).openConnection().asInstanceOf[HttpURLConnection]
    connection.setRequestMethod(method)
    connection.setConnectTimeout(10000)
    connection.setReadTimeout(60000)
    try {
      if (body.nonEmpty) {
        connection.setDoOutput(true)
        connection.setRequestProperty("Content-Type", "application/json")
        val out = connection.getOutputStream
        try out.write(body.getBytes(StandardCharsets.UTF_8))
        finally out.close()
      }
      val status = connection.getResponseCode
      val stream =
        if (status >= 400) connection.getErrorStream
        else connection.getInputStream
      val text =
        if (stream == null) ""
        else {
          val source = Source.fromInputStream(stream, "UTF-8")
          try source.mkString
          finally source.close()
        }
      assert(
        (status >= 200 && status < 300) ||
          (status == 404 && method == "DELETE" && indexName
            .exists(name => path == s"/$name")),
        s"$method $path returned $status: $text"
      )
      if (text.isEmpty) JsNull else text.parseJson
    } finally connection.disconnect()
  }

  private val vectorMapping =
    """{"type":"knn_vector","dimension":2,"method":{"name":"hnsw","engine":"faiss","space_type":"l2","parameters":{"ef_construction":100,"m":16}}}"""
  private val accessMapping =
    """{"type":"object","properties":{"ownerId":{"type":"keyword"}}}"""
  private val mapping = s"""{
    "settings":{"index":{"knn":true,"number_of_shards":1,"number_of_replicas":0}},
    "mappings":{"properties":{
      "title":{"type":"text"},"description":{"type":"text"},
      "tenantId":{"type":"keyword"},"publishingState":{"type":"keyword"},
      "accessControl":$accessMapping,"queryContextVector":$vectorMapping,
      "quality":{"type":"double"},"hasQuality":{"type":"boolean"},
      "publisher":{"properties":{"name":{"type":"text","fields":{"keyword_lowercase":{"type":"keyword"}}}}},
      "temporal":{"properties":{"start":{"properties":{"date":{"type":"date"}}},"end":{"properties":{"date":{"type":"date"}}}}},
      "distributions":{"type":"nested","properties":{
        "title":{"type":"text"},"description":{"type":"text"},
        "format":{"type":"text","fields":{"quote":{"type":"text","analyzer":"keyword"}}},
        "tenantId":{"type":"keyword"},"publishingState":{"type":"keyword"},
        "accessControl":$accessMapping,"queryContextVector":$vectorMapping
      }}
    }}
  }"""

  private def ownerDecision(target: String): AuthDecision = AuthDecision(
    hasResidualRules = true,
    result = None,
    residualRules = Some(
      List(
        ConciseRule(
          value = JsTrue,
          fullName = "data.test.allow",
          name = "allow",
          expressions = List(
            ConciseExpression(
              false,
              Some("="),
              Vector(
                ConciseOperand(
                  true,
                  JsString(s"input.object.$target.access-control.ownerId")
                ),
                ConciseOperand(false, JsString("visible"))
              )
            )
          )
        )
      )
    )
  )
  private def input: Query = Query(
    freeText = Some("needle"),
    freeTextVector = Some(Array(0.0, 0.0)),
    hybridSearch = true,
    authDecision = Some(
      SearchAuthDecision(
        ownerDecision("dataset"),
        ownerDecision("distribution")
      )
    ),
    tenantId = Some(SpecifiedTenantId(BigInt(17))),
    publishingState = Set(Specified("published"))
  )

  private def configure(hybrid: Boolean, k: Option[Int] = None): Unit =
    HybridSearchConfig.setAppConfig(
      ConfigFactory
        .parseString(
          s"""${HybridSearchConfig.configPath}.enabled = $hybrid
             |${HybridSearchConfig.configPath}.k = ${k
               .map(_.toString)
               .getOrElse("null")}
             |""".stripMargin
        )
        .withFallback(config)
    )

  private def child(
      title: String = "unrelated",
      owner: String = "visible",
      state: String = "published",
      tenant: Int = 17,
      vector: Vector[Double] = Vector(10.0, 10.0),
      format: String = "CSV"
  ): JsObject = JsObject(
    "title" -> JsString(title),
    "format" -> JsString(format),
    "tenantId" -> JsNumber(tenant),
    "publishingState" -> JsString(state),
    "accessControl" -> JsObject("ownerId" -> JsString(owner)),
    "queryContextVector" -> JsArray(vector.map(JsNumber(_)))
  )

  private def dataset(
      children: Vector[JsObject] = Vector.empty,
      title: String = "unrelated",
      owner: String = "visible",
      state: String = "published",
      tenant: Int = 17,
      vector: Option[Vector[Double]] = None,
      publisher: String = "Example"
  ): JsObject =
    JsObject(
      Map[String, JsValue](
        "title" -> JsString(title),
        "tenantId" -> JsNumber(tenant),
        "publishingState" -> JsString(state),
        "accessControl" -> JsObject("ownerId" -> JsString(owner)),
        "publisher" -> JsObject("name" -> JsString(publisher)),
        "temporal" -> JsObject(
          "start" -> JsObject("date" -> JsString("2022-01-01T00:00:00Z"))
        ),
        "distributions" -> JsArray(children),
        "hasQuality" -> JsBoolean(false)
      ) ++ vector.map(v => "queryContextVector" -> JsArray(v.map(JsNumber(_))))
    )

  private def insert(documents: (String, JsObject)*): Unit = {
    documents.foreach {
      case (id, document) =>
        request("PUT", s"/${indexName.get}/_doc/$id", document.compactPrint)
    }
    request("POST", s"/${indexName.get}/_refresh")
  }
  private def generated(q: Query): JsValue =
    client
      .show(queryer.buildQuery(q, 0, 100, MatchAll))
      .query
      .dropWhile(_ != '{')
      .parseJson

  private def search(body: JsValue): Map[String, Double] = {
    val response = request(
      "POST",
      s"/${indexName.get}/_search",
      body.compactPrint
    ).asJsObject
    val shards = response.fields("_shards").asJsObject.fields
    shards("failed") shouldBe JsNumber(0)
    response
      .fields("hits")
      .asJsObject
      .fields("hits")
      .asInstanceOf[JsArray]
      .elements
      .map { hit =>
        val fields = hit.asJsObject.fields
        fields("_id")
          .asInstanceOf[JsString]
          .value -> fields("_score").asInstanceOf[JsNumber].value.toDouble
      }
      .toMap
  }

  private def isDistributionKnn(value: JsValue): Boolean = value match {
    case JsObject(fields) =>
      fields
        .get("knn")
        .exists(_.asJsObject.fields.keys.exists(_.startsWith("distributions.")))
    case JsArray(values) => values.exists(isDistributionKnn)
    case _               => false
  }

  // Negative control: restore the pre-fix unfiltered child keyword/kNN branches,
  // leaving parent security and inner-hit filtering intact.
  private def withoutChildMatchFilters(value: JsValue): JsValue = value match {
    case JsObject(fields) if fields.get("bool").exists { bool =>
          bool.asJsObject.fields.get("must").exists(isDistributionKnn)
        } =>
      val bool = fields("bool").asJsObject
      JsObject(fields + ("bool" -> JsObject((bool.fields - "filter").map {
        case (key, child) => key -> withoutChildMatchFilters(child)
      })))
    case JsObject(fields) if fields.contains("knn") =>
      JsObject(fields.map {
        case (key, payload) =>
          key -> (if (key == "knn") JsObject(payload.asJsObject.fields.map {
                    case (name, options) if name.startsWith("distributions.") =>
                      name -> JsObject(
                        options.asJsObject.fields + ("filter" -> JsObject(
                          "match_all" -> JsObject()
                        ))
                      )
                    case item => item
                  })
                  else withoutChildMatchFilters(payload))
      })
    case JsObject(fields)
        if fields.get("path").contains(JsString("distributions")) &&
          fields
            .get("query")
            .exists(_.compactPrint.contains("simple_query_string")) =>
      val bool = fields("query").asJsObject.fields("bool").asJsObject
      JsObject(
        fields + ("query" -> JsObject(
          "bool" -> JsObject(bool.fields - "filter")
        ))
      )
    case JsObject(fields) =>
      JsObject(fields.map { case (k, v) => k -> withoutChildMatchFilters(v) })
    case JsArray(values) => JsArray(values.map(withoutChildMatchFilters))
    case other           => other
  }

  Seq(false, true).foreach { hybrid =>
    val mode = if (hybrid) "hybrid" else "keyword"
    describe(s"real OpenSearch $mode access filtering") {
      it(
        "ignores inaccessible matching children even with a visible unrelated sibling"
      ) {
        configure(hybrid)
        val unrelated = child()
        insert(
          "restricted" -> dataset(
            Vector(
              unrelated,
              child("needle", owner = "hidden", vector = Vector(0.0, 0.0))
            )
          ),
          "draft" -> dataset(
            Vector(
              unrelated,
              child("needle", state = "draft", vector = Vector(0.0, 0.0))
            )
          ),
          "foreign" -> dataset(
            Vector(
              unrelated,
              child("needle", tenant = 99, vector = Vector(0.0, 0.0))
            )
          ),
          "public" -> dataset(
            Vector(child("needle", vector = Vector(0.0, 0.0)))
          ),
          "metadata" -> dataset(title = "needle")
        )
        val body = generated(input)
        search(body).keySet shouldBe Set("public", "metadata")
        search(withoutChildMatchFilters(body)).keySet should contain allOf ("restricted", "draft", "foreign")
      }

      it("allows privileged all-state and all-tenant distribution matches") {
        configure(hybrid)
        insert(
          "restricted" -> dataset(
            Vector(
              child(
                "needle",
                owner = "hidden",
                state = "draft",
                tenant = 99,
                vector = Vector(0.0, 0.0)
              )
            )
          )
        )
        val privileged = input.copy(
          tenantId = Some(AllTenantsId),
          publishingState = Set(Specified("*")),
          authDecision = Some(
            SearchAuthDecision(
              UnconditionalTrueDecision,
              UnconditionalTrueDecision
            )
          )
        )
        search(generated(privileged)).keySet shouldBe Set("restricted")
      }

      it("keeps parent publisher/date facets and any-sibling format semantics") {
        // Radial mode also verifies the OpenSearch 2.19.1 filter-rewrite workaround.
        configure(hybrid)
        insert(
          "siblings" -> dataset(
            Vector(
              child("needle", format = "CSV", vector = Vector(0.0, 0.0)),
              child(format = "PDF")
            )
          )
        )
        val q = input.copy(
          publishers = Set(Specified("Example")),
          formats = Set(Specified("PDF")),
          dateFrom =
            Some(Specified(OffsetDateTime.parse("2021-01-01T00:00:00Z"))),
          dateTo = Some(Specified(OffsetDateTime.parse("2023-01-01T00:00:00Z")))
        )
        search(generated(q)).keySet shouldBe Set("siblings")
        search(generated(q.copy(publishers = Set(Specified("Other"))))).keySet shouldBe empty
      }
    }
  }

  describe("real OpenSearch vector prefiltering") {
    it(
      "does not rank an accessible parent using its restricted perfect-vector sibling"
    ) {
      configure(hybrid = true)
      val visible = child(vector = Vector(0.3, 0.3))
      insert(
        "mixed" -> dataset(
          Vector(visible, child(owner = "hidden", vector = Vector(0.0, 0.0)))
        ),
        "control" -> dataset(Vector(visible))
      )
      val body = generated(input)
      val scores = search(body)
      scores.keySet shouldBe Set("mixed", "control")
      scores("mixed") shouldBe (scores("control") +- 0.0001)
      val unfiltered = search(withoutChildMatchFilters(body))
      unfiltered("mixed") should be > unfiltered("control")
    }

    it(
      "filters maxDistance matches in child scope while applying parent date facets"
    ) {
      HybridSearchConfig.setAppConfig(
        ConfigFactory
          .parseString(
            s"""${HybridSearchConfig.configPath} {
               |  enabled = true
               |  k = null
               |  minScore = null
               |  maxDistance = 0.25
               |}
               |""".stripMargin
          )
          .withFallback(config)
      )
      val visible = child(vector = Vector(0.3, 0.3))
      insert(
        "mixed" -> dataset(
          Vector(visible, child(owner = "hidden", vector = Vector(0.0, 0.0)))
        ),
        "control" -> dataset(Vector(visible))
      )
      val q = input.copy(
        publishers = Set(Specified("Example")),
        dateFrom = Some(Specified(OffsetDateTime.parse("2021-01-01T00:00:00Z"))),
        dateTo = Some(Specified(OffsetDateTime.parse("2023-01-01T00:00:00Z")))
      )
      val body = generated(q)
      val scores = search(body)
      scores.keySet shouldBe Set("mixed", "control")
      scores("mixed") shouldBe (scores("control") +- 0.0001)
      val unfiltered = search(withoutChildMatchFilters(body))
      unfiltered("mixed") should be > unfiltered("control")
      search(generated(q.copy(publishers = Set(Specified("Other"))))).keySet shouldBe empty
    }

    it(
      "prefilters child k=1 before a restricted perfect vector can occupy the candidate slot"
    ) {
      configure(hybrid = true, k = Some(1))
      insert(
        "mixed" -> dataset(
          Vector(child(), child(owner = "hidden", vector = Vector(0.0, 0.0)))
        ),
        "eligible" -> dataset(Vector(child(vector = Vector(0.3, 0.3))))
      )
      val body = generated(input)
      search(body).keySet shouldBe Set("eligible")
      search(withoutChildMatchFilters(body)).keySet shouldBe Set("mixed")
    }

    it("prefilters dataset k=1 by tenant, authorization, state and publisher") {
      configure(hybrid = true, k = Some(1))
      val nearest = Some(Vector(0.0, 0.0))
      insert(
        "foreign" -> dataset(tenant = 99, vector = nearest),
        "restricted" -> dataset(owner = "hidden", vector = nearest),
        "draft" -> dataset(state = "draft", vector = nearest),
        "other-publisher" -> dataset(publisher = "Other", vector = nearest),
        "eligible" -> dataset(vector = Some(Vector(0.3, 0.3)))
      )
      search(generated(input.copy(publishers = Set(Specified("Example"))))).keySet shouldBe Set(
        "eligible"
      )
    }
  }
}
