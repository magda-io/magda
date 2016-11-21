package au.csiro.data61.magda.search

import akka.actor.ActorSystem
import akka.stream.Materializer
import au.csiro.data61.magda.api.Query
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchQueryer
import au.csiro.data61.magda.spatial.RegionSource

import scala.concurrent.{ ExecutionContext, Future }

trait SearchProvider {
  def search(query: Query, start: Long, limit: Int): Future[SearchResult]
  def searchFacets(facetType: FacetType, facetQuery: String, generalQuery: Query, start: Long, limit: Int): Future[FacetSearchResult]
  def searchRegions(query: String, start: Long, limit: Int): Future[RegionSearchResult]
}

sealed trait SearchStrategy {
  val name: String
}
object SearchStrategy {
  def parse(name: String): SearchStrategy = name match {
    case MatchPart.name => MatchPart
    case MatchAll.name  => MatchAll
  }
}
case object MatchPart extends SearchStrategy {
  override val name = "match-part"
}
case object MatchAll extends SearchStrategy {
  override val name = "match-all"
}