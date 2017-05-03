package au.csiro.data61.magda.registry

import akka.pattern.ask
import akka.util.Timeout

import scala.concurrent.Await
import scala.concurrent.duration._

class WebHookActorSpec extends ApiSpec {
  implicit val timeout = Timeout(5 seconds)

  it("initially is not processing") { param =>
    val actor = system.actorOf(WebHookActor.props)
    Await.result(actor ? WebHookActor.GetStatus, 5 seconds).asInstanceOf[WebHookActor.Status].isProcessing shouldBe false
  }
}
