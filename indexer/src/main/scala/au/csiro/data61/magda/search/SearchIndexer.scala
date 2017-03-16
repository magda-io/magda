package au.csiro.data61.magda.search

import au.csiro.data61.magda.model.misc._

import scala.concurrent.{ ExecutionContext, Future }
import akka.stream.Materializer
import akka.actor.ActorSystem
import au.csiro.data61.magda.external.InterfaceConfig
import au.csiro.data61.magda.search.elasticsearch.{ ClientProvider, ElasticSearchIndexer, Indices }
import com.typesafe.config.Config
import java.time.Instant

trait SearchIndexer {
  def index(source: InterfaceConfig, dataSets: List[DataSet]): Future[Any]
  def snapshot(): Future[Unit]
  def ready: Future[Unit]
  def trim(source: InterfaceConfig, before: Instant): Future[Unit]
}

object SearchIndexer {
  def apply(clientProvider: ClientProvider, indices: Indices)(implicit config: Config, system: ActorSystem, ec: ExecutionContext, materializer: Materializer) =
    new ElasticSearchIndexer(clientProvider, indices)
}