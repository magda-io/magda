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

case class AspectQueryNonExists(val aspectId: String, val path: List[String])
  extends AspectQuery

case class AspectQueryWithValue(
    val aspectId: String,
    val path: List[String],
    value: AspectQueryValue,
    sqlComparator: SQLSyntax = SQLSyntax.createUnsafely("=")
) extends AspectQuery

/**
  * This aspect query will NOT ONLY match the situation that the aspect has specified json path and its value doesn't equal to specified value
  * But also match the situation that the specific json path does not exist on the aspect.
  */
case class AspectQueryNotEqualValue(
    val aspectId: String,
    val path: List[String],
    value: AspectQueryValue
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
    * `:?`  matches a pattern, case insensitive. Use Postgresql [ILIKE](https://www.postgresql.org/docs/9.6/functions-matching.html#FUNCTIONS-LIKE) operator.
    * `:!?` does not match a pattern, case insensitive. Use Postgresql [NOT ILIKE](https://www.postgresql.org/docs/9.6/functions-matching.html#FUNCTIONS-LIKE) operator
    * `:~`  matches POSIX regular expression, case insensitive. Use Postgresql [~*](https://www.postgresql.org/docs/9.6/functions-matching.html#FUNCTIONS-POSIX-REGEXP) operator
    * `:!~` does not match POSIX regular expression, case insensitive. Use Postgresql [!~*](https://www.postgresql.org/docs/9.6/functions-matching.html#FUNCTIONS-POSIX-REGEXP) operator
    * `:>`  greater than
    * `:>=` greater than or equal to
    * `:<`  less than
    * `:<=` less than or equal to
    *
    * Value after the operator should be in `application/x-www-form-urlencoded` MIME format
    * Example URL with aspectQuery: dcat-dataset-strings.title:?%rating% (Search keyword `rating` in `dcat-dataset-strings` aspect `title` field)
    * /v0/records?limit=100&optionalAspect=source&aspect=dcat-dataset-strings&aspectQuery=dcat-dataset-strings.title:?%2525rating%2525
    */
  val operatorValueRegex = raw"^(.+)(:[!><=?~]*)(.+)$$".r
  val numericValueRegex = raw"[-0-9.]+".r

  def parse(string: String): AspectQuery = {

    val List(path, opStr, valueStr) = string match {
      case operatorValueRegex(pathStr, opStr, valueStr) =>
        List(
          URLDecoder.decode(pathStr, "utf-8"),
          opStr,
          URLDecoder.decode(valueStr, "utf-8")
        )
      case _ => throw new Error("Invalid Aspect Query Format.")
    }

    val pathParts = path.split("\\.").toList

    if (valueStr.isEmpty) {
      throw new Exception("Value for aspect query is not present.")
    }

    if (pathParts.length < 2) {
      throw new Exception("Path for aspect query was empty")
    }

    if (opStr == ":!") {
      AspectQueryNotEqualValue(
        pathParts.head,
        pathParts.tail,
        AspectQueryString(valueStr)
      )
    } else {
      val (sqlOp, sqlValue) = opStr match {
        case ":" =>
          // --- for =, compare as text works for other types (e.g. numeric as well)
          (SQLSyntax.createUnsafely("="), AspectQueryString(valueStr))
        case ":?" =>
          (
            SQLSyntax.createUnsafely("ILIKE"),
            AspectQueryString(valueStr)
          )
        case ":!?" =>
          (
            SQLSyntax.createUnsafely("NOT ILIKE"),
            AspectQueryString(valueStr)
          )
        case ":~" =>
          (
            SQLSyntax.createUnsafely("~*"),
            AspectQueryString(valueStr)
          )
        case ":!~" =>
          (
            SQLSyntax.createUnsafely("!~*"),
            AspectQueryString(valueStr)
          )
        case ":>" =>
          (
            SQLSyntax.createUnsafely(">"),
            if (numericValueRegex matches valueStr) {
              AspectQueryBigDecimal(valueStr.toDouble)
            } else {
              AspectQueryString(valueStr)
            }
          )
        case ":>=" =>
          (
            SQLSyntax.createUnsafely(">="),
            if (numericValueRegex matches valueStr) {
              AspectQueryBigDecimal(valueStr.toDouble)
            } else {
              AspectQueryString(valueStr)
            }
          )
        case ":<" =>
          (
            SQLSyntax.createUnsafely("<"),
            if (numericValueRegex matches valueStr) {
              AspectQueryBigDecimal(valueStr.toDouble)
            } else {
              AspectQueryString(valueStr)
            }
          )
        case ":<=" =>
          (SQLSyntax.createUnsafely("<="), AspectQueryString(valueStr))
        case _ =>
          throw new Error(s"Unsupported aspectQuery operator: ${opStr}")
      }
      AspectQueryWithValue(
        pathParts.head,
        pathParts.tail,
        sqlValue,
        sqlOp
      )
    }

  }
}
