package au.csiro.data61.magda.indexer.external

import scala.concurrent.ExecutionContext
import scala.concurrent.ExecutionContextExecutor
import scala.concurrent.Future

import akka.actor.ActorSystem
import akka.stream.Materializer
import au.csiro.data61.magda.model.Temporal._
import au.csiro.data61.magda.model.misc._
import java.net.URL
import au.csiro.data61.magda.indexer.external.csw.CSWExternalInterface
import au.csiro.data61.magda.indexer.external.ckan.CKANExternalInterface
import au.csiro.data61.magda.indexer.external.registry.RegistryExternalInterface
import com.typesafe.config.Config

object ExternalInterface {

  def apply(interfaceConfig: InterfaceConfig)(implicit config: Config, system: ActorSystem, executor: ExecutionContext, materializer: Materializer): ExternalInterface =
    interfaceConfig.interfaceType match {
      case "CKAN" => new CKANExternalInterface(interfaceConfig, config, system, executor, materializer)
      case "CSW"  => CSWExternalInterface(interfaceConfig)
      case "MAGDA"  => new RegistryExternalInterface(interfaceConfig, config, system, executor, materializer)
      case _      => throw new RuntimeException(s"Could not find interface implementation for ${interfaceConfig.interfaceType}")
    }
}

trait ExternalInterface {
  def getInterfaceConfig(): InterfaceConfig
  def getDataSets(start: Long = 0, number: Int = 10): Future[List[DataSet]]
  def getTotalDataSetCount(): Future[Long]
}
