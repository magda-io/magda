package au.csiro.data61.magda.indexer

import au.csiro.data61.magda.registry.{ ApiSpec => BaseRegistryApiSpec }
import au.csiro.data61.magda.registry.{ Api => RegistryApi }
import au.csiro.data61.magda.model.Registry.WebHook
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

class RegisterWebhookSpec extends BaseRegistryApiSpec {
  implicit val config = TestActorSystem.config

  describe("indexer should register itself") {
    it("on startup") { param =>
      registerIndexer(param)
    }

    def registerIndexer(param: FixtureParam) = {
      val aspects: List[String] = RegistryConstants.aspects
      val optionalAspects: List[String] = RegistryConstants.optionalAspects

      expectAdmin(param.fetcher, true)

      (param.fetcher.put(_: String, _: WebHook, _: Seq[HttpHeader])(_: ToEntityMarshaller[WebHook])).expects(*, *, *, *).onCall((url: String, webhook: WebHook, headers: Seq[HttpHeader], marshaller: ToEntityMarshaller[WebHook]) => {
        val request = Put(url, webhook)(marshaller, param.api.ec).withHeaders(scala.collection.immutable.Seq.concat(headers))
        
        assert(webhook.id.isDefined)
        
        request ~> param.api.routes ~> check {
          Future.successful(response)
        }
      })

      val interface = new RegistryExternalInterface(param.fetcher)(config, system, executor, materializer)

      Await.result(RegisterWebhook.registerWebhook(interface, aspects, optionalAspects), 10 seconds)

      param.asAdmin(Get("/v0/hooks")) ~> param.api.routes ~> check {
        val hooks = responseAs[Seq[WebHook]]

        hooks.size should equal(1)
        hooks.head.url should equal(config.getString("registry.webhookUrl"))
        hooks.head.config.aspects should equal(Some(aspects))
        hooks.head.config.optionalAspects should equal(Some(optionalAspects))
      }
    }
  }

}