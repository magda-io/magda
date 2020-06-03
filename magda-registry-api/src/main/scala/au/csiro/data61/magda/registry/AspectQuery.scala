package au.csiro.data61.magda.registry

import java.net.URLDecoder
import scalikejdbc._
import au.csiro.data61.magda.util.Regex._

sealed trait AspectQuery {
  val aspectId: String
  val path: List[String]
}

case class AspectQueryExists(val aspectId: String, val path: List[String])
    extends AspectQuery

case class AspectQueryWithValue(
    val aspectId: String,
    val path: List[String],
    value: AspectQueryValue,
    sqlComparator: SQLSyntax = SQLSyntax.createUnsafely("=")
) extends AspectQuery

case class AspectQueryAnyInArray(
    val aspectId: String,
    val path: List[String],
    value: AspectQueryValue
) extends AspectQuery

case class AspectQueryGroup(
    val aspectId: String,
    val path: List[String],
    value: AspectQueryValue
) extends AspectQuery

sealed trait AspectQueryValue {
  // --- should create value using sqls"${value}" so it's used as `binding parameters`
  val value: SQLSyntax
  val postgresType: SQLSyntax
}

case class AspectQueryString(string: String) extends AspectQueryValue {
  val value = sqls"${string}"
  val postgresType = SQLSyntax.createUnsafely("TEXT")
}

case class AspectQueryBoolean(boolean: Boolean) extends AspectQueryValue {
  val value = sqls"${boolean}"
  val postgresType = SQLSyntax.createUnsafely("BOOL")
}

case class AspectQueryBigDecimal(bigDecimal: BigDecimal)
    extends AspectQueryValue {
  val value = sqls"${bigDecimal}"
  val postgresType = SQLSyntax.createUnsafely("NUMERIC")
}

object AspectQuery {

  /**
    * Support the following operators for with value query in `aspectQuery` or aspectOrQuery`:
    * `:`   equal
    * `:!`  not equal
    * `:?`  like search keyword in field i.e. SQLSyntax.like
    * `:!?` Not like search keyword in field i.e. SQLSyntax.notLike
    * `:>`  >
    * `:>=` >=
    * `:<`  <
    * `:<=` <=
    *
    * Value after the operator should be in `application/x-www-form-urlencoded` MIME format
    */
  val operatorValueRegex = raw"^(:[!><=?]*)(.+)".r
  val numericValueRegex = raw"[-0-9.]+".r

  def parse(string: String): AspectQuery = {

    val Array(path, value) =
      string.split(":").map(URLDecoder.decode(_, "utf-8"))
    val pathParts = path.split("\\.").toList

    if (value.isEmpty) {
      throw new Exception("Value for aspect query is not present.")
    }

    if (pathParts.length < 2) {
      throw new Exception("Path for aspect query was empty")
    }


    val (sqlOp, sqlValue) = (":" + value) match {
      case operatorValueRegex(opStr, valueStr) =>
        opStr match {
          case ":" =>
            // --- for = or != compare as text works for other types (e.g. numeric as well)
            (SQLSyntax.createUnsafely("="), AspectQueryString(value))
          case ":!" =>
            (SQLSyntax.createUnsafely("!="), AspectQueryString(value))
          case ":?" =>
            (SQLSyntax.createUnsafely("LIKE"), AspectQueryString(value))
          case ":!?" =>
            (SQLSyntax.createUnsafely("NOT LIKE"), AspectQueryString(value))
          case ":>" =>
            (SQLSyntax.createUnsafely(">"), if(numericValueRegex matches value) {
              AspectQueryBigDecimal(value.toDouble)
            } else {
              AspectQueryString(value)
            })
          case ":>=" =>
            (SQLSyntax.createUnsafely(">="), if(numericValueRegex matches value) {
              AspectQueryBigDecimal(value.toDouble)
            } else {
              AspectQueryString(value)
            })
          case ":<" =>
            (SQLSyntax.createUnsafely(">="), if(numericValueRegex matches value) {
              AspectQueryBigDecimal(value.toDouble)
            } else {
              AspectQueryString(value)
            })
          case ":<=" =>
            (SQLSyntax.createUnsafely("<="), AspectQueryString(value))
          case _ =>
            throw new Error(s"Unsupported aspectQuery operator: ${opStr}")
        }
    }

    AspectQueryWithValue(
      pathParts.head,
      pathParts.tail,
      sqlValue,
      sqlOp
    )
  }
}
