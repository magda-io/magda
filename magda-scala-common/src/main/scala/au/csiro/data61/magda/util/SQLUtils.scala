package au.csiro.data61.magda.util

import au.csiro.data61.magda.model.Registry.MAGDA_ADMIN_PORTAL_ID
import au.csiro.data61.magda.model.TenantId.{
  AllTenantsId,
  SpecifiedTenantId,
  TenantId
}
import scalikejdbc._
import scalikejdbc.interpolation.SQLSyntax
import scalikejdbc.interpolation.SQLSyntax.{join}

import java.util.Locale.ENGLISH

object SQLUtils {

  def toOrConditionOpt(conditions: Option[SQLSyntax]*): Option[SQLSyntax] = {
    val cs: Seq[SQLSyntax] = conditions.flatten
    if (cs.isEmpty) None else Some(joinWithOr(cs: _*))
  }

  def toAndConditionOpt(conditions: Option[SQLSyntax]*): Option[SQLSyntax] = {
    val cs: Seq[SQLSyntax] = conditions.flatten
    if (cs.isEmpty) None else Some(joinWithAnd(cs: _*))
  }

  def joinWithAnd(parts: SQLSyntax*): SQLSyntax =
    join(parts.map(p => if (hasAndOr(p)) sqls"(${p})" else p), sqls"and")

  def joinWithOr(parts: SQLSyntax*): SQLSyntax =
    join(parts.map(p => if (hasAndOr(p)) sqls"(${p})" else p), sqls"or")

  def hasAndOr(s: SQLSyntax): Boolean = {
    val statement = s.value.toLowerCase(ENGLISH)
    statement.matches("(?s).+\\s+and\\s+.+") ||
    statement.matches("(?s).+\\s+or\\s+.+")
  }

  def getTableColumnName(
      columnName: String,
      tableRef: String = "",
      useLowerCaseColumnName: Boolean = true
  ): SQLSyntax = {
    val id = List(
      tableRef,
      if (useLowerCaseColumnName) {
        columnName.toLowerCase()
      } else {
        columnName
      }
    ).filter(_ != "").mkString(".")
    escapeIdentifier(id)
  }

  /**
    * Escape SQL identifier string
    * Although postgreSQL does allow non-ASCII characters in identifiers, to make it simple, we will remove any non-ASCII characters.
    * */
  private def escapeIdentifierStr(idStr: String): String =
    "\"" + idStr
      .replaceAll("[^\\x20-\\x7e]", "")
      .replaceAll("\"", "\"\"") + "\""

  /**
    * Escape SQL identifier (e.g. column names, or table names).
    * `xxx."ss.dd` will be escaped as `"xxx"."""ss"."dd"`
    * Although postgreSQL does allow non-ASCII characters in identifiers, to make it simple, we will remove any non-ASCII characters.
    * */
  def escapeIdentifier(idStr: String): SQLSyntax = {
    val sanitisedIdStr = idStr
      .replaceAll("[^\\x20-\\x7e]", "")
    val parts = sanitisedIdStr.split("\\.")
    val escapedIdStr = if (parts.length > 1) {
      parts.map(escapeIdentifierStr(_)).mkString(".")
    } else {
      escapeIdentifierStr(sanitisedIdStr)
    }
    SQLSyntax.createUnsafely(escapedIdStr)
  }

  val SQL_TRUE = SQLSyntax.createUnsafely("TRUE")
  val SQL_FALSE = SQLSyntax.createUnsafely("FALSE")

  /**
    * Turns a TenantId into part of a where clause - if tenant id is specified
    * then it will query for that tenant id, otherwise it will just return "true"
    * so that it can be interpolated into a WHERE AND or OR condition without any
    * additional handling.
    *
    * @param tenantId the tenant id, as a TenantId
    * @param tenantIdSqlRef the SQL identifier reference to look for tenant id in. Default to: `records.tenantid`
    */
  def tenantIdToWhereClause(
      tenantId: TenantId,
      tenantIdSqlRef: String = "records.tenantid"
  ): Option[SQLSyntax] = {
    tenantId match {
      case SpecifiedTenantId(innerTenantId: BigInt) =>
        def buildSqlQuery(condition: SQLSyntax) =
          Some(sqls"${escapeIdentifier(tenantIdSqlRef)} ${condition}")

        if (innerTenantId == MAGDA_ADMIN_PORTAL_ID) {
          // Assume that null values are the same as 0. Why not just set a default in the DB?
          // Because it'll take a whole day to process the migration.
          toOrConditionOpt(
            buildSqlQuery(sqls"IS NULL"),
            buildSqlQuery(sqls"= $innerTenantId")
          ).map(SQLSyntax.roundBracket(_))
        } else {
          buildSqlQuery(sqls"= ${innerTenantId}")
        }
      case AllTenantsId => None
    }
  }
}
