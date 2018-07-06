package au.csiro.data61.magda.search

import au.csiro.data61.magda.api.Query
import au.csiro.data61.magda.api.model.{ RegionSearchResult, SearchResult, OrganisationsSearchResult }
import au.csiro.data61.magda.model.misc._

import scala.concurrent.Future

trait SearchQueryer {
  def search(query: Query, start: Long, limit: Int, facetSize: Int): Future[SearchResult]
  def searchFacets(facetType: FacetType, facetQuery: Option[String], generalQuery: Query, start: Int, limit: Int): Future[FacetSearchResult]
  def searchRegions(query: Option[String], start: Long, limit: Int): Future[RegionSearchResult]
  def searchOrganisations(query: Option[String], start: Int, limit: Int): Future[OrganisationsSearchResult]
}

sealed trait SearchStrategy {
  val name: String
}
object SearchStrategy {
  def parse(name: String): SearchStrategy = name match {
    case MatchPart.name => MatchPart
    case MatchAll.name  => MatchAll
  }
  case object MatchPart extends SearchStrategy {
    override val name = "match-part"
  }
  case object MatchAll extends SearchStrategy {
    override val name = "match-all"
  }
}
