package au.csiro.data61.magda.util

import scalikejdbc._

object SQLUtils {

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

}
