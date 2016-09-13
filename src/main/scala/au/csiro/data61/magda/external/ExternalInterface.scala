package au.csiro.data61.magda.external

import scala.concurrent.ExecutionContext
import scala.concurrent.ExecutionContextExecutor
import scala.concurrent.Future

import akka.actor.ActorSystem
import akka.stream.Materializer
import au.csiro.data61.magda.api.Types.DataSet
import au.csiro.data61.magda.api.Types.SearchResult
import java.net.URL

object ExternalInterface {
  object ExternalInterfaceType extends Enumeration {
    type ExternalInterfaceType = Value
    val CKAN, CSW = Value
  }
  import ExternalInterfaceType._

  def apply(interfaceType: ExternalInterfaceType, baseUrl: URL)(implicit system: ActorSystem, executor: ExecutionContext, materializer: Materializer): ExternalInterface = interfaceType match {
    case CKAN => new CKANExternalInterface(baseUrl, system, executor, materializer)
    //    case CSW  => new CSWExternalInterface()
  }
}

trait ExternalInterface {
  def getDataSets(start: Long = 0, number: Int = 10): Future[List[DataSet]]
  def getTotalDataSetCount(): Future[Long]
}