package au.csiro.data61.magda.client

import akka.actor.ActorSystem
import akka.http.scaladsl.model._
import org.scalamock.scalatest.AsyncMockFactory
import org.scalatest.{FunSpec, AsyncFunSpec, Matchers, Assertion}
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.model.headers.RawHeader
import akka.http.scaladsl.marshalling.ToEntityMarshaller
import akka.stream.ActorMaterializer
import akka.util.ByteString
import au.csiro.data61.magda.model.Auth
import au.csiro.data61.magda.util.StringUtils._
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.model.misc.Protocols.dataSetFormat
import com.typesafe.config.ConfigFactory
import spray.json._

import scala.util.Random
import scala.concurrent.Future
import io.lemonlabs.uri.RelativeUrl

import scala.io.BufferedSource
import scala.io.Source.fromFile

class AuthApiClientSpec
    extends AsyncFunSpec
    with Matchers
    with AsyncMockFactory
    with SprayJsonSupport {

  implicit val system = ActorSystem()
  implicit def executor = system.dispatcher
  implicit val materializer = ActorMaterializer()

  val logger = akka.event.Logging.getLogger(system, getClass)

  val testConfigSource = s"""
                            |authApi.baseUrl = "http://localhost:6104"
    """.stripMargin

  implicit val testConfig = ConfigFactory.parseString(testConfigSource)

  val defaultAllowResponse = HttpResponse(
    entity = HttpEntity(
      MediaTypes.`application/json`,
      ByteString(
        s"""
           |{
           |  "hasResidualRules" : false,
           |  "result": true,
           |  "hasWarns": false
           |}
           |""".stripMargin
      )
    )
  )

  describe(
    "getAuthDecision should send GET request when there is no complex request data"
  ) {
    it("should send correct path and include correct X-Magda-Session header") {
      val mockFetcher = mock[HttpFetcher]
      val jwtVal = Random.alphanumeric.take(10).mkString
      (mockFetcher.get _)
        .expects(*, *)
        .onCall { (path, headers) =>
          path shouldBe "/v0/opa/decision/object/record/read"
          headers shouldBe List(RawHeader("X-Magda-Session", jwtVal))
          Future(defaultAllowResponse)
        }
        .once()
      val client = new AuthApiClient(mockFetcher)
      val resFuture = client.getAuthDecision(
        Some(jwtVal),
        AuthDecisionReqConfig("object/record/read")
      )
      resFuture.map { decision =>
        decision.hasWarns shouldBe false
        decision.hasResidualRules shouldBe false
        decision.result shouldBe Some(JsTrue)
        decision.residualRules shouldBe None
        decision.warns shouldBe None
      }
    }

    it(
      "should send correct path without X-Magda-Session header when None is supplied for JWT"
    ) {
      val mockFetcher = mock[HttpFetcher]
      (mockFetcher.get _)
        .expects(*, *)
        .onCall { (path, headers) =>
          path shouldBe "/v0/opa/decision/object/record/read"
          headers shouldBe Nil
          Future(defaultAllowResponse)
        }
        .once()
      val client = new AuthApiClient(mockFetcher)
      client
        .getAuthDecision(
          None,
          AuthDecisionReqConfig("object/record/read")
        )
        .map(_ => succeed)
    }

    it("should process query string params correctly") {
      val mockFetcher = mock[HttpFetcher]
      (mockFetcher.get _)
        .expects(*, *)
        .onCall { (path, headers) =>
          val url = RelativeUrl.parse(path)
          url.path.toString shouldBe "/v0/opa/decision/object/record/read"
          url.query.params("rawAst") shouldBe List(None)
          url.query.params("explain") shouldBe List(Some("full"))
          url.query.params("humanReadable") shouldBe List(None)
          url.query.params("pretty") shouldBe List(Some("true"))
          url.query.params("concise") shouldBe List(Some("false"))
          headers shouldBe Nil
          Future(defaultAllowResponse)
        }
        .once()
      val client = new AuthApiClient(mockFetcher)
      client
        .getAuthDecision(
          None,
          AuthDecisionReqConfig(
            "object/record/read",
            rawAst = Some(true),
            explain = Some("full"),
            humanReadable = Some(true),
            pretty = Some(true),
            concise = Some(false)
          )
        )
        .map(_ => succeed)
    }

  }

  describe(
    "Test getAuthDecision when `authorization.skipOpaQuery` config option is on"
  ) {
    it(
      "should not contact OPA and give positive (`true`) response straight away"
    ) {
      implicit val testConfig = ConfigFactory.parseString(s"""
                                                             |authApi.baseUrl = "http://localhost:6104"
                                                             |authorization.skipOpaQuery = true
    """.stripMargin)
      val mockFetcher = mock[HttpFetcher]
      val jwtVal = Random.alphanumeric.take(10).mkString
      (mockFetcher.get _)
        .expects(*, *)
        .onCall { (path, headers) =>
          Future(
            // response false here as authorization.skipOpaQuery` = true
            // this false response should not be used
            HttpResponse(
              entity = HttpEntity(
                MediaTypes.`application/json`,
                ByteString(
                  s"""
                     |{
                     |  "hasResidualRules" : false,
                     |  "result": false,
                     |  "hasWarns": false
                     |}
                     |""".stripMargin
                )
              )
            )
          )
        }
        .never()

      val client = new AuthApiClient(mockFetcher)
      val resFuture = client.getAuthDecision(
        Some(jwtVal),
        AuthDecisionReqConfig("object/someObject/someOperation")
      )
      resFuture.map { decision =>
        decision.hasWarns shouldBe false
        decision.hasResidualRules shouldBe false
        decision.result shouldBe Some(JsTrue)
        decision.residualRules shouldBe None
        decision.warns shouldBe None
      }
    }
  }

  describe(
    "getAuthDecision should send POST request when it's required to include complex request data"
  ) {
    it("should send correct path and include correct X-Magda-Session header") {
      val mockFetcher = mock[HttpFetcher]
      val jwtVal = Random.alphanumeric.take(10).mkString
      val operationUri = "object/record/read"
      val inputVal = Some(
        JsObject(
          "object" -> JsObject(
            "record" -> DataSet(
              identifier = "xxx",
              tenantId = 0,
              quality = 0,
              catalog = None,
              score = None
            ).toJson
          )
        )
      )

      (mockFetcher
        .post[JsValue](_: String, _: JsValue, _: Seq[HttpHeader], _: Boolean)(
          _: ToEntityMarshaller[JsValue]
        ))
        .expects(*, *, *, *, *)
        .onCall {
          (
              path,
              payload,
              headers,
              autoRetry,
              marshaller: ToEntityMarshaller[JsValue]
          ) =>
            val url = RelativeUrl.parse(path)
            url.path.toString shouldBe "/v0/opa/decision"
            url.query.params("rawAst") shouldBe List(None)
            url.query.params("explain") shouldBe List(Some("full"))
            url.query.params("humanReadable") shouldBe List(None)
            url.query.params("pretty") shouldBe List(Some("true"))
            url.query.params("concise") shouldBe List(Some("false"))
            headers shouldBe List(RawHeader("X-Magda-Session", jwtVal))
            autoRetry shouldBe true
            payload shouldBe JsObject(
              "input" -> inputVal.get,
              "operationUri" -> JsString(operationUri),
              "unknowns" -> JsArray(
                JsString("object/record"),
                JsString("object/recordTest")
              ),
              "resourceUri" -> JsString("object/record")
            )
            Future(defaultAllowResponse)
        }
        .once()
      val client = new AuthApiClient(mockFetcher)

      val resFuture = client.getAuthDecision(
        Some(jwtVal),
        AuthDecisionReqConfig(
          operationUri,
          rawAst = Some(true),
          explain = Some("full"),
          humanReadable = Some(true),
          pretty = Some(true),
          concise = Some(false),
          input = inputVal,
          unknowns = Some(List("object/record", "object/recordTest")),
          resourceUri = Some("object/record")
        )
      )

      resFuture.map { decision =>
        decision.hasWarns shouldBe false
        decision.hasResidualRules shouldBe false
        decision.result shouldBe Some(JsTrue)
        decision.residualRules shouldBe None
        decision.warns shouldBe None
      }
    }

    it(
      "should send correct path without X-Magda-Session header when None is supplied for JWT"
    ) {
      val mockFetcher = mock[HttpFetcher]
      val operationUri = "object/record/read"
      (mockFetcher
        .post[JsValue](_: String, _: JsValue, _: Seq[HttpHeader], _: Boolean)(
          _: ToEntityMarshaller[JsValue]
        ))
        .expects(*, *, *, *, *)
        .onCall {
          (
              path,
              payload,
              headers,
              autoRetry,
              marshaller: ToEntityMarshaller[JsValue]
          ) =>
            val url = RelativeUrl.parse(path)
            url.path.toString shouldBe "/v0/opa/decision"
            url.query.params.length shouldBe 0
            headers shouldBe Nil
            autoRetry shouldBe true
            payload shouldBe JsObject(
              "input" -> JsObject("test" -> JsTrue),
              "operationUri" -> JsString(operationUri)
            )
            Future(defaultAllowResponse)
        }
        .once()
      val client = new AuthApiClient(mockFetcher)
      client
        .getAuthDecision(
          None,
          AuthDecisionReqConfig(
            "object/record/read",
            input = Some(JsObject("test" -> JsTrue)),
            unknowns = None
          )
        )
        .map(_ => succeed)
    }

  }

  describe(
    "Test getAuthDecision behaviours around `unknowns` parameters"
  ) {
    it(
      "should send `unknowns` as a query parameter (as part of GET request) when `unknowns` is an empty list (Nil)"
    ) {
      val mockFetcher = mock[HttpFetcher]
      val jwtVal = Random.alphanumeric.take(10).mkString
      val operationUri = "object/record/read"

      (mockFetcher.get _)
        .expects(*, *)
        .onCall {
          (
              path,
              headers
          ) =>
            val url = RelativeUrl.parse(path)
            url.path.toString shouldBe "/v0/opa/decision/object/record/read"
            url.query.params("rawAst") shouldBe List(None)
            url.query.params("explain") shouldBe List(Some("full"))
            url.query.params("humanReadable") shouldBe List(None)
            url.query.params("pretty") shouldBe List(Some("true"))
            url.query.params("concise") shouldBe List(Some("false"))
            url.query.params("unknowns") shouldBe List(Some(""))
            headers shouldBe List(RawHeader("X-Magda-Session", jwtVal))
            Future(defaultAllowResponse)
        }
        .once()
      val client = new AuthApiClient(mockFetcher)

      val resFuture = client.getAuthDecision(
        Some(jwtVal),
        AuthDecisionReqConfig(
          operationUri,
          rawAst = Some(true),
          explain = Some("full"),
          humanReadable = Some(true),
          pretty = Some(true),
          concise = Some(false),
          unknowns = Some(Nil)
        )
      )

      resFuture.map { decision =>
        decision.hasWarns shouldBe false
        decision.hasResidualRules shouldBe false
        decision.result shouldBe Some(JsTrue)
        decision.residualRules shouldBe None
        decision.warns shouldBe None
      }
    }

    it(
      "should send `unknowns` as a query parameter (as part of POST request) when `unknowns` is an empty list (Nil)"
    ) {
      val mockFetcher = mock[HttpFetcher]
      val jwtVal = Random.alphanumeric.take(10).mkString
      val operationUri = "object/record/read"
      val inputVal = Some(
        JsObject(
          "object" -> JsObject(
            "record" -> DataSet(
              identifier = "xxx",
              tenantId = 0,
              quality = 0,
              catalog = None,
              score = None
            ).toJson
          )
        )
      )

      (mockFetcher
        .post[JsValue](_: String, _: JsValue, _: Seq[HttpHeader], _: Boolean)(
          _: ToEntityMarshaller[JsValue]
        ))
        .expects(*, *, *, *, *)
        .onCall {
          (
              path,
              payload,
              headers,
              autoRetry,
              marshaller: ToEntityMarshaller[JsValue]
          ) =>
            val url = RelativeUrl.parse(path)
            url.path.toString shouldBe "/v0/opa/decision"
            url.query.params("rawAst") shouldBe List(None)
            url.query.params("explain") shouldBe List(Some("full"))
            url.query.params("humanReadable") shouldBe List(None)
            url.query.params("pretty") shouldBe List(Some("true"))
            url.query.params("concise") shouldBe List(Some("false"))
            url.query.params("unknowns") shouldBe List(Some(""))
            headers shouldBe List(RawHeader("X-Magda-Session", jwtVal))
            autoRetry shouldBe true
            payload shouldBe JsObject(
              "input" -> inputVal.get,
              "operationUri" -> JsString(operationUri),
              "resourceUri" -> JsString("object/record")
            )
            Future(defaultAllowResponse)
        }
        .once()
      val client = new AuthApiClient(mockFetcher)

      val resFuture = client.getAuthDecision(
        Some(jwtVal),
        AuthDecisionReqConfig(
          operationUri,
          rawAst = Some(true),
          explain = Some("full"),
          humanReadable = Some(true),
          pretty = Some(true),
          concise = Some(false),
          input = inputVal,
          unknowns = Some(Nil),
          resourceUri = Some("object/record")
        )
      )

      resFuture.map { decision =>
        decision.hasWarns shouldBe false
        decision.hasResidualRules shouldBe false
        decision.result shouldBe Some(JsTrue)
        decision.residualRules shouldBe None
        decision.warns shouldBe None
      }
    }

  }

  describe(
    "getAuthDecision should unmarshal auth decision correctly"
  ) {

    val opaSampleResponseFolder =
      "magda-typescript-common/src/test/sampleAuthDecisions/"

    def testSampleResponse(
        fileName: String,
        checkFunc: (Auth.AuthDecision) => Assertion
    ) = {
      val jsonResSource: BufferedSource = fromFile(
        opaSampleResponseFolder + fileName
      )
      val jsonRes: String =
        try {
          jsonResSource.mkString
        } finally {
          jsonResSource.close()
        }
      it(s"should unmarshal `${fileName}` correctly") {
        val mockFetcher = mock[HttpFetcher]
        (mockFetcher.get _)
          .expects(*, *)
          .onCall { (path, headers) =>
            Future(
              HttpResponse(
                entity = HttpEntity(
                  MediaTypes.`application/json`,
                  ByteString(jsonRes)
                )
              )
            )
          }
          .once()
        val client = new AuthApiClient(mockFetcher)
        client
          .getAuthDecision(
            None,
            AuthDecisionReqConfig("object/someObject/someOperation")
          )
          .map(decison => checkFunc(decison))
      }
    }

    testSampleResponse(
      "simple.json",
      decision => {
        decision.hasWarns shouldBe false
        decision.warns shouldBe None
        decision.hasResidualRules shouldBe true
        decision.result shouldBe None
        decision.residualRules.isDefined shouldBe true
        decision.residualRules.get.length shouldBe 1
        val rule = decision.residualRules.get.head
        rule.default shouldBe false
        rule.value shouldBe JsTrue
        rule.expressions.length shouldBe 1
        val exp = rule.expressions.head
        exp.negated shouldBe false
        exp.operator shouldBe Some("=")
        exp.operands.length shouldBe 2
        exp.operands(0).isRef shouldBe true
        exp.operands(0).value shouldBe JsString("input.object.content.id")
        exp.operands(1).isRef shouldBe false
        exp.operands(1).value shouldBe JsString("header/navigation/datasets")
      }
    )

    testSampleResponse(
      "singleTermAspectRef.json",
      decision => {
        decision.hasWarns shouldBe false
        decision.warns shouldBe None
        decision.hasResidualRules shouldBe true
        decision.result shouldBe None
        decision.residualRules.isDefined shouldBe true
        decision.residualRules.get.length shouldBe 1
        val rule = decision.residualRules.get.head
        rule.default shouldBe false
        rule.value shouldBe JsTrue
        rule.expressions.length shouldBe 2
        var exp = rule.expressions(0)
        exp.negated shouldBe false
        exp.operator shouldBe None
        exp.operands.length shouldBe 1
        exp.operands(0).isRef shouldBe true
        exp.operands(0).value shouldBe JsString(
          "input.object.record.dcat-dataset-strings"
        )

        exp = rule.expressions(1)
        exp.negated shouldBe false
        exp.operator shouldBe Some("=")
        exp.operands.length shouldBe 2
        exp.operands(0).isRef shouldBe true
        exp.operands(0).value shouldBe JsString(
          "input.object.record.publishing.state"
        )
        exp.operands(1).isRef shouldBe false
        exp.operands(1).value shouldBe JsString("published")

        val aspectQueryGroups = decision
          .toAspectQueryGroups(Set("input.object.record"))
        val groupSqlList = aspectQueryGroups
          .map(_.toSql())
        groupSqlList.length shouldBe 1
        groupSqlList.head.isDefined shouldBe true
        groupSqlList.head.get.value.trim.stripLineEndingWhitespaces shouldBe
          """exists (SELECT 1 FROM recordaspects where (aspectid, recordid, tenantid)=(?, "records"."recordid", "records"."tenantid")) and  exists (SELECT 1 FROM recordaspects where (aspectid, recordid, tenantid)=(?, "records"."recordid", "records"."tenantid") and
            |             COALESCE((data #>> string_to_array(?, ','))::TEXT = ?::TEXT, false)
            |          )
            |""".trim.stripMargin.stripLineEndingWhitespaces
        groupSqlList.head.get.parameters shouldBe Seq(
          "dcat-dataset-strings",
          "publishing",
          "state",
          "published"
        )
      }
    )

    testSampleResponse(
      "unconditionalTrue.json",
      decision => {
        decision.hasWarns shouldBe false
        decision.warns shouldBe None
        decision.hasResidualRules shouldBe false
        decision.result shouldBe Some(JsTrue)
        decision.residualRules.isDefined shouldBe false
      }
    )

    testSampleResponse(
      "unconditionalFalseSimple.json",
      decision => {
        decision.hasWarns shouldBe false
        decision.warns shouldBe None
        decision.hasResidualRules shouldBe false
        decision.result shouldBe Some(JsFalse)
        decision.residualRules.isDefined shouldBe false
      }
    )

  }

}
