package au.csiro.data61.magda.registry

import akka.actor.{Actor, ActorLogging, ActorRef, ActorSystem, Props}
import au.csiro.data61.magda.model.Registry._
import akka.pattern.pipe
import scalikejdbc.DB
import scala.concurrent.Future

object WebHookActor {
  case object Process
  case object GetStatus
  case class GetStatus(webHookId: String)

  case class Status(isProcessing: Option[Boolean])

  def props(registryApiBaseUrl: String) = Props(new AllWebHooksActor(registryApiBaseUrl))

  private def createWebHookActor(system: ActorSystem, registryApiBaseUrl: String, hook: WebHook): ActorRef = {
    system.actorOf(Props(new SingleWebHookActor(hook.id.get, registryApiBaseUrl)), name = "WebHookActor-" + java.net.URLEncoder.encode(hook.id.get, "UTF-8") + "-" + java.util.UUID.randomUUID.toString)
  }

  private case class GotAllWebHooks(webHooks: List[WebHook])
  private case class DoneProcessing(result: Option[WebHookProcessingResult], exception: Option[Throwable] = None)

  private class AllWebHooksActor(val registryApiBaseUrl: String) extends Actor with ActorLogging {
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
          this.queryForAllWebHooks().map(GotAllWebHooks(_)).pipeTo(this.self)
        }
      }
      case GetStatus => sender() ! Status(Some(this.isProcessing))
      case GetStatus(webHookId) => webHookActors.get(webHookId) match {
        case None => sender() ! WebHookActor.Status(None)
        case Some(webHookActor) => webHookActor forward WebHookActor.GetStatus
      }
      case GotAllWebHooks(webHooks) => {
        // Create a child actor for each WebHook that doesn't already have one.
        // Send a `Process` message to all existing and new WebHook actors.
        val currentHooks = webHooks.map(_.id.get).toSet
        val existingHooks = webHookActors.keySet

        // Shut down actors for WebHooks that no longer exist
        val obsoleteHooks = existingHooks.diff(currentHooks)
        obsoleteHooks.foreach { id =>
          log.info("Removing old web hook actor for {}.", id)
          this.webHookActors.get(id).get ! "kill"
          this.webHookActors -= id
        }

        // Create actors for new WebHooks and post to all actors (new and old).
        webHooks.foreach { hook =>
          val id = hook.id.get
          val actorRef = this.webHookActors.get(id) match {
            case Some(actorRef) => actorRef
            case None => {
              log.info("Creating new web hook actor for {}.", id)
              val actorRef = WebHookActor.createWebHookActor(context.system, registryApiBaseUrl, hook)
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

  private class SingleWebHookActor(val id: String, val registryApiBaseUrl: String) extends Actor with ActorLogging {
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

          log.info("WebHook {} Processing: STARTING", this.id)
          processor.sendSomeNotificationsForOneWebHook(this.id).map {
            result => DoneProcessing(Some(result))
          }.recover {
            case e => DoneProcessing(None, Some(e))
          }.pipeTo(this.self)
        }
      }
      case GetStatus => sender() ! Status(Some(this.isProcessing))
      case DoneProcessing(result, exception) => {
        if (exception.nonEmpty) {
          log.error("WebHook {} Processing: FAILED.  Exception: {}", this.id, exception.get.getStackTrace.mkString("", "\n", "\n"))
          exception.get.printStackTrace()
        }

        val runAgain = result match {
          case None => false
          case Some(WebHookProcessingResult(_, _, true, _)) => {
            // response deferred
            log.info("WebHook {} Processing: DEFERRED BY RECEIVER", this.id)
            false
          }
          case Some(WebHookProcessingResult(previousLastEvent, newLastEvent, false, _)) => {
            // POST succeeded, is there more to do?
            log.info("WebHook {} Processing: SUCCEEDED", this.id)
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
