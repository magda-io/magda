package au.csiro.data61.magda.registry

import java.util.Timer

import akka.actor.ActorRef
import akka.http.scaladsl.model.StatusCodes
import akka.pattern.ask
import akka.util.Timeout
import au.csiro.data61.magda.model.Registry.{ EventType, WebHook, WebHookConfig }

import scala.concurrent.{ Await, Promise }
import scala.concurrent.duration._
import akka.http.scaladsl.model.headers.RawHeader
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm

class WebHookActorSpec extends ApiSpec {
  implicit val timeout = Timeout(5 seconds)

  private def processAndWaitUntilDone(actor: ActorRef) = {
    actor ! WebHookActor.Process()

    Util.waitUntilDone(actor, "abc")
  }

  it("initially is not processing") { param =>
    val actor = param.webHookActor
    Await.result(actor ? WebHookActor.GetStatus("abc"), 5 seconds).asInstanceOf[WebHookActor.Status].isProcessing should be(None)
  }

  it("creates a processor for newly-created web hooks") { param =>
    val actor = param.webHookActor
    Await.result(actor ? WebHookActor.GetStatus("abc"), 5 seconds).asInstanceOf[WebHookActor.Status].isProcessing should be(None)

    val hook = WebHook(
      id = Some("abc"),
      userId = None,
      name = "abc",
      active = true,
      lastEvent = None,
      url = "http://example.com/foo",
      eventTypes = Set(EventType.CreateRecord),
      isWaitingForResponse = None,
      config = WebHookConfig(
        optionalAspects = Some(List("aspect")),
        includeEvents = Some(true),
        includeRecords = Some(true),
        includeAspectDefinitions = Some(true),
        dereference = Some(true)))

    param.asAdmin(Post("/v0/hooks", hook)) ~> param.api(Full).routes ~> check {
      status shouldEqual StatusCodes.OK
    }

    processAndWaitUntilDone(actor)

    Await.result(actor ? WebHookActor.GetStatus("abc"), 5 seconds).asInstanceOf[WebHookActor.Status].isProcessing should not be (None)
  }

  it("Will not creates a processor for newly-created disabled web hooks") { param =>
    val actor = param.webHookActor
    Await.result(actor ? WebHookActor.GetStatus("abc"), 5 seconds).asInstanceOf[WebHookActor.Status].isProcessing should be(None)

    val hook = WebHook(
      id = Some("abc"),
      userId = None,
      name = "abc",
      active = true,
      lastEvent = None,
      url = "http://example.com/foo",
      eventTypes = Set(EventType.CreateRecord),
      isWaitingForResponse = None,
      config = WebHookConfig(
        optionalAspects = Some(List("aspect")),
        includeEvents = Some(true),
        includeRecords = Some(true),
        includeAspectDefinitions = Some(true),
        dereference = Some(true)),
      enabled = false)

    param.asAdmin(Post("/v0/hooks", hook)) ~> param.api(Full).routes ~> check {
      status shouldEqual StatusCodes.OK
    }

    processAndWaitUntilDone(actor)

    Await.result(actor ? WebHookActor.GetStatus("abc"), 5 seconds).asInstanceOf[WebHookActor.Status].isProcessing should be(None)
  }

  it("removes the processor for removed web hooks") { param =>
    val actor = param.webHookActor
    val hook = WebHook(
      id = Some("abc"),
      userId = None,
      name = "abc",
      active = true,
      lastEvent = None,
      url = "http://example.com/foo",
      eventTypes = Set(EventType.CreateRecord),
      isWaitingForResponse = None,
      config = WebHookConfig(
        optionalAspects = Some(List("aspect")),
        includeEvents = Some(true),
        includeRecords = Some(true),
        includeAspectDefinitions = Some(true),
        dereference = Some(true)))

    param.asAdmin(Post("/v0/hooks", hook)) ~> param.api(Full).routes ~> check {
      status shouldEqual StatusCodes.OK
    }

    processAndWaitUntilDone(actor)

    Await.result(actor ? WebHookActor.GetStatus("abc"), 5 seconds).asInstanceOf[WebHookActor.Status].isProcessing should not be (None)

    param.asAdmin(Delete("/v0/hooks/abc")) ~> param.api(Full).routes ~> check {
      status shouldEqual StatusCodes.OK
    }

    Util.blockUntil("2") { () =>
      Await.result(actor ? WebHookActor.GetStatus("abc"), 5 seconds).asInstanceOf[WebHookActor.Status].isProcessing == None
    }

    Await.result(actor ? WebHookActor.GetStatus("abc"), 5 seconds).asInstanceOf[WebHookActor.Status].isProcessing should be(None)
  }

}
