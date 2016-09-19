package au.csiro.data61.magda.external

import scala.concurrent.ExecutionContext
import scala.concurrent.ExecutionContextExecutor
import scala.concurrent.Future

import akka.actor.ActorSystem
import akka.stream.Materializer
import au.csiro.data61.magda.model.temporal._
import au.csiro.data61.magda.model.misc._
import java.net.URL

object ExternalInterface {
  object ExternalInterfaceType extends Enumeration {
    type ExternalInterfaceType = Value
    val CKAN, CSW = Value
  }
  import ExternalInterfaceType._

  def apply(interfaceConfig: InterfaceConfig)(implicit system: ActorSystem, executor: ExecutionContext, materializer: Materializer): ExternalInterface = interfaceConfig.interfaceType match {
    case CKAN => new CKANExternalInterface(interfaceConfig, system, executor, materializer)
    //    case CSW  => new CSWExternalInterface()
  }
}

trait ExternalInterface {
  def getDataSets(start: Long = 0, number: Int = 10): Future[List[DataSet]]
  def getTotalDataSetCount(): Future[Long]
}