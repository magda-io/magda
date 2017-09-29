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

    it("except if already registered") { param =>
      registerIndexer(param)
      registerIndexer(param, false)
    }

    def registerIndexer(param: FixtureParam, shouldPostNew: Boolean = true) = {
      val aspects: List[String] = RegistryConstants.aspects
      val optionalAspects: List[String] = RegistryConstants.optionalAspects

      (param.fetcher.get _).expects("/v0/hooks", *).onCall((url: String, headers: Seq[HttpHeader]) => {
        val request = Get(url).withHeaders(scala.collection.immutable.Seq.concat(headers))
        request ~> param.api.routes ~> check {
          Future.successful(response)
        }
      })
      expectAdmin(param.fetcher, true)

      if (shouldPostNew) {
        expectAdmin(param.fetcher, true)
        (param.fetcher.post(_: String, _: WebHook, _: Seq[HttpHeader])(_: ToEntityMarshaller[WebHook])).expects(*, *, *, *).onCall((url: String, webhook: WebHook, headers: Seq[HttpHeader], marshaller: ToEntityMarshaller[WebHook]) => {
          val request = Post(url, webhook)(marshaller, param.api.ec).withHeaders(scala.collection.immutable.Seq.concat(headers))
          request ~> param.api.routes ~> check {
            Future.successful(response)
          }
        })
      }

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