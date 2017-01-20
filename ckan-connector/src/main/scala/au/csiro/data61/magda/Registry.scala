package au.csiro.data61.magda

import scala.concurrent.{ExecutionContext, Future}
import akka.stream.Materializer
import akka.actor.ActorSystem
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.search.elasticsearch.ClientProvider
import au.csiro.data61.magda.external.InterfaceConfig
import com.typesafe.config.Config

trait Registry {
  def initialize(): Future[Any]
  def add(source: InterfaceConfig, dataSets: List[DataSet]): Future[Any]
  def needsReindexing(source: InterfaceConfig): Future[Boolean]
}
object Registry {
  def apply(clientProvider: ClientProvider, config: Config)(implicit system: ActorSystem, ec: ExecutionContext, materializer: Materializer) =
    new MagdaRegistry(clientProvider, config)
}