package au.csiro.data61.magda.model

import com.sksamuel.elastic4s.requests.searches.queries.Query
import com.sksamuel.elastic4s.requests.searches.queries.matches.MatchAllQuery
import com.sksamuel.elastic4s.requests.searches.term.TermQuery

object TenantId {
  sealed trait TenantId {
    def specifiedOrThrow(): BigInt
    def isAllTenants(): Boolean
    def getEsQuery(field: String = "tenantId"): Query
  }
  case object AllTenantsId extends TenantId {

    def specifiedOrThrow(): BigInt =
      throw new Exception("Used specifiedOrThrow on unspecified tenant id")

    def isAllTenants(): Boolean = true
    def getEsQuery(field: String = "tenantId") = MatchAllQuery()
  }
  case class SpecifiedTenantId(tenantId: BigInt) extends TenantId {
    def specifiedOrThrow(): BigInt = tenantId;

    override def toString: String = {
      tenantId.toString
    }

    def isAllTenants(): Boolean = false

    def getEsQuery(field: String = "tenantId") = TermQuery(field, tenantId)

  }
}
