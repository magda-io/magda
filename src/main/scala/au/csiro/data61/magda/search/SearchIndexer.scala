package au.csiro.data61.magda.search

import au.csiro.data61.magda.model.misc._
import scala.concurrent.{ ExecutionContext, Future }

trait SearchIndexer {
  def index(source: String, dataSets: List[DataSet]): Future[Any]
  def needsReindexing(): Future[Boolean]
}