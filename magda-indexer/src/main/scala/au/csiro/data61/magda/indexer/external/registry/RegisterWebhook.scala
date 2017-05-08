package au.csiro.data61.magda.indexer.external.registry

import scala.concurrent.Future
import au.csiro.data61.magda.indexer.external.InterfaceConfig
import akka.actor.ActorSystem
import akka.stream.Materializer
import com.typesafe.config.Config
import scala.concurrent.ExecutionContext
import au.csiro.data61.magda.model.Registry.{ WebHook, EventType, WebHookConfig }

object RegisterWebhook {
  def registerWebhook(interfaceConfig: InterfaceConfig)(implicit config: Config, system: ActorSystem, executor: ExecutionContext, materializer: Materializer): Future[Unit] = {
    val interface = new RegistryExternalInterface(interfaceConfig)

    registerWebhook(interface)
  }

  def registerWebhook(interface: RegistryExternalInterface)(implicit config: Config, system: ActorSystem, executor: ExecutionContext, materializer: Materializer): Future[Unit] = {
    interface.getWebhooks().map { webHooks =>
      webHooks.find(hook => hook.url == config.getString("registry.webhookUrl"))
    } flatMap {
      case Some(hook) => Future(Unit) //all good
      case None       => registerIndexerWebhook(interface)
    }
  }

  def registerIndexerWebhook(interface: RegistryExternalInterface)(implicit ec: ExecutionContext, config: Config): Future[Unit] = {
    val webhook = WebHook(
      name = "Indexer",
      eventTypes = Set(
        EventType.CreateRecord,
        EventType.PatchRecordAspect,
        EventType.DeleteRecord,
        EventType.CreateRecordAspect,
        EventType.PatchRecord,
        EventType.DeleteRecordAspect
      ),
      url = config.getString("registry.webhookUrl"),
      config = WebHookConfig(
        aspects = Some(List(
          "dcat-dataset-strings",
          "source"
        )),
        optionalAspects = Some(List(
          "dataset-distributions"
        )),
        includeRecords = Some(true),
        dereference = Some(true)
      ),
      userId = Some(0), // TODO: Will have to change this when it becomes important
      active = true
    )

    interface.addWebhook(webhook).map(_ => Unit)
  }
}