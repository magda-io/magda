package au.csiro.data61.magda.search

import au.csiro.data61.magda.model.misc._
import scala.concurrent.{ ExecutionContext, Future }
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchIndexer
import akka.stream.Materializer
import akka.actor.ActorSystem
import au.csiro.data61.magda.external.InterfaceConfig

trait SearchIndexer {
  def index(source: InterfaceConfig, dataSets: List[DataSet]): Future[Any]
  def snapshot(): Future[Unit]
  def needsReindexing(source: InterfaceConfig): Future[Boolean]
}

object SearchIndexer {
  def apply(implicit system: ActorSystem, ec: ExecutionContext, materializer: Materializer) = new ElasticSearchIndexer()
}