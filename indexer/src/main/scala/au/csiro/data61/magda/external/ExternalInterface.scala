package au.csiro.data61.magda.external

import scala.concurrent.ExecutionContext
import scala.concurrent.ExecutionContextExecutor
import scala.concurrent.Future

import akka.actor.ActorSystem
import akka.stream.Materializer
import au.csiro.data61.magda.model.temporal._
import au.csiro.data61.magda.model.misc._
import java.net.URL
import au.csiro.data61.magda.external.csw.CSWExternalInterface
import au.csiro.data61.magda.external.ckan.CKANExternalInterface
import com.typesafe.config.Config

object ExternalInterface {
  object ExternalInterfaceType extends Enumeration {
    type ExternalInterfaceType = Value
    val CKAN, CSW = Value
  }
  import ExternalInterfaceType._

  def apply(interfaceConfig: InterfaceConfig)(implicit config: Config, system: ActorSystem, executor: ExecutionContext, materializer: Materializer): ExternalInterface = interfaceConfig.interfaceType match {
    case CKAN => new CKANExternalInterface(interfaceConfig, config, system, executor, materializer)
    case CSW  => CSWExternalInterface(interfaceConfig)
  }
}

trait ExternalInterface {
  def getDataSets(start: Long = 0, number: Int = 10): Future[List[DataSet]]
  def getTotalDataSetCount(): Future[Long]
}