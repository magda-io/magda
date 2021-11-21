package au.csiro.data61.magda.client

import akka.actor.ActorSystem
import akka.http.scaladsl.model._
import org.scalamock.scalatest.MockFactory
import org.scalatest.{FunSpec, Matchers}
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.model.headers.RawHeader
import akka.stream.ActorMaterializer
import akka.util.ByteString
import com.typesafe.config.ConfigFactory
import spray.json.JsTrue

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

}
