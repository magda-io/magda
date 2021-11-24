package au.csiro.data61.magda.model

import au.csiro.data61.magda.util.Regex._
import spray.json.{JsBoolean, JsFalse, JsNumber, JsString, JsValue}
import scalikejdbc._

import java.net.URLDecoder

sealed trait AspectQuery {
  val aspectId: String
  val path: Seq[String]
  val negated: Boolean

  def toSql(): SQLSyntax
}

case class AspectQueryExists(
    val aspectId: String,
    val path: Seq[String],
    val negated: Boolean = false
) extends AspectQuery {

  def toSql(): SQLSyntax = {
    sqls"""
             aspectid = $aspectId AND (data #> string_to_array(${path.mkString(
      ","
    )}, ',')) IS NOT NULL
        """
  }
}

case class AspectQueryWithValue(
    val aspectId: String,
    val path: Seq[String],
    value: AspectQueryValue,
    sqlComparator: SQLSyntax = SQLSyntax.createUnsafely("="),
    val negated: Boolean = false,
    // when generate SQL, should in order of `reference` `operator` `value` or `value` `operator` `reference`
    // except `=` operator, order matters for many operator
    // there is no guarantee that auth decision will always be in order of `reference` `operator` `value`
    placeReferenceFirst: Boolean = true
) extends AspectQuery {

  def toSql(): SQLSyntax = {
    if (placeReferenceFirst) {
      sqls"""
             aspectid = $aspectId AND (data #>> string_to_array(${path
        .mkString(",")}, ','))::${value.postgresType} $sqlComparator ${value.value}::${value.postgresType}
          """
    } else {
      sqls"""
             aspectid = $aspectId AND (${value.value}::${value.postgresType} $sqlComparator data #>> string_to_array(${path
        .mkString(",")}, ','))::${value.postgresType}
          """
    }
  }
}

/**
  * This aspect query will NOT ONLY match the situation that the aspect has specified json path and its value doesn't equal to specified value
  * But also match the situation that the specific json path does not exist on the aspect.
  */
case class AspectQueryNotEqualValue(
    val aspectId: String,
    val path: List[String],
    value: AspectQueryValue,
    val negated: Boolean = false
) extends AspectQuery {

  def toSql(): SQLSyntax = {
    // --- In order to cover the situation that json path doesn't exist,
    // --- we set SQL operator as `=` and put the generated SQL in NOT EXISTS clause instead
    // --- data #>> string_to_array(xx,",") IS NULL won't work as, when json path doesn't exist, the higher level `EXIST` clause will always evaluate to false
    sqls"""
             aspectid = $aspectId AND (data #>> string_to_array(${path
      .mkString(",")}, ','))::${value.postgresType} = ${value.value}::${value.postgresType}
        """
  }
}

case class AspectQueryArrayNotEmpty(
    val aspectId: String,
    val path: Seq[String],
    val negated: Boolean = false
) extends AspectQuery {

  def toSql(): SQLSyntax = {
    // test if the given json path's `0` index is NULL
    // Therefore, an `[null]` array will be considered as not matched
    sqls"""
             aspectid = $aspectId AND (data #> string_to_array(${path.mkString(
      ","
    ) + ".0"}, ',')) IS NOT NULL
        """
  }
}

case class AspectQueryValueInArray(
    val aspectId: String,
    val path: Seq[String],
    value: AspectQueryValue,
    val negated: Boolean = false
) extends AspectQuery {

  def toSql(): SQLSyntax = {
    sqls"""
            aspectid = $aspectId AND COALESCE(
              (data::JSONB #> string_to_array(${path.mkString(",")}, ',')::JSONB) @> ${value.value}::TEXT::JSONB,
              FALSE
            )
        """
  }
}

sealed trait GenericAspectQueryGroup {
  def toSQL(): SQLSyntax
}

case class UnconditionalAspectQueryGroup(matchOrNot: Boolean)
    extends GenericAspectQueryGroup {
  
}

case class AspectQueryGroup(
    queries: Seq[AspectQuery],
    // determine when convert into SQL, should we use "AND" (when value is `true`) or "OR" (when value is `false`) to join all `AspectQuery` together
    joinWithAnd: Boolean = true,
    negated: Boolean = false
) extends GenericAspectQueryGroup

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
