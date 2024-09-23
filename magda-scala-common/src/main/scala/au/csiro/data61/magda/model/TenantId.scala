package au.csiro.data61.magda.model

import au.csiro.data61.magda.model.Registry.{
  MAGDA_ADMIN_PORTAL_ID,
  MAGDA_SYSTEM_ID
}
import com.sksamuel.elastic4s.requests.searches.queries.Query
import com.sksamuel.elastic4s.requests.searches.queries.matches.MatchAllQuery
import com.sksamuel.elastic4s.requests.searches.term.TermQuery
import spray.json.{DefaultJsonProtocol, JsString, JsValue, JsonFormat}
import spray.json._

object TenantId {
  sealed trait TenantId {
    def specifiedOrThrow(): BigInt
    def isAllTenants(): Boolean

    def getEsQuery(
        isDistributionQuery: Boolean = false
    ): Query
  }

  case object AllTenantsId extends TenantId {

    def specifiedOrThrow(): BigInt =
      throw new Exception("Used specifiedOrThrow on unspecified tenant id")

    def isAllTenants(): Boolean = true

    def getEsQuery(
        isDistributionQuery: Boolean = false
    ) = MatchAllQuery()
  }

  case class SpecifiedTenantId(tenantId: BigInt) extends TenantId {
    def specifiedOrThrow(): BigInt = tenantId;

    override def toString: String = {
      tenantId.toString
    }

    def isAllTenants(): Boolean = false

    def getEsQuery(
        isDistributionQuery: Boolean = false
    ) = {
      val field =
        if (isDistributionQuery) "distributions.tenantId" else "tenantId"
      TermQuery(field, tenantId)
    }

  }

  class TenantIdFormat extends JsonFormat[TenantId] {
    override def write(tenantId: TenantId): JsValue = tenantId match {
      case AllTenantsId                        => JsNumber(MAGDA_SYSTEM_ID)
      case SpecifiedTenantId(tenantId: BigInt) => JsNumber(tenantId)
      case _                                   => JsNumber(MAGDA_ADMIN_PORTAL_ID)
    }
    override def read(jsonRaw: JsValue): TenantId = jsonRaw match {
      case JsNumber(v) if v == MAGDA_SYSTEM_ID => AllTenantsId
      case JsNumber(v) if v != MAGDA_SYSTEM_ID =>
        SpecifiedTenantId(v.toBigInt())
      case _ => SpecifiedTenantId(MAGDA_ADMIN_PORTAL_ID)
    }
  }

}
