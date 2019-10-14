package au.csiro.data61.magda.registry
import au.csiro.data61.magda.model.TenantId._
import scalikejdbc._

object SQLUtil {

  def tenantIdToWhereClause(tenantId: TenantId) = tenantId match {
    case SpecifiedTenantId(innerTenantId) => sqls"tenantId = $innerTenantId"
    case AllTenantsId                     => sqls"true"
  }
}
