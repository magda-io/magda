package au.csiro.data61.magda.indexer

import au.csiro.data61.magda.registry.{ ApiSpec => BaseRegistryApiSpec }
import au.csiro.data61.magda.registry.{ Api => RegistryApi }
import au.csiro.data61.magda.model.Registry.WebHook
import au.csiro.data61.magda.indexer.external.InterfaceConfig
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
import au.csiro.data61.magda.indexer.external.registry.RegistryExternalInterface
import scala.concurrent.Await
import scala.concurrent.duration._
import au.csiro.data61.magda.indexer.external.registry.RegistryConstants
import au.csiro.data61.magda.client.HttpFetcher
import au.csiro.data61.magda.client.HttpFetcherImpl

class RegisterWebhookSpec extends BaseRegistryApiSpec {
  implicit val config = TestActorSystem.config

  describe("indexer should register itself") {
    val interfaceConfigs = InterfaceConfig.all
    val registryConfig = interfaceConfigs("registry").copy(name = "original-registry")

    it("on startup") { param =>
      registerIndexer(param.api)
    }

    it("even if already registered") { param =>
      registerIndexer(param.api)
      registerIndexer(param.api)
    }

    def registerIndexer(registryApi: RegistryApi, aspects: List[String] = RegistryConstants.aspects, optionalAspects: List[String] = RegistryConstants.optionalAspects) = {
      val mockedFetcher = new MockedHttpFetcher(registryConfig, registryApi)
      val interface = new RegistryExternalInterface(mockedFetcher, registryConfig)(config, system, executor, materializer)

      Await.result(RegisterWebhook.registerWebhook(interface, aspects, optionalAspects), 10 seconds)

      Get("/v0/hooks") ~> registryApi.routes ~> check {
        val hooks = responseAs[Seq[WebHook]]

        hooks.size should equal(1)
        hooks.head.url should equal(config.getString("registry.webhookUrl"))
        hooks.head.config.aspects should equal(Some(aspects))
        hooks.head.config.optionalAspects should equal(Some(optionalAspects))
      }
    }
  }

  class MockedHttpFetcher(interfaceConfig: InterfaceConfig, registryApi: RegistryApi)(override implicit val system: ActorSystem,
                                                                                      override implicit val materializer: Materializer, override implicit val ec: ExecutionContext) extends HttpFetcherImpl(interfaceConfig.baseUrl) {
    override lazy val connectionFlow: Flow[(HttpRequest, Int), (Try[HttpResponse], Int), _] = {
      Flow[(HttpRequest, Int)].map {
        case (request, int) =>
          request.method.value match {
            case "POST" =>
              Post(request.uri.path.toString(), request.entity) ~> registryApi.routes ~> check {
                (Try(response), response.status.intValue())
              }
            case "GET" =>
              Get(request.uri.path.toString) ~> registryApi.routes ~> check {
                (Try(response), response.status.intValue())
              }
          }
      }
    }
  }

}