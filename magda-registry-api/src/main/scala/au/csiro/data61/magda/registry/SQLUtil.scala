package au.csiro.data61.magda.registry
import au.csiro.data61.magda.model.TenantId._
import scalikejdbc._

object SQLUtil {

  /**
    * Turns a TenantId into part of a where clause - if tenant id is specified
    * then it will query for that tenant id, otherwise it will just return "true"
    * so that it can be interpolated into a WHERE AND or OR condition without any
    * additional handling.
    *
    * @param tenantId the tenant id, as a TenantId
    * @param tableName the name of the table to look for tenant id in. Note that
    *    this is a SQLSyntax because it needs to be created with SQL.createUnsafely,
    *    using `sqls("blah")` will become `"blah"` in SQL. DO NOT PUT USER INPUT
    *    INTO createUnsafely, this should only be used for table names that are
    *    already known!!
    */
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
