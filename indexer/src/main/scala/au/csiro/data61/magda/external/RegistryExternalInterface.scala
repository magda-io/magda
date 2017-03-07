package au.csiro.data61.magda.external

import akka.actor.ActorSystem
import akka.stream.Materializer
import au.csiro.data61.magda.external.ckan.{CKANConverters, CKANProtocols}
import au.csiro.data61.magda.model.misc.DataSet
import com.typesafe.config.Config

import scala.concurrent.{ExecutionContext, Future}

class RegistryExternalInterface(interfaceConfig: InterfaceConfig, implicit val config: Config, implicit val system: ActorSystem, implicit val executor: ExecutionContext, implicit val materializer: Materializer) extends ExternalInterface {
  override def getDataSets(start: Long, number: Int): Future[List[DataSet]] = ???

  override def getTotalDataSetCount(): Future[Long] = ???
}
