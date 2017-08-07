package au.csiro.data61.magda.registry

import akka.actor.{Actor, ActorRef, ActorSystem, Props}
import au.csiro.data61.magda.model.Registry._
import akka.http.scaladsl.Http
import akka.http.scaladsl.marshalling.Marshal
import akka.http.scaladsl.model._
import akka.pattern.pipe

object WebHookActor {
  def create(system: ActorSystem, hook: WebHook): ActorRef = {
    system.actorOf(Props(new TheActor(hook.id.get)), name = "WebHookActor-" + java.net.URLEncoder.encode(hook.id.get, "UTF-8"))
  }

  case object Process
  case object GetStatus

  case class Status(isProcessing: Boolean)

  private case class DoneProcessing(result: Option[WebHookProcessingResult], exception: Option[Throwable] = None)

  private class TheActor(private val id: String) extends Actor {
    import context.dispatcher

    private val processor = new WebHookProcessor(context.system, "http://localhost:6101/v0/", context.dispatcher)

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
        if (exception.isEmpty) {
          println(s"WebHook ${this.id} Processing: DONE")
        } else {
          println(s"WebHook ${this.id} Processing: FAILED")
          exception.get.printStackTrace()
        }

        val didSomething = result match {
          case None => false
          case Some(processingResult) => processingResult.previousLastEvent != processingResult.newLastEvent
        }

        isProcessing = false
        if (this.processAgain || didSomething) {
          this.processAgain = false
          this.self ! Process
        }
      }
    }
  }
}
