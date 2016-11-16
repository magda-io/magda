package au.csiro.data61.magda.search

import au.csiro.data61.magda.model.misc._
import scala.concurrent.{ ExecutionContext, Future }
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchIndexer
import akka.stream.Materializer
import akka.actor.ActorSystem

trait SearchIndexer {
  def index(source: String, dataSets: List[DataSet]): Future[Any]
  def needsReindexing(): Future[Boolean]
}

object SearchIndexer {
  def apply(implicit system: ActorSystem, ec: ExecutionContext, materializer: Materializer) = new ElasticSearchIndexer()
}