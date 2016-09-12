package au.csiro.data61.magda.search

import scala.concurrent.ExecutionContext
import scala.concurrent.Future

import au.csiro.data61.magda.api.Types._

trait SearchProvider {
  def index(dataSets: List[DataSet]): Future[Any]
  def search(query: String): Future[SearchResult]
}

object SearchProvider {
  // TODO: There's undoubtably a cleverer way to do this in scala 
  var singletonProvider: Option[SearchProvider] = None

  def apply()(implicit ec: ExecutionContext) : SearchProvider = {
    singletonProvider = singletonProvider match {
      case Some(provider) => Some(provider)
      case None           => Some(new ElasticSearchProvider())
    }
    
    singletonProvider.get
  }
}