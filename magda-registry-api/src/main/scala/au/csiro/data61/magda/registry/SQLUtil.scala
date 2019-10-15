package au.csiro.data61.magda.registry
import au.csiro.data61.magda.model.TenantId._
import scalikejdbc._

object SQLUtil {

  def tenantIdToWhereClause(
      tenantId: TenantId,
      tableName: Option[SQLSyntax] = None
  ) =
    tenantId match {
      case SpecifiedTenantId(innerTenantId) =>
        sqls"${tableName
          .map(tableSql => SQLSyntax.createUnsafely(tableSql + "."))
          .getOrElse(SQLSyntax.createUnsafely(""))}tenantId = $innerTenantId"
      case AllTenantsId => sqls"true"
    }
}
