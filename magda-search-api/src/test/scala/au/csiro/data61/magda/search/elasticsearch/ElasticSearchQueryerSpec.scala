package au.csiro.data61.magda.search.elasticsearch

import java.time.OffsetDateTime

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
import au.csiro.data61.magda.model.misc.{QueryRegion, Region}
import au.csiro.data61.magda.search.SearchStrategy.MatchAll
import com.sksamuel.elastic4s.{ElasticClient, ElasticProperties}
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.http.JavaClient
import com.sksamuel.elastic4s.requests.searches.queries.{Query => EsQuery}
import com.typesafe.config.{Config, ConfigFactory}
import org.scalatest.{BeforeAndAfterAll, BeforeAndAfterEach, FunSpec, Matchers}
import spray.json._

import scala.concurrent.{Await, ExecutionContext, Future}
import scala.concurrent.duration._

class ElasticSearchQueryerSpec
    extends FunSpec
    with Matchers
    with BeforeAndAfterEach
    with BeforeAndAfterAll {

  implicit val config: Config = ConfigFactory
    .parseString("""
                   |elasticSearch.indices.datasets.hybridSearch {
                   |  enabled = true
                   |  k = 10
                   |}
                   |""".stripMargin)
    .withFallback(AppConfig.conf())
  implicit val system: ActorSystem =
    ActorSystem("ElasticSearchQueryerSpec", config)
  implicit val ec: ExecutionContext = system.dispatcher
  implicit val materializer: ActorMaterializer = ActorMaterializer()

  // JavaClient does not connect until execute is called. Only show is used here.
  private val client = ElasticClient(
    JavaClient(ElasticProperties("http://127.0.0.1:1"))
  )
  implicit val clientProvider: ClientProvider = new ClientProvider {
    override def getClient(): Future[ElasticClient] = Future.successful(client)
  }
  private val noHttp = new HttpFetcher {
    private def unexpected(): Nothing =
      throw new AssertionError(
        "Building a search query must not make HTTP requests"
      )
    override def get(
        path: String,
        headers: Seq[HttpHeader]
    ): Future[HttpResponse] =
      unexpected()
    override def post[T](
        path: String,
        payload: T,
        headers: Seq[HttpHeader],
        autoRetryConnection: Boolean
    )(implicit m: ToEntityMarshaller[T]): Future[HttpResponse] = unexpected()
    override def put[T](
        path: String,
        payload: T,
        headers: Seq[HttpHeader],
        autoRetryConnection: Boolean
    )(implicit m: ToEntityMarshaller[T]): Future[HttpResponse] = unexpected()
  }
  implicit val embeddingClient: EmbeddingApiClient = new EmbeddingApiClient(
    noHttp
  )
  private val queryer = new ElasticSearchQueryer()
  private var previousHybridConfig: Option[Config] = None

  override protected def beforeEach(): Unit = {
    super.beforeEach()
    previousHybridConfig = HybridSearchConfig._conf
    HybridSearchConfig.setAppConfig(config)
  }

  override protected def afterEach(): Unit = {
    try HybridSearchConfig._conf = previousHybridConfig
    finally super.afterEach()
  }

  override protected def afterAll(): Unit = {
    try client.close()
    finally {
      try Await.result(system.terminate(), 10.seconds)
      finally super.afterAll()
    }
  }

  private def hybridEnabled(enabled: Boolean): Unit =
    HybridSearchConfig.setAppConfig(
      ConfigFactory
        .parseString(s"${HybridSearchConfig.configPath}.enabled = $enabled")
        .withFallback(config)
    )

  private val allow = SearchAuthDecision(
    UnconditionalTrueDecision,
    UnconditionalTrueDecision
  )
  private val vector = Array(0.1, 0.2, 0.3)
  private def input: Query = Query(
    freeText = Some("water quality"),
    freeTextVector = Some(vector),
    hybridSearch = true,
    authDecision = Some(allow),
    tenantId = Some(SpecifiedTenantId(BigInt(17))),
    publishingState = Set(Specified("published"))
  )

  private def restrictedDecision(target: String, owner: String): AuthDecision =
    AuthDecision(
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
                negated = false,
                operator = Some("="),
                operands = Vector(
                  ConciseOperand(
                    true,
                    JsString(s"input.object.$target.access-control.ownerId")
                  ),
                  ConciseOperand(false, JsString(owner))
                )
              )
            )
          )
        )
      )
    )

  private def withFacets(q: Query): Query = q.copy(
    publishers = Set(Specified("Example Publisher")),
    dateFrom = Some(Specified(OffsetDateTime.parse("2020-01-01T00:00:00Z"))),
    dateTo = Some(Specified(OffsetDateTime.parse("2024-01-01T00:00:00Z"))),
    formats = Set(Specified("CSV")),
    regions = Set(Specified(Region(QueryRegion("STE", "1"))))
  )

  // show includes the HTTP method and URL before its JSON request body.
  private def requestBody(shown: String): JsValue =
    shown.dropWhile(_ != '{').parseJson

  private def build(q: Query): JsValue =
    requestBody(client.show(queryer.buildQuery(q, 0, 10, MatchAll)).query)

  private def render(q: EsQuery): JsValue =
    requestBody(client.show(search("unused").query(q)).query).asJsObject
      .fields("query")

  private def field(value: JsValue, name: String): JsValue =
    value.asJsObject.fields(name)

  private def items(value: JsValue): Vector[JsValue] = value match {
    case JsArray(values) => values
    case other           => Vector(other)
  }

  // Traverse objects rather than matching serialized strings or depending on field order.
  private def objects(value: JsValue): Vector[JsObject] = value match {
    case obj: JsObject =>
      Vector(obj) ++ obj.fields.values.toVector.flatMap(objects)
    case JsArray(values) => values.flatMap(objects)
    case _               => Vector.empty
  }

  private def named(value: JsValue, name: String): Vector[JsValue] =
    objects(value).flatMap(_.fields.get(name))

  private def only(values: Vector[JsValue]): JsValue = {
    values should have size 1
    values.head
  }

  private def knnFilter(body: JsValue, vectorField: String): JsValue = {
    val payload = only(
      named(body, "knn").flatMap(_.asJsObject.fields.get(vectorField))
    )
    field(payload, "vector") shouldBe JsArray(vector.toVector.map(JsNumber(_)))
    field(payload, "k") shouldBe JsNumber(10)
    field(payload, "filter")
  }

  private def outerFilters(body: JsValue): Vector[JsValue] = {
    val functionQuery = field(field(body, "query"), "function_score")
    val must = items(
      field(field(field(functionQuery, "query"), "bool"), "must")
    )
    val outer = only(must)
    items(field(field(outer, "bool"), "filter"))
  }

  private def distributionKeyword(body: JsValue): JsValue =
    only(named(body, "nested").filter { nested =>
      field(nested, "path") == JsString("distributions") &&
      named(field(nested, "query"), "simple_query_string").nonEmpty
    })

  private def childAccessClauses(q: Query): Vector[JsValue] = Vector(
    render(q.tenantId.map(_.getEsQuery(true)).getOrElse(matchAllQuery())),
    render(q.authDecision.get.getDistributionDecisionQuery),
    render(
      Queries
        .publishingStateQuery(q.publishingState, true)
        .getOrElse(matchAllQuery())
    )
  )

  // Allow a filter bool to be passed directly or wrapped in another bool.filter.
  private def filterConjunction(query: JsValue): Vector[JsValue] = query match {
    case JsObject(fields) if fields.keySet == Set("bool") =>
      val bool = fields("bool").asJsObject.fields
      if (bool.keySet == Set("filter"))
        items(bool("filter")).flatMap(filterConjunction)
      else Vector(query)
    case _ => Vector(query)
  }

  private def assertChildOnly(filter: JsValue, q: Query): Unit = {
    filterConjunction(filter) should contain theSameElementsAs childAccessClauses(
      q
    )
    named(filter, "nested") shouldBe empty
    val keys = objects(filter).flatMap(_.fields.keys).toSet
    keys should not contain "tenantId"
    keys should not contain "publishingState"
    keys.exists(_.startsWith("publisher.")) shouldBe false
    keys.exists(_.startsWith("temporal.")) shouldBe false
    keys.exists(_.startsWith("spatial.")) shouldBe false
    keys.exists(_.startsWith("distributions.format")) shouldBe false
  }

  private def assertKeywordAccess(
      body: JsValue,
      q: Query,
      operator: String
  ): Unit = {
    val nested = distributionKeyword(body)
    field(nested, "score_mode") shouldBe JsString("max")
    val bool = field(field(nested, "query"), "bool")
    val scoring = only(items(field(bool, "must")))
    val text = field(scoring, "simple_query_string")
    field(text, "default_operator")
      .asInstanceOf[JsString]
      .value
      .toLowerCase shouldBe operator
    field(text, "query") shouldBe JsString(
      q.freeText.filter(_.trim.nonEmpty).getOrElse("*")
    )
    named(scoring, "simple_query_string") should have size 1
    assertChildOnly(
      JsObject("bool" -> JsObject("filter" -> field(bool, "filter"))),
      q
    )
    named(field(bool, "filter"), "simple_query_string") shouldBe empty
  }

  private def assertParentFacets(filter: JsValue): Unit = {
    val keys = objects(filter).flatMap(_.fields.keys).toSet
    keys should contain("publisher.name.keyword_lowercase")
    keys should contain("temporal.start.date")
    keys should contain("temporal.end.date")
    keys should contain("spatial.geoJson")
    val format = only(named(filter, "nested").filter { nested =>
      named(nested, "match").exists(
        _.asJsObject.fields.contains("distributions.format.quote")
      )
    })
    field(format, "path") shouldBe JsString("distributions")
  }

  describe("issue #3886: dataset and distribution search filter contexts") {
    it(
      "filters dataset kNN by dataset access and parent facets, but distribution kNN by child access only"
    ) {
      val q = withFacets(
        input.copy(
          authDecision = Some(
            SearchAuthDecision(
              restrictedDecision("dataset", "dataset-owner"),
              restrictedDecision("distribution", "distribution-owner")
            )
          )
        )
      )
      val body = build(q)
      named(body, "hybrid") should have size 2
      val datasetFilter = knnFilter(body, "queryContextVector")
      val datasetClauses = filterConjunction(datasetFilter)
      datasetClauses should contain(render(q.tenantId.get.getEsQuery()))
      datasetClauses should contain(
        render(q.authDecision.get.getDatasetDecisionQuery)
      )
      datasetClauses should contain(
        render(Queries.publishingStateQuery(q.publishingState).get)
      )
      assertParentFacets(datasetFilter)
      assertParentFacets(JsArray(outerFilters(body)))
      // The dataset candidate filter must be the same conjunction as the outer
      // dataset constraints, except for the optional distribution inner-hits query.
      val parentClauses =
        outerFilters(body).filterNot(v => named(v, "inner_hits").nonEmpty)
      datasetClauses should contain theSameElementsAs parentClauses

      // OpenSearch 2.19.1 evaluates this filter on the nested child document.
      // Root publisher/date/spatial and another nested format query would form
      // an impossible conjunction here; those facets belong on the parent.
      val childFilter = knnFilter(body, "distributions.queryContextVector")
      assertChildOnly(childFilter, q)
      val childKeys = objects(childFilter).flatMap(_.fields.keys).toSet
      childKeys should contain("distributions.accessControl.ownerId")
      childKeys should not contain "accessControl.ownerId"
      childFilter.compactPrint should include("distribution-owner")
      childFilter.compactPrint should not include "dataset-owner"
      assertKeywordAccess(body, q, "or")
    }

    Seq(("minScore", "min_score", 0.7), ("maxDistance", "max_distance", 1.5))
      .foreach {
        case (configKey, queryKey, threshold) =>
          it(
            s"keeps radial $configKey access filters outside kNN but inside the correct document context"
          ) {
            HybridSearchConfig.setAppConfig(
              ConfigFactory
                .parseString(s"""
                                |${HybridSearchConfig.configPath} {
                                |  k = null
                                |  minScore = null
                                |  maxDistance = null
                                |  $configKey = $threshold
                                |}
                                |""".stripMargin)
                .withFallback(config)
            )
            val q = withFacets(
              input.copy(
                authDecision = Some(
                  SearchAuthDecision(
                    restrictedDecision("dataset", "dataset-owner"),
                    restrictedDecision("distribution", "distribution-owner")
                  )
                )
              )
            )
            val body = build(q)
            named(body, "knn") should have size 2
            named(body, "knn").foreach { knn =>
              val payload =
                only(knn.asJsObject.fields.values.toVector).asJsObject.fields
              payload(queryKey) shouldBe JsNumber(threshold)
              payload("vector") shouldBe JsArray(
                vector.toVector.map(JsNumber(_))
              )
              payload.keySet should not contain "k"
              payload.keySet should not contain "filter"
              payload.keySet should not contain (if (queryKey == "min_score")
                                                   "max_distance"
                                                 else "min_score")
            }

            // OpenSearch 2.19.1 rewrites nontrivial inline radial filters with
            // k=0, which invalidates min_score/max_distance. Keep a sibling
            // bool.filter instead, without moving child filters to the root.
            def wrapper(vectorField: String): JsValue =
              only(named(body, "bool").filter { bool =>
                bool.asJsObject.fields.get("must").exists { must =>
                  items(must).exists {
                    case JsObject(fields) =>
                      fields
                        .get("knn")
                        .exists(_.asJsObject.fields.contains(vectorField))
                    case _ => false
                  }
                }
              })

            val datasetWrapper = wrapper("queryContextVector")
            val datasetFilter = JsObject(
              "bool" -> JsObject("filter" -> field(datasetWrapper, "filter"))
            )
            val datasetClauses = filterConjunction(datasetFilter)
            datasetClauses should contain(render(q.tenantId.get.getEsQuery()))
            datasetClauses should contain(
              render(q.authDecision.get.getDatasetDecisionQuery)
            )
            datasetClauses should contain(
              render(Queries.publishingStateQuery(q.publishingState).get)
            )
            assertParentFacets(datasetFilter)
            datasetClauses should contain theSameElementsAs outerFilters(body)
              .filterNot(v => named(v, "inner_hits").nonEmpty)

            val childWrapper = wrapper("distributions.queryContextVector")
            val nested = only(named(body, "nested").filter { nested =>
              named(field(nested, "query"), "knn").exists(
                _.asJsObject.fields.contains("distributions.queryContextVector")
              )
            })
            field(nested, "path") shouldBe JsString("distributions")
            field(field(nested, "query"), "bool") shouldBe childWrapper
            assertChildOnly(
              JsObject(
                "bool" -> JsObject("filter" -> field(childWrapper, "filter"))
              ),
              q
            )
            assertKeywordAccess(body, q, "or")
            assertParentFacets(JsArray(outerFilters(body)))
          }
      }

    Seq((false, true, "and"), (true, false, "or")).foreach {
      case (enabled, hasVector, operator) =>
        it(
          s"keeps keyword child access filters when hybrid enabled=$enabled and vector present=$hasVector"
        ) {
          hybridEnabled(enabled)
          val q = withFacets(
            input.copy(freeTextVector = if (hasVector) Some(vector) else None)
          )
          val body = build(q)
          named(body, "knn") shouldBe empty
          named(body, "hybrid") shouldBe empty
          assertKeywordAccess(body, q, operator)
          assertParentFacets(JsArray(outerFilters(body)))
        }
    }

    Seq("*", "   ").foreach { text =>
      it(
        s"does not generate kNN for wildcard or blank text '$text', even with a vector"
      ) {
        val q = input.copy(freeText = Some(text))
        val body = build(q)
        named(body, "knn") shouldBe empty
        named(body, "hybrid") shouldBe empty
        assertKeywordAccess(body, q, "or")
      }
    }

    it(
      "keeps parent constraints without any text scoring when free text is absent"
    ) {
      val q = withFacets(input.copy(freeText = None))
      val body = build(q)
      named(body, "knn") shouldBe empty
      named(body, "simple_query_string") shouldBe empty
      val filters = outerFilters(body)
      filters should contain(render(q.tenantId.get.getEsQuery()))
      filters should contain(render(q.authDecision.get.getDatasetDecisionQuery))
      filters should contain(
        render(Queries.publishingStateQuery(q.publishingState).get)
      )
      assertParentFacets(JsArray(filters))
    }

    it(
      "treats publishing '*' as no state restriction without discarding tenant or residual auth filters"
    ) {
      val q = input.copy(
        publishingState = Set(Specified("*")),
        authDecision = Some(
          SearchAuthDecision(
            restrictedDecision("dataset", "dataset-owner"),
            restrictedDecision("distribution", "distribution-owner")
          )
        )
      )
      val body = build(q)
      val datasetFilter = knnFilter(body, "queryContextVector")
      filterConjunction(datasetFilter) should contain(
        render(q.tenantId.get.getEsQuery())
      )
      filterConjunction(datasetFilter) should contain(
        render(q.authDecision.get.getDatasetDecisionQuery)
      )
      named(body, "term").flatMap(_.asJsObject.fields.keys) should not contain "publishingState"
      named(body, "term").flatMap(_.asJsObject.fields.keys) should not contain "distributions.publishingState"
      assertChildOnly(knnFilter(body, "distributions.queryContextVector"), q)
      assertKeywordAccess(body, q, "or")
    }

    it("treats missing distribution states as published, but not as draft") {
      val legacyPublished = render(
        boolQuery().not(existsQuery("distributions.publishingState"))
      )
      val published = render(
        Queries.publishingStateQuery(Set(Specified("published")), true).get
      )
      items(field(field(published, "bool"), "should")) should contain(
        legacyPublished
      )
      val draft = render(
        Queries.publishingStateQuery(Set(Specified("draft")), true).get
      )
      named(draft, "exists") shouldBe empty
      val root = render(
        Queries.publishingStateQuery(Set(Specified("published"))).get
      )
      named(root, "exists") shouldBe empty
    }

    Seq(true, false).foreach { denyDataset =>
      it(
        s"does not replace a deny auth decision with match_all (dataset denied=$denyDataset)"
      ) {
        val q = input.copy(
          authDecision = Some(
            SearchAuthDecision(
              if (denyDataset) UnconditionalFalseDecision
              else UnconditionalTrueDecision,
              if (denyDataset) UnconditionalTrueDecision
              else UnconditionalFalseDecision
            )
          )
        )
        val body = build(q)
        named(knnFilter(body, "queryContextVector"), "match_none").nonEmpty shouldBe denyDataset
        val child = knnFilter(body, "distributions.queryContextVector")
        named(child, "match_none").nonEmpty shouldBe !denyDataset
        assertChildOnly(child, q)
        assertKeywordAccess(body, q, "or")
        named(
          JsArray(
            outerFilters(body).filterNot(v => named(v, "inner_hits").nonEmpty)
          ),
          "match_none"
        ).nonEmpty shouldBe denyDataset
      }
    }

    Seq(None, Some(AllTenantsId), Some(SpecifiedTenantId(BigInt(29)))).foreach {
      tenant =>
        it(
          s"preserves the requested tenant scope $tenant independently in root and child candidates"
        ) {
          val q = input.copy(tenantId = tenant)
          val body = build(q)
          val datasetFilter = knnFilter(body, "queryContextVector")
          val childFilter = knnFilter(body, "distributions.queryContextVector")
          val rootTerms =
            named(datasetFilter, "term").flatMap(_.asJsObject.fields.keys)
          val childTerms =
            named(childFilter, "term").flatMap(_.asJsObject.fields.keys)
          rootTerms.contains("tenantId") shouldBe tenant.exists(
            !_.isAllTenants()
          )
          rootTerms should not contain "distributions.tenantId"
          childTerms.contains("distributions.tenantId") shouldBe tenant.exists(
            !_.isAllTenants()
          )
          assertChildOnly(childFilter, q)
          assertKeywordAccess(body, q, "or")
        }
    }
  }
}
