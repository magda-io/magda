package au.csiro.data61.magda.registry

import akka.actor.{Actor, ActorRef, ActorSystem, Props}
import au.csiro.data61.magda.model.Registry._
import akka.http.scaladsl.Http
import akka.http.scaladsl.marshalling.Marshal
import akka.http.scaladsl.model._
import akka.pattern.pipe

object WebHookActor {
  def create(system: ActorSystem, registryApiBaseUrl: String, hook: WebHook): ActorRef = {
    system.actorOf(Props(new TheActor(hook.id.get, registryApiBaseUrl)), name = "WebHookActor-" + java.net.URLEncoder.encode(hook.id.get, "UTF-8"))
  }

  case object Process
  case object GetStatus

  case class Status(isProcessing: Boolean)

  private case class DoneProcessing(result: Option[WebHookProcessingResult], exception: Option[Throwable] = None)

  private class TheActor(val id: String, val registryApiBaseUrl: String) extends Actor {
    import context.dispatcher

    private val processor = new WebHookProcessor(context.system, registryApiBaseUrl, context.dispatcher)

    private var isProcessing = false
    private var processAgain = false

    def receive = {
      case Process => {
        if (this.isProcessing) {
          this.processAgain = true
        } else {
          this.isProcessing = true

          println(s"WebHook ${this.id} Processing: STARTING")
          processor.sendSomeNotificationsForOneWebHook(this.id).map {
            result => DoneProcessing(Some(result))
          }.recover {
            case e => DoneProcessing(None, Some(e))
          }.pipeTo(this.self)
        }
      }
      case GetStatus => sender() ! Status(this.isProcessing)
      case DoneProcessing(result, exception) => {
        if (exception.nonEmpty) {
          println(s"WebHook ${this.id} Processing: FAILED")
          exception.get.printStackTrace()
        }

        val runAgain = result match {
          case None => false
          case Some(WebHookProcessingResult(_, _, true, _)) => {
            // response deferred
            println(s"WebHook ${this.id} Processing: DEFERRED")
            false
          }
          case Some(WebHookProcessingResult(previousLastEvent, newLastEvent, false, _)) => {
            // POST succeeded, is there more to do?
            println(s"WebHook ${this.id} Processing: SUCCEEDED")
            previousLastEvent != newLastEvent
          }
        }

        isProcessing = false
        if (this.processAgain || runAgain) {
          this.processAgain = false
          this.self ! Process
        }
      }
    }
  }
}
