package au.csiro.data61.magda.search

import au.csiro.data61.magda.api.Query
import au.csiro.data61.magda.api.model.{
  AutoCompleteQueryResult,
  OrganisationsSearchResult,
  RegionSearchResult,
  SearchResult
}
import au.csiro.data61.magda.model.Auth.AuthDecision
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.model.TenantId._
import com.sksamuel.elastic4s.ElasticClient

import scala.concurrent.Future

trait SearchQueryer {

  def getClient: Future[ElasticClient]

  def search(
      query: Query,
      start: Long,
      limit: Int,
      facetSize: Int
  ): Future[SearchResult]

  def autoCompleteQuery(
      authDecision: AuthDecision,
      field: String,
      inputString: Option[String],
      size: Option[Int],
      tenantId: TenantId
  ): Future[AutoCompleteQueryResult]

  def searchFacets(
      facetType: FacetType,
      facetQuery: Option[String],
      generalQuery: Query,
      start: Int,
      limit: Int
  ): Future[FacetSearchResult]

  def searchRegions(
      query: Option[String],
      regionId: Option[String],
      regionType: Option[String],
      lv1Id: Option[String],
      lv2Id: Option[String],
      lv3Id: Option[String],
      lv4Id: Option[String],
      lv5Id: Option[String],
      start: Long,
      limit: Int,
      tenantId: TenantId
  ): Future[RegionSearchResult]

  def searchOrganisations(
      query: Option[String],
      start: Int,
      limit: Int,
      tenantId: TenantId
  ): Future[OrganisationsSearchResult]
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
