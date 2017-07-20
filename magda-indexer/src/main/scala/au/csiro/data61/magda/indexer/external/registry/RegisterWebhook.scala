package au.csiro.data61.magda.indexer.external.registry

import scala.concurrent.Future
import au.csiro.data61.magda.indexer.external.InterfaceConfig
import akka.actor.ActorSystem
import akka.stream.Materializer
import com.typesafe.config.Config
import scala.concurrent.ExecutionContext
import au.csiro.data61.magda.model.Registry.{ WebHook, EventType, WebHookConfig }

object RegisterWebhook {
  def registerWebhook(interface: RegistryExternalInterface)(implicit config: Config, system: ActorSystem, executor: ExecutionContext, materializer: Materializer): Future[Unit] =
    new WebhookRegisterer(interface).registerWebhook

  def registerWebhook(interfaceConfig: InterfaceConfig)(implicit config: Config, system: ActorSystem, executor: ExecutionContext, materializer: Materializer): Future[Unit] =
    new WebhookRegisterer(interfaceConfig).registerWebhook()
}

private class WebhookRegisterer(interface: RegistryExternalInterface)(implicit config: Config, system: ActorSystem, executor: ExecutionContext, materializer: Materializer) {
  def this(interfaceConfig: InterfaceConfig)(implicit config: Config, system: ActorSystem, executor: ExecutionContext, materializer: Materializer) = {
    this(new RegistryExternalInterface(interfaceConfig))
  }

  def registerWebhook(): Future[Unit] = {
    val webhook = WebHook(
      name = "Indexer",
      eventTypes = Set(
        EventType.CreateRecord,
        EventType.PatchRecordAspect,
        EventType.DeleteRecord,
        EventType.CreateRecordAspect,
        EventType.PatchRecord,
        EventType.DeleteRecordAspect),
      url = config.getString("registry.webhookUrl"),
      config = WebHookConfig(
        aspects = Some(RegistryConstants.aspects),
        optionalAspects = Some(RegistryConstants.optionalAspects),
        includeRecords = Some(true),
        dereference = Some(true)),
      userId = Some(0), // TODO: Will have to change this when it becomes important
      active = true)

    interface.addWebhook(webhook).map { _ =>
      system.log.info("Successfully added webhook")

      Unit
    }.recover {
      case e: Throwable =>
        system.log.error(e, "Failed to add webhook")
        throw e
    }.map(_ => Unit)
  }
}
