package au.csiro.data61.magda.search

import scala.concurrent.ExecutionContext
import scala.concurrent.Future

import au.csiro.data61.magda.api.Types._
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchProvider

trait SearchProvider {
  def index(source: String, dataSets: List[DataSet]): Future[Any]
  def search(query: String): Future[SearchResult]
  def searchFacets(facetType: FacetType, query: String): Future[Option[Seq[FacetOption]]]

}
object SearchProvider {
  // TODO: There's undoubtably a cleverer way to do this in scala 
  var singletonProvider: Option[SearchProvider] = None

  def apply()(implicit ec: ExecutionContext): SearchProvider = {
    singletonProvider = singletonProvider match {
      case Some(provider) => Some(provider)
      case None           => Some(new ElasticSearchProvider())
    }

    singletonProvider.get
  }
}