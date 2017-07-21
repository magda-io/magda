package au.csiro.data61.magda.indexer.external.registry

import scala.concurrent.Future
import au.csiro.data61.magda.indexer.external.InterfaceConfig
import akka.actor.ActorSystem
import akka.stream.Materializer
import com.typesafe.config.Config
import scala.concurrent.ExecutionContext
import au.csiro.data61.magda.model.Registry.{ WebHook, EventType, WebHookConfig }

object RegisterWebhook {
  def registerWebhook(interface: RegistryExternalInterface)(
    implicit config: Config,
    system: ActorSystem,
    executor: ExecutionContext,
    materializer: Materializer): Future[Unit] = registerWebhook(interface, RegistryConstants.aspects, RegistryConstants.optionalAspects)

  def registerWebhook(
    interface: RegistryExternalInterface,
    aspects: List[String],
    optionalAspects: List[String])(
      implicit config: Config,
      system: ActorSystem,
      executor: ExecutionContext,
      materializer: Materializer): Future[Unit] =
    new WebhookRegisterer(interface, aspects, optionalAspects).registerWebhook

  def registerWebhook(interfaceConfig: InterfaceConfig)(
    implicit config: Config,
    system: ActorSystem,
    executor: ExecutionContext,
    materializer: Materializer): Future[Unit] = registerWebhook(interfaceConfig, RegistryConstants.aspects, RegistryConstants.optionalAspects)

  def registerWebhook(
    interfaceConfig: InterfaceConfig,
    aspects: List[String],
    optionalAspects: List[String])(
      implicit config: Config, system: ActorSystem, executor: ExecutionContext, materializer: Materializer): Future[Unit] =
    new WebhookRegisterer(interfaceConfig, aspects, optionalAspects).registerWebhook()
}

private class WebhookRegisterer(
    interface: RegistryExternalInterface,
    aspects: List[String],
    optionalAspects: List[String])(implicit config: Config, system: ActorSystem, executor: ExecutionContext, materializer: Materializer) {
  def this(interfaceConfig: InterfaceConfig,
           aspects: List[String],
           optionalAspects: List[String])(implicit config: Config, system: ActorSystem, executor: ExecutionContext, materializer: Materializer) = {
    this(new RegistryExternalInterface(interfaceConfig), aspects, optionalAspects)
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
