package au.csiro.data61.magda.client

import akka.actor.ActorSystem
import akka.http.scaladsl.model._
import org.scalamock.scalatest.AsyncMockFactory
import org.scalatest.{Assertion, AsyncFunSpec, FunSpec, Matchers}
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.model.headers.RawHeader
import akka.http.scaladsl.marshalling.ToEntityMarshaller
import akka.http.scaladsl.unmarshalling.Unmarshal
import akka.stream.ActorMaterializer
import akka.util.ByteString
import au.csiro.data61.magda.model.Auth
import au.csiro.data61.magda.util.StringUtils._
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.model.misc.Protocols.dataSetFormat
import com.typesafe.config.ConfigFactory
import spray.json._

import scala.util.Random
import scala.concurrent.{ExecutionContext, Future}
import io.lemonlabs.uri.RelativeUrl

import scala.io.BufferedSource
import scala.io.Source.fromFile

class EmbeddingApiClientSpec
    extends AsyncFunSpec
    with Matchers
    with AsyncMockFactory
    with SprayJsonSupport {

  implicit val system = ActorSystem()
  implicit def executor = system.dispatcher
  implicit val materializer = ActorMaterializer()

  val logger = akka.event.Logging.getLogger(system, getClass)
  val apiBaseUrl = "http://embedding:1234"

  val testConfigSource = s"""
                            |embeddingApi.baseUrl = "${apiBaseUrl}"
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

  it("should generate embedding for single string correctly") {
    val mockFetcher = mock[HttpFetcher]
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
          url.path.toString shouldBe "/v1/embeddings"
          autoRetry shouldBe true
          payload shouldBe JsObject(
            "input" -> JsString("water")
          )
          Future(
            HttpResponse(
              entity = HttpEntity(
                MediaTypes.`application/json`,
                ByteString(
                  s"""
                     |{
                     |    "object": "list",
                     |    "data": [
                     |        {
                     |            "index": 0,
                     |            "embedding": [
                     |                -0.009185866452753544,
                     |                -0.0004821882175747305,
                     |                0.0016574059845879674
                     |            ],
                     |            "object": "embedding"
                     |        }
                     |    ],
                     |    "model": "xxxxxxxx",
                     |    "usage": {
                     |        "prompt_tokens": 3,
                     |        "total_tokens": 3
                     |    }
                     |}
                     |""".stripMargin
                )
              )
            )
          )
      }
      .once()

    (mockFetcher
      .jsonResponse(
        _: HttpResponse,
        _: Option[String],
        _: Option[String]
      )(
        _: ActorSystem,
        _: ExecutionContext
      ))
      .expects(*, *, *, *, *)
      .onCall { (res, url, method, _, _) =>
        url shouldBe Some("/v1/embeddings")
        method shouldBe Some("POST")
        Unmarshal(res).to[JsValue]
      }

    val client = new EmbeddingApiClient(mockFetcher)

    val resFuture = client.get("water")

    resFuture.map { data =>
      data shouldBe Array[Double](
        -0.009185866452753544,
        -0.0004821882175747305,
        0.0016574059845879674
      )
    }
  }

  it("should generate embedding for string list correctly") {
    val mockFetcher = mock[HttpFetcher]
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
          url.path.toString shouldBe "/v1/embeddings"
          autoRetry shouldBe true
          payload shouldBe JsObject(
            "input" -> JsArray(Vector(JsString("water"), JsString("xxxx")))
          )
          Future(
            HttpResponse(
              entity = HttpEntity(
                MediaTypes.`application/json`,
                ByteString(
                  s"""
                     |{
                     |    "object": "list",
                     |    "data": [
                     |        {
                     |            "index": 0,
                     |            "embedding": [
                     |                -0.020101817324757576,
                     |                0.0005228497320786119,
                     |                -0.0030158436857163906
                     |            ],
                     |            "object": "embedding"
                     |        },
                     |        {
                     |            "index": 1,
                     |            "embedding": [
                     |                -0.011855090036988258,
                     |                -0.028210392221808434,
                     |                -0.06542911380529404
                     |            ],
                     |            "object": "embedding"
                     |        }
                     |    ],
                     |    "model": "xxxxxxx",
                     |    "usage": {
                     |        "prompt_tokens": 8,
                     |        "total_tokens": 8
                     |    }
                     |}
                     |""".stripMargin
                )
              )
            )
          )
      }
      .once()

    (mockFetcher
      .jsonResponse(
        _: HttpResponse,
        _: Option[String],
        _: Option[String]
      )(
        _: ActorSystem,
        _: ExecutionContext
      ))
      .expects(*, *, *, *, *)
      .onCall { (res, url, method, _, _) =>
        url shouldBe Some("/v1/embeddings")
        method shouldBe Some("POST")
        Unmarshal(res).to[JsValue]
      }

    val client = new EmbeddingApiClient(mockFetcher)

    val resFuture = client.get(List("water", "xxxx"))

    resFuture.map { data =>
      data shouldBe Array(
        Array[Double](
          -0.020101817324757576,
          0.0005228497320786119,
          -0.0030158436857163906
        ),
        Array[Double](
          -0.011855090036988258,
          -0.028210392221808434,
          -0.06542911380529404
        )
      )
    }
  }

}
