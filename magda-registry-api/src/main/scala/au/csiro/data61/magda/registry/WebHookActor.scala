package au.csiro.data61.magda.registry

import java.time.OffsetDateTime

import akka.actor.{Actor, ActorLogging, ActorRef, ActorSystem, Props}
import au.csiro.data61.magda.model.Registry._
import akka.pattern.pipe
import akka.pattern.ask
import scalikejdbc.DB

import scala.concurrent.Future
import scala.concurrent.Await
import scala.concurrent.duration._
import au.csiro.data61.magda.util.ErrorHandling
import akka.stream.OverflowStrategy
import akka.stream.scaladsl.Source
import akka.stream.scaladsl.SourceQueue
import akka.stream.scaladsl.Sink
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.SourceQueueWithComplete
import akka.stream.DelayOverflowStrategy
import akka.stream.Attributes
import com.typesafe.config.Config
import akka.actor.ActorContext
import akka.util.Timeout
import scala.util.control.NonFatal

object WebHookActor {
  case class Process(ignoreWaitingForResponse: Boolean = false,
                     aspectIds: Option[List[String]] = None,
                     webHookId: Option[String] = None)
  case class GetStatus(webHookId: String)
  case class UpdateHookStatus(webHookId: String,
                              isRunning: Boolean,
                              isProcessing: Boolean)
  case object InvalidateWebhookCache
  case object RetryInactiveHooks

  val defaultWebHooksRetryInterval: Long = 600000

  case class Status(isProcessing: Option[Boolean])

  def props(registryApiBaseUrl: String,
            webHooksRetryInterval: Long = defaultWebHooksRetryInterval)(
      implicit config: Config) =
    Props(new AllWebHooksActor(registryApiBaseUrl, webHooksRetryInterval))

  private def createWebHookActor(
      context: ActorContext,
      registryApiBaseUrl: String,
      hook: WebHook,
      forceWakeUpInterval: Long)(implicit config: Config): ActorRef = {
    context.actorOf(
      Props(
        new SingleWebHookActor(hook.id.get,
                               registryApiBaseUrl,
                               forceWakeUpInterval)),
      name = "WebHookActor-" + java.net.URLEncoder
        .encode(hook.id.get, "UTF-8") + "-" + java.util.UUID.randomUUID.toString
    )
  }

  private case class GotAllWebHooks(webHooks: List[WebHook], startup: Boolean)
  private case class DoneProcessing(result: Option[WebHookProcessingResult],
                                    exception: Option[Throwable] = None)

  private class AllWebHooksActor(
      val registryApiBaseUrl: String,
      val webHooksRetryInterval: Long)(implicit val config: Config)
      extends Actor
      with ActorLogging {
    import context.dispatcher

    private var webHookActors = Map[String, ActorRef]()
    var webHooks = Map[String, WebHook]()
    //    private var cachedWebhooks: Option[List[WebHook]] = None
    private implicit val scheduler = this.context.system.scheduler

    def setup =
      Await.result(
        ErrorHandling
          .retry(
            () => Future { queryForAllWebHooks() },
            30 seconds,
            10,
            (retryCount, e) =>
              log.error(e,
                        "Failed to get webhooks, {} retries left until I crash",
                        retryCount))
          .recover {
            case (e: Throwable) =>
              log.error(e, "Failed to get webhooks for processing")
              // This is a massive deal. Let it crash and let kubernetes deal with it.
              System.exit(1)
              throw e
          }
          .map { webHooks =>
            // Create a child actor for each WebHook that doesn't already have one.
            // Send a `Process` message to all existing and new WebHook actors.
            val currentHooks =
              webHooks.filter(_.active).filter(_.enabled).map(_.id.get).toSet
            val existingHooks = webHookActors.keySet

            // Shut down actors for WebHooks that no longer exist
            val obsoleteHooks = existingHooks.diff(currentHooks)
            obsoleteHooks.foreach { id =>
              log.info("Removing old web hook actor for {}.", id)
              this.webHookActors.get(id).get ! "kill"
              this.webHookActors -= id
              this.webHooks -= id
            } // Create actors for new WebHooks and post to all actors (new and old).
            webHooks.filter(_.active).filter(_.enabled).foreach {
              hook =>
                val id = hook.id.get
                val actorRef = this.webHookActors.get(id) match {
                  case Some(actorRef) => actorRef
                  case None => {
                    log.info("Creating new web hook actor for {}.", id)
                    val actorRef =
                      WebHookActor.createWebHookActor(context,
                                                      registryApiBaseUrl,
                                                      hook,
                                                      webHooksRetryInterval)
                    this.webHookActors += (id -> actorRef)
                    this.webHooks += (id -> hook.copy(
                      isRunning = Some(true),
                      isProcessing = Some(false)
                    ))
                    actorRef
                  }
                }
            }
          },
        10 minutes
      )

    setup

    scheduler.schedule(500 milliseconds,
                       webHooksRetryInterval milliseconds,
                       self,
                       RetryInactiveHooks)

    def getStatus(webHookId: String): WebHookActor.Status = {
      webHooks.get(webHookId) match {
        case None                => WebHookActor.Status(None)
        case Some(hook: WebHook) => WebHookActor.Status(hook.isProcessing)
      }
    }

    def receive = {

      case RetryInactiveHooks =>
        retryAllInactiveHooks(webHooksRetryInterval)

      case InvalidateWebhookCache =>
        log.info("Invalidated webhook cache")
        setup
      case Process(ignoreWaitingForResponse, aspectIds, webHookId) => {
        val actors = webHookId match {
          case None                 => webHookActors.values
          case Some(webHookIdInner) => webHookActors.get(webHookIdInner).toList
        }

        actors.foreach(actorRef =>
          actorRef ! Process(ignoreWaitingForResponse, aspectIds))
      }
      case UpdateHookStatus(webHookId, isRunning, isProcessing) => {
        webHooks.get(webHookId) match {
          case Some(hook: WebHook) =>
            webHooks += (webHookId -> hook.copy(
              isRunning = Some(isRunning),
              isProcessing = Some(isProcessing)
            ))
          case _ => Nil
        }
      }
      case GetStatus(webHookId) => sender() ! getStatus(webHookId)

    }

    private def retryAllInactiveHooks(retryInterval: Long): Unit = {

      log.info("Start to retry all inactive webhooks...")

      val hooks = DB readOnly { implicit session =>
        HookPersistence.getAll(session).filter(_.enabled)
      }

      val hookIds = hooks
        .map { hook =>
          if (!hook.active) {
            hook.copy(
              isProcessing = Some(false),
              isRunning = Some(false)
            )
          } else {
            val status = getStatus(hook.id.get)
            hook.copy(
              isRunning = Some(!status.isProcessing.isEmpty),
              isProcessing = Some(status.isProcessing.getOrElse(false))
            )
          }
        }
        .filter { hook =>
          if (hook.active && hook.isRunning.get) {
            false
          } else {
            if (hook.lastRetryTime.isEmpty) true
            else {
              val expectedDiff = Math.pow(2, hook.retryCount) * retryInterval / 1000
              val isOutOfBackoffTimeWin = OffsetDateTime.now
                .minusSeconds(expectedDiff.toLong)
                .isAfter(hook.lastRetryTime.get)
              if (!isOutOfBackoffTimeWin) {
                log.info(
                  s"Skip retry ${hook.id} as it is still in backoff time window. Last retry time: ${hook.lastRetryTime.get}..")
              }
              isOutOfBackoffTimeWin
            }
          }
        }
        .flatMap(_.id.toList)

      if (hookIds.size > 0) {
        log.info(
          s"Invalidate Webhook Cache for retry ${hookIds.size} inactive hooks...")
        DB localTx { implicit session =>
          hookIds.foreach(hookId => HookPersistence.retry(session, hookId))
        }
        setup
        log.info("Sending Process message...")
        self ! Process(true)
        log.info("Completed retry all inactive webhooks.")
      } else {
        log.info(
          "Completed retry all inactive webhooks: No inactive webhook need to be restarted...")
      }

    }

    private def queryForAllWebHooks(): List[WebHook] = {
      DB readOnly { implicit session =>
        HookPersistence.getAll(session)
      }
    }
  }

  private class SingleWebHookActor(val id: String,
                                   val registryApiBaseUrl: String,
                                   forceWakeUpInterval: Long =
                                     defaultWebHooksRetryInterval)(
      implicit val config: Config)
      extends Actor
      with ActorLogging {

    case object WakeUp

    import context.dispatcher

    val MAX_EVENTS = 100

    private val processor = new WebHookProcessor(context.system,
                                                 registryApiBaseUrl,
                                                 context.dispatcher)
    implicit val materializer = ActorMaterializer()

    private var isProcessing: Boolean = false
    private var currentQueueLength = 0

    def getWebhook() =
      DB readOnly { implicit session =>
        HookPersistence.getById(session, id) match {
          case None =>
            throw new RuntimeException(s"No WebHook with ID ${id} was found.")
          case Some(webHook) => webHook
        }
      }

    def notifyHookStatus() = {
      val currentlyIsProcessing = (currentQueueLength != 0)
      if (isProcessing != currentlyIsProcessing) {
        isProcessing = currentlyIsProcessing
        context.parent ! UpdateHookStatus(id, true, isProcessing)
      }
    }

    private val indexQueue: SourceQueueWithComplete[Boolean] =
      Source
        .queue[Boolean](0, OverflowStrategy.dropNew)
        .map { x =>
          currentQueueLength += 1
          notifyHookStatus()
          x
        }
        .delay(config.getInt("webhookActorTickRate") milliseconds,
               OverflowStrategy.backpressure)
        .withAttributes(Attributes.inputBuffer(1, 1)) // Make sure we only execute once per webhookActorTickRate to prevent sending an individual post for every event.
        .mapAsync(1) { ignoreWaitingForResponse =>
          try {
            val webHook = getWebhook()

            if (!ignoreWaitingForResponse && webHook.isWaitingForResponse
                  .getOrElse(false)) {
              log.info(
                "Skipping WebHook {} as it's marked as waiting for response",
                webHook.id)
              Future.successful(false)
            } else {
              val aspects = webHook.config.aspects ++ webHook.config.optionalAspects

              val eventPage = DB readOnly { implicit session =>
                EventPersistence.getEvents(
                  session,
                  webHook.lastEvent,
                  None,
                  Some(MAX_EVENTS),
                  None,
                  None,
                  (webHook.config.aspects ++ webHook.config.optionalAspects).flatten.toSet,
                  webHook.eventTypes)
              }

              val previousLastEvent = webHook.lastEvent
              val lastEvent = eventPage.events.lastOption.flatMap(_.id)

              if (lastEvent.isEmpty) {
                log.info("WebHook {}: Up to date at event {}",
                         this.id,
                         previousLastEvent)
                Future.successful(false)
              } else {
                log.info("WebHook {} Processing {}-{}: STARTING",
                         this.id,
                         previousLastEvent,
                         lastEvent)

                processor
                  .sendSomeNotificationsForOneWebHook(this.id,
                                                      webHook,
                                                      eventPage)
                  .map {
                    case WebHookProcessor.Deferred =>
                      // response deferred
                      log.info(
                        "WebHook {} Processing {}-{}: DEFERRED BY RECEIVER",
                        this.id,
                        previousLastEvent,
                        lastEvent)
                    case WebHookProcessor.NotDeferred =>
                      // POST succeeded, is there more to do?
                      log.info("WebHook {} Processing {}-{}: DELIVERED",
                               this.id,
                               previousLastEvent,
                               lastEvent)

                      if (previousLastEvent != lastEvent) {
                        self ! Process()
                      }
                    case WebHookProcessor.HttpError(status) =>
                      // encountered an error while communicating with the hook recipient - deactivate the hook until its manually fixed
                      log.info(
                        "WebHook {} Processing {}-{}: HTTP FAILURE {}, DEACTIVATING",
                        this.id,
                        previousLastEvent,
                        lastEvent,
                        status.reason())
                      context.parent ! InvalidateWebhookCache
                  }
                  .recover {
                    case e =>
                      // Error communicating with the hook recipient - log the failure and wait until the next Process() call to resume.
                      log.error(e,
                                "WebHook {} Processing {}-{}: FAILED",
                                this.id,
                                previousLastEvent,
                                lastEvent)
                  }
              }
            }
          } catch {
            // --- make only capture nonFatal error
            // --- So that fatal error can still terminate JVM
            case NonFatal(e) => Future.successful(false)
          }
        }
        .map { x =>
          currentQueueLength -= 1
          notifyHookStatus()
          x
        }
        .to(Sink.ignore)
        .run()

    context.system.scheduler.schedule(forceWakeUpInterval milliseconds,
                                      forceWakeUpInterval milliseconds,
                                      self,
                                      WakeUp)

    def receive = {
      case Process(ignoreWaitingForResponse, _, _) => {
        indexQueue.offer(ignoreWaitingForResponse)
      }
      case WakeUp =>
        if (currentQueueLength == 0) {
          log.info("Force to wake up idle WebHook {}...", this.id)
          indexQueue.offer(true)
        }
      case GetStatus =>
        sender() ! Status(Some(currentQueueLength != 0))
    }
  }
}
