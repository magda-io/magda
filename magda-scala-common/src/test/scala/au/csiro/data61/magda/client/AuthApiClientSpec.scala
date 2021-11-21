package au.csiro.data61.magda.client

import akka.actor.ActorSystem
import akka.http.scaladsl.model._
import org.scalamock.scalatest.MockFactory
import org.scalatest.{FunSpec, Matchers}
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.model.headers.RawHeader
import akka.http.scaladsl.marshalling.ToEntityMarshaller
import akka.stream.ActorMaterializer
import akka.util.ByteString
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.model.misc.Protocols.dataSetFormat
import com.typesafe.config.ConfigFactory
import spray.json._

import scala.util.Random
import scala.concurrent.Future
import io.lemonlabs.uri.RelativeUrl

class AuthApiClientSpec
    extends FunSpec
    with Matchers
    with MockFactory
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
      client.getAuthDecision(
        None,
        AuthDecisionReqConfig("object/record/read")
      )
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
      client.getAuthDecision(
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
              "operationUri" -> JsString(operationUri),
              "unknowns" -> JsArray()
            )
            Future(defaultAllowResponse)
        }
        .once()
      val client = new AuthApiClient(mockFetcher)
      client.getAuthDecision(
        None,
        AuthDecisionReqConfig(
          "object/record/read",
          input = Some(JsObject("test" -> JsTrue)),
          unknowns = Some(Nil)
        )
      )
    }

  }

}
