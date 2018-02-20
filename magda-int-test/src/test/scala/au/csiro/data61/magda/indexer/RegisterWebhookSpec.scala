package au.csiro.data61.magda.indexer

import au.csiro.data61.magda.registry.{ ApiSpec => BaseRegistryApiSpec, Api => RegistryApi }
import au.csiro.data61.magda.model.Registry.{ WebHook, WebHookConfig, WebHookAcknowledgement, WebHookAcknowledgementResponse }
import au.csiro.data61.magda.model.Registry.RegistryConstants
import au.csiro.data61.magda.indexer.external.registry.RegisterWebhook
import au.csiro.data61.magda.test.util.TestActorSystem
import akka.actor.ActorSystem
import akka.stream.Materializer
import scala.concurrent.ExecutionContext
import akka.stream.scaladsl.Flow
import akka.http.scaladsl.Http
import scala.util.Try
import akka.http.scaladsl.model.HttpRequest
import akka.http.scaladsl.model.HttpResponse
import akka.http.scaladsl.model.HttpMethods
import au.csiro.data61.magda.client.RegistryExternalInterface
import scala.concurrent.Await
import scala.concurrent.duration._
import au.csiro.data61.magda.client.HttpFetcher
import au.csiro.data61.magda.client.HttpFetcherImpl
import java.net.URL
import akka.http.scaladsl.model.HttpHeader
import akka.http.scaladsl.marshalling.ToEntityMarshaller
import scala.concurrent.Future
import spray.json._
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.model.StatusCodes._
import akka.http.scaladsl.marshalling.ToResponseMarshallable

class RegisterWebhookSpec extends BaseRegistryApiSpec with SprayJsonSupport {
  implicit val config = TestActorSystem.config

  describe("on startup") {
    it("should register itself if not already registered") { param =>
      expectWebHookGet(param)

      // Expect the new hook to be posted
      (param.fetcher.put(_: String, _: WebHook, _: Seq[HttpHeader])(_: ToEntityMarshaller[WebHook]))
        .expects(s"/v0/hooks/indexer", *, *, *)
        .onCall((url: String, webhook: WebHook, headers: Seq[HttpHeader], marshaller: ToEntityMarshaller[WebHook]) => {
          // Forward the req to the registry api
          expectAdminCheck(param.fetcher, true)
          val request = Put(url, webhook)(marshaller, param.api.ec).withHeaders(scala.collection.immutable.Seq.concat(headers))

          assert(webhook.id.isDefined)

          request ~> param.api.routes ~> check {
            Future.successful(response)
          }
        })

      val interface = new RegistryExternalInterface(param.fetcher)(config, system, executor, materializer)

      // Test
      val initResult = Await.result(RegisterWebhook.initWebhook(interface), 10 seconds)

      // Because the webhook was not registered already, the registry should be crawled
      initResult should be(RegisterWebhook.ShouldCrawl)

      // Make sure the new webhook was inserted correctly.
      param.asAdmin(Get("/v0/hooks")) ~> param.api.routes ~> check {
        val hooks = responseAs[Seq[WebHook]]

        hooks.size should equal(1)
        hooks.head.url should equal(config.getString("registry.webhookUrl"))
        hooks.head.config.includeEvents should equal(Some(true))
        hooks.head.config.includeRecords should equal(Some(true))
        hooks.head.config.aspects should equal(Some(RegistryConstants.aspects))
        hooks.head.config.optionalAspects should equal(Some(RegistryConstants.optionalAspects))
      }
    }

    it("should resume the webhook if already registered") { param =>
      val webhookId = config.getString("registry.webhookId")

      // Create an existing webhook
      param.asAdmin(Post("/v0/hooks", WebHook(
        id = Some(webhookId),
        name = "Indexer",
        eventTypes = Set(),
        url = config.getString("registry.webhookUrl"),
        config = WebHookConfig(
          aspects = None,
          optionalAspects = None,
          includeRecords = None,
          dereference = None),
        userId = Some(0),
        isWaitingForResponse = None,
        active = true))) ~> param.api.routes ~> check {
        status should equal(OK)
      }

      // Expect an existing webhook to be looked for.
      expectWebHookGet(param)

      // Expect the hook to update itself
      (param.fetcher.put(_: String, _: WebHook, _: Seq[HttpHeader])(_: ToEntityMarshaller[WebHook]))
        .expects(s"/v0/hooks/$webhookId", *, *, *)
        .onCall((url: String, webhook: WebHook, headers: Seq[HttpHeader], marshaller: ToEntityMarshaller[WebHook]) => {
          // Forward the req to the registry api
          expectAdminCheck(param.fetcher, true)
          val request = Put(url, webhook)(marshaller, param.api.ec).withHeaders(scala.collection.immutable.Seq.concat(headers))

          assert(webhook.id.isDefined)

          request ~> param.api.routes ~> check {
            Future.successful(response)
          }
        })

      // Expect an ACK call once the indexer has determined that the webhook already exists
      (param.fetcher.post(_: String, _: WebHookAcknowledgement, _: Seq[HttpHeader])(_: ToEntityMarshaller[WebHookAcknowledgement]))
        .expects(s"/v0/hooks/$webhookId/ack", *, *, *)
        .onCall((url: String, webhookAck: WebHookAcknowledgement, headers: Seq[HttpHeader], marshaller: ToEntityMarshaller[WebHookAcknowledgement]) => {
          // Don't forward this to the registry, just check the info passed is right.
          webhookAck.succeeded should equal(false)

          val responseObj = new WebHookAcknowledgementResponse(lastEventIdReceived = 1)

          ToResponseMarshallable(responseObj).apply(Post(url, webhookAck)(marshaller, param.api.ec).withHeaders(scala.collection.immutable.Seq.concat(headers)))
        })

      // Start the test
      val interface = new RegistryExternalInterface(param.fetcher)(config, system, executor, materializer)
      val initResult = Await.result(RegisterWebhook.initWebhook(interface), 10 seconds)

      // If the webhook was already existing, then there is no need to crawl.
      initResult should be(RegisterWebhook.ShouldNotCrawl)
    }

    def expectWebHookGet(param: FixtureParam) {
      expectAdminCheck(param.fetcher, true)
      (param.fetcher.get(_: String, _: Seq[HttpHeader])).expects(*, *).onCall((url: String, headers: Seq[HttpHeader]) => {
        val request = Get(url).withHeaders(scala.collection.immutable.Seq.concat(headers))

        request ~> param.api.routes ~> check {
          Future.successful(response)
        }
      })
    }
  }
}