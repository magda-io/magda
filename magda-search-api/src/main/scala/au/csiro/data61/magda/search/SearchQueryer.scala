package au.csiro.data61.magda.search

import au.csiro.data61.magda.api.Query
import au.csiro.data61.magda.api.model.{ RegionSearchResult, SearchResult, OrganisationsSearchResult }
import au.csiro.data61.magda.model.misc._

import scala.concurrent.Future

trait SearchQueryer {
  def search(jwtToken: Option[String], query: Query, start: Long, limit: Int, facetSize: Int, tenantId: String): Future[SearchResult]
  def searchFacets(jwtToken: Option[String],facetType: FacetType, facetQuery: Option[String], generalQuery: Query, start: Int, limit: Int, tenantId: String): Future[FacetSearchResult]
  def searchRegions(query: Option[String], start: Long, limit: Int, tenantId: String): Future[RegionSearchResult]
  def searchOrganisations(query: Option[String], start: Int, limit: Int, tenantId: String): Future[OrganisationsSearchResult]
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
