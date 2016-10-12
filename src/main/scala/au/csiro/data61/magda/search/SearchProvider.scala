package au.csiro.data61.magda.search

import akka.actor.ActorSystem
import akka.stream.Materializer
import au.csiro.data61.magda.api.Query
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchProvider
import au.csiro.data61.magda.spatial.RegionSource

import scala.concurrent.{ExecutionContext, Future}

trait SearchProvider {
  def index(source: String, dataSets: List[DataSet]): Future[Any]
  def search(query: Query, limit: Int = 50): Future[SearchResult]
  def searchFacets(facetType: FacetType, query: String, limit: Int = 50): Future[FacetSearchResult]
  def needsReindexing(): Future[Boolean]
}
object SearchProvider {
  // TODO: There's undoubtably a cleverer way to do this in scala 
  var singletonProvider: Option[SearchProvider] = None

  def apply(regionSources: Seq[RegionSource])(implicit system: ActorSystem, ec: ExecutionContext, materializer: Materializer): SearchProvider = {
    singletonProvider = singletonProvider match {
      case Some(provider) => Some(provider)
      case None => Some(new ElasticSearchProvider(regionSources))
    }

    singletonProvider.get
  }
}