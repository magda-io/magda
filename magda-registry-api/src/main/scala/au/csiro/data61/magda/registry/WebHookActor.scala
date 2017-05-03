package au.csiro.data61.magda.registry

import akka.actor.{Actor, Props}
import au.csiro.data61.magda.model.Registry._
import akka.http.scaladsl.Http
import akka.http.scaladsl.marshalling.Marshal
import akka.http.scaladsl.model._
import akka.pattern.pipe

object WebHookActor {
  def props() = Props(new TheActor())

  case object Process
  case object GetStatus

  case class Status(isProcessing: Boolean)

  private case class DoneProcessing(result: Map[WebHook, WebHookProcessingResult])

  private class TheActor extends Actor {
    import context.dispatcher

    private val processor = new WebHookProcessor(context.system, context.dispatcher)

    private var isProcessing = false
    private var processAgain = false

    def receive = {
      case Process => {
        if (this.isProcessing) {
          this.processAgain = true
        } else {
          this.isProcessing = true
          println("WebHook Processing: STARTING")
          processor.sendNotifications().map(DoneProcessing(_)).pipeTo(this.self)
        }
      }
      case GetStatus => sender() ! Status(this.isProcessing)
      case DoneProcessing(_) => {
        println("WebHook Processing: DONE")
        isProcessing = false
        if (this.processAgain) {
          this.processAgain = false
          this.self ! Process
        }
      }
    }
  }
}
