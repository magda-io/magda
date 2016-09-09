package au.csiro.data61.magda.search

import scala.concurrent.Future

import au.csiro.data61.magda.api.Types._

trait SearchProvider {
  def index(dataSets: List[DataSet]): Future[Any]
  def search(query: String): Future[SearchResult]
}

object SearchProvider {
  def apply() = new ElasticSearchProvider
}