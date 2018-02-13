package au.csiro.data61.magda.registry

import akka.actor.ActorRef
import akka.pattern.ask
import scala.concurrent.duration._
import scala.concurrent.Await
import akka.util.Timeout

object Util {
  implicit val timeout = Timeout(5 seconds)

  def blockUntil(explain: String)(predicate: () => Boolean): Unit = {

    var backoff = 0
    var done = false

    while (backoff <= 16 && !done) {
      if (backoff > 0) Thread.sleep(200 * backoff)
      backoff = backoff + 1
      try {
        done = predicate()
      } catch {
        case e: Throwable =>
          println("problem while testing predicate")
          e.printStackTrace()
      }
    }

    require(done, s"Failed waiting on: $explain")
  }

  def waitUntilDone(actor: ActorRef, hookName: String) = {
    val start = System.currentTimeMillis()
    while (System.currentTimeMillis < start + 2000 && Await.result(actor ? WebHookActor.GetStatus(hookName), 5 seconds).asInstanceOf[WebHookActor.Status].isProcessing == Some(false)) {

    }

    Util.blockUntil("Hook is finished processing") { () =>
      val result = Await.result(actor ? WebHookActor.GetStatus(hookName), 5 seconds).asInstanceOf[WebHookActor.Status].isProcessing
      !result.getOrElse(false)
    }
  }
}