package au.csiro.data61.magda.search

import scala.concurrent.ExecutionContext
import scala.concurrent.Future
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchProvider
import au.csiro.data61.magda.model.temporal._
import au.csiro.data61.magda.model.misc._
import akka.actor.ActorSystem

trait SearchProvider {
  def index(source: String, dataSets: List[DataSet]): Future[Any]
  def search(query: String, limit: Int = 50): Future[SearchResult]
  def searchFacets(facetType: FacetType, query: String, limit: Int = 50): Future[FacetSearchResult]
}
object SearchProvider {
  // TODO: There's undoubtably a cleverer way to do this in scala 
  var singletonProvider: Option[SearchProvider] = None

  def apply()(implicit system: ActorSystem, ec: ExecutionContext): SearchProvider = {
    singletonProvider = singletonProvider match {
      case Some(provider) => Some(provider)
      case None           => Some(new ElasticSearchProvider())
    }

    singletonProvider.get
  }
}