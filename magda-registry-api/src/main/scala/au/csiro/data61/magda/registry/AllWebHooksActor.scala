package au.csiro.data61.magda.registry

import akka.Done
import akka.actor.{Actor, ActorRef, Props}
import au.csiro.data61.magda.model.Registry._
import akka.pattern.pipe
import akka.stream.scaladsl.Source
import scalikejdbc._

import scala.concurrent.Future

object AllWebHooksActor {
  def props() = Props(new TheActor())

  case object Process
  private case class GotAllWebHooks(webHooks: List[WebHook])

  private class TheActor extends Actor {
    import context.dispatcher

    private var isProcessing = false
    private var processAgain = false
    private var webHookActors = Map[String, ActorRef]()

    def receive = {
      case Process => {
        if (this.isProcessing) {
          this.processAgain = true
        } else {
          this.isProcessing = true
          println("Getting webhooks")
          this.queryForAllWebHooks().map(GotAllWebHooks(_)).pipeTo(this.self)
        }
      }
      case GotAllWebHooks(webHooks) => {
        println("Got webhooks")
        // Create a child actor for each WebHook that doesn't already have one.
        // Send a `Process` message to all existing and new WebHook actors.
        val currentHooks = webHooks.map(_.id.get).toSet
        val existingHooks = webHookActors.keySet

        // Shut down actors for WebHooks that no longer exist
        val obsoleteHooks = existingHooks.diff(currentHooks)
        obsoleteHooks.foreach { id =>
          println(s"Removing old webhook actor for ${id}")
          this.webHookActors.get(id).get ! "kill"
          this.webHookActors -= id
        }

        // Create actors for new WebHooks and post to all actors (new and old).
        webHooks.foreach { hook =>
          val id = hook.id.get
          val actorRef = this.webHookActors.get(id) match {
            case Some(actorRef) => actorRef
            case None => {
              println(s"Creating new webhook actor for ${id}")
              val actorRef = WebHookActor.create(context.system, hook)
              this.webHookActors += (id -> actorRef)
              actorRef
            }
          }
          actorRef ! WebHookActor.Process
        }

        isProcessing = false
        if (this.processAgain) {
          this.processAgain = false
          this.self ! Process
        }
      }
    }

    private def queryForAllWebHooks(): Future[List[WebHook]] = {
      Future[List[WebHook]] {
        // Find all WebHooks
        DB readOnly { implicit session =>
          HookPersistence.getAll(session)
        }
      }
    }
  }
}
