package au.csiro.data61.magda.model

import au.csiro.data61.magda.util.Regex._
import scalikejdbc._
import au.csiro.data61.magda.util.SQLUtils

import java.net.URLDecoder

sealed trait AspectQuery {
  val aspectId: String
  val path: Seq[String]
  val negated: Boolean

  // interface for different type of aspectQuery implement actual SQL queries
  protected def sqlQueries(): Option[SQLSyntax]

  protected def sqlWithAspectQuery(
      aspectQuerySql: Option[SQLSyntax],
      recordIdSqlRef: String,
      tenantIdSqlRef: String
  ): Option[SQLSyntax] = {
    val aspectLookupCondition =
      sqls"(aspectid, recordid, tenantid)=($aspectId, ${SQLUtils
        .escapeIdentifier(recordIdSqlRef)}, ${SQLUtils.escapeIdentifier(
        tenantIdSqlRef
      )})"
    val fullAspectCondition =
      SQLSyntax.toAndConditionOpt(Some(aspectLookupCondition), aspectQuerySql)
    val sqlAspectQueries =
      sqls"SELECT 1 FROM recordaspects".where(fullAspectCondition)
    if (negated) {
      Some(SQLSyntax.notExists(sqlAspectQueries))
    } else {
      Some(SQLSyntax.exists(sqlAspectQueries))
    }
  }

  /**
    * Public interface of all types of AspectQuery. Call this method to covert AspectQuery to SQL statement.
    * Sub-class might choose to override this method to alter generic logic
    * @param recordIdSqlRef
    * @param tenantIdSqlRef
    * @return
    */
  def toSql(
      // we should use all lowercase for table & column names
      // when we create table, we didn't use double quotes. Thus, those identifier are actually stored as lowercase internally
      // Upper case will work when we don't double quotes but it's due to the case insensitive treatment of PostgreSQL for non-quoted identifiers not because of its actual form.
      // We should gradually change all identifiers in our SQL to lowercase and make sure all future identifiers are all in lowercase `snake_case`
      recordIdSqlRef: String = "records.recordid",
      tenantIdSqlRef: String = "records.tenantid"
  ): Option[SQLSyntax] = {
    if (aspectId.isEmpty) {
      throw new Error(
        s"Invalid AspectQuery: aspectId cannot be empty."
      )
    }
    // we move actual implementation to method `sqlWithAspectQuery` so we can reuse its logic when override `toSql`
    sqlWithAspectQuery(sqlQueries, recordIdSqlRef, tenantIdSqlRef)
  }
}

class AspectQueryTrue extends AspectQuery {
  val aspectId: String = ""
  val path: Seq[String] = Nil
  val negated: Boolean = false

  def sqlQueries(): Option[SQLSyntax] =
    Some(SQLSyntax.createUnsafely("TRUE"))

  override def toSql(recordIdSqlRef: String, tenantIdSqlRef: String) =
    sqlQueries
}

class AspectQueryFalse extends AspectQuery {
  val aspectId: String = ""
  val path: Seq[String] = Nil
  val negated: Boolean = false

  def sqlQueries(): Option[SQLSyntax] =
    Some(SQLSyntax.createUnsafely("FALSE"))

  override def toSql(recordIdSqlRef: String, tenantIdSqlRef: String) =
    sqlQueries
}

case class AspectQueryExists(
    val aspectId: String,
    val path: Seq[String],
    val negated: Boolean = false
) extends AspectQuery {

  def sqlQueries(): Option[SQLSyntax] = {
    if (path.length > 0) {
      Some(sqls"""
           (data #> string_to_array(${path.mkString(
        ","
      )}, ',')) IS NOT NULL
        """)
    } else {
      // no path. thus, only need to test whether the aspect exist or not by lookup recordaspects table
      // this has been done by `AspectQuery` trait `toSql` method. Therefore, we output None here.
      None
    }
  }
}

case class AspectQueryWithValue(
    aspectId: String,
    path: Seq[String],
    value: AspectQueryValue,
    operator: SQLSyntax = SQLSyntax.createUnsafely("="),
    val negated: Boolean = false,
    // when generate SQL, should in order of `reference` `operator` `value` or `value` `operator` `reference`
    // except `=` operator, order matters for many operator
    // there is no guarantee that auth decision will always be in order of `reference` `operator` `value`
    placeReferenceFirst: Boolean = true
) extends AspectQuery {

  def sqlQueries(): Option[SQLSyntax] = {
    Some(if (placeReferenceFirst) {
      sqls"""
             COALESCE((data #>> string_to_array(${path
        .mkString(",")}, ','))::${value.postgresType} $operator ${value.value}::${value.postgresType}, false)
          """
    } else {
      sqls"""
             COALESCE((${value.value}::${value.postgresType} $operator data #>> string_to_array(${path
        .mkString(",")}, ','))::${value.postgresType}, false)
          """
    })
  }

  def recordPropertySqlQueries(
      columnName: String
  ): Option[SQLSyntax] = {
    val columnNameSql = SQLSyntax.createUnsafely(columnName)
    val dataType = if (columnName == "lastupdate") {
      if (value.postgresType.value == "BOOL") {
        throw new Error(
          s"Failed to convert `AspectQueryWithValue` into record property query (aspectId = `${aspectId}`): cannot convert bool value to numeric value."
        )
      }
      SQLSyntax.createUnsafely("NUMERIC")
    } else {
      SQLSyntax.createUnsafely("TEXT")
    }
    Some(if (placeReferenceFirst) {
      sqls"COALESCE(${columnNameSql}::${dataType} $operator ${value.value}::${dataType}, FALSE)"
    } else {
      sqls"COALESCE(${value.value}::${dataType} $operator ${columnNameSql}::${dataType}, FALSE)"
    })
  }

  private val recordFields =
    List("recordid", "name", "lastupdate", "sourcetag", "tenantid")

  override def toSql(
      recordIdSqlRef: String = "records.recordid",
      tenantIdSqlRef: String = "records.tenantid"
  ): Option[SQLSyntax] = {
    if (aspectId.isEmpty) {
      throw new Error(
        s"Invalid AspectQueryWithValue: aspectId cannot be empty."
      )
    }
    if (path.length > 0) {
      // normal aspect query
      sqlWithAspectQuery(sqlQueries, recordIdSqlRef, tenantIdSqlRef)
    } else {
      var columnName = aspectId.trim.toLowerCase
      if (columnName == "id") {
        columnName = "recordid"
      }
      if (!recordFields.exists(_ == columnName)) {
        throw new Error(
          s"Invalid AspectQueryWithValue: ${aspectId} is not valid or supported record property / aspect name."
        )
      } else {
        val recordQuery = sqls"SELECT 1 FROM records".where(
          SQLSyntax.toAndConditionOpt(
            Some(
              sqls"(recordid, tenantid)=(${SQLUtils
                .escapeIdentifier(recordIdSqlRef)}, ${SQLUtils.escapeIdentifier(tenantIdSqlRef)})"
            ),
            recordPropertySqlQueries(columnName)
          )
        )
        if (negated) {
          Some(SQLSyntax.notExists(recordQuery))
        } else {
          Some(SQLSyntax.exists(recordQuery))
        }
      }
    }
  }
}

case class AspectQueryArrayNotEmpty(
    val aspectId: String,
    val path: Seq[String],
    val negated: Boolean = false
) extends AspectQuery {

  def sqlQueries(): Option[SQLSyntax] = {
    if (path.isEmpty) {
      throw new Error(
        s"Invalid AspectQueryArrayNotEmpty for aspectId `${aspectId}` path cannot be empty."
      )
    }
    // test if the given json path's `0` index is NULL
    // Therefore, an `[null]` array will be considered as not matched
    Some(sqls"""
           (data #> string_to_array(${(path :+ "0").mkString(
      ","
    )}, ',')) IS NOT NULL
        """)
  }
}

case class AspectQueryValueInArray(
    aspectId: String,
    path: Seq[String],
    value: AspectQueryValue,
    negated: Boolean = false
) extends AspectQuery {

  def sqlQueries(): Option[SQLSyntax] = {
    if (path.isEmpty) {
      throw new Error(
        s"Invalid AspectQueryValueInArray for aspectId `${aspectId}` path cannot be empty."
      )
    }
    Some(sqls"""
           COALESCE(
              (data::JSONB #> string_to_array(${path
      .mkString(",")}, ',')::JSONB) @> ${value.value}::TEXT::JSONB,
              FALSE
            )
        """)
  }
}

case class AspectQueryGroup(
    queries: Seq[AspectQuery],
    // determine when convert into SQL, should we use "AND" (when value is `true`) or "OR" (when value is `false`) to join all `AspectQuery` together
    joinWithAnd: Boolean = true,
    negated: Boolean = false
) {

  def toSql(
      recordIdSqlRef: String = "records.recordid",
      tenantIdSqlRef: String = "records.tenantid"
  ): Option[SQLSyntax] = {
    if (queries.isEmpty) {
      return None
    }
    val joinedQuery = if (joinWithAnd) {
      if (queries.exists {
            case _: AspectQueryFalse => true
            case _                   => false
          }) {
        // when unconditional FALSE exist, joinWithAnd should to evaluated to FALSE
        Some(SQLUtils.SQL_FALSE)
      } else {
        SQLSyntax.toAndConditionOpt(
          queries.map {
            // unconditional true can be skipped in AND
            case _: AspectQueryTrue => None
            case aspectQuery =>
              aspectQuery.toSql(recordIdSqlRef, tenantIdSqlRef)
          }: _*
        )
      }
    } else {
      if (queries.exists {
            case _: AspectQueryTrue => true
            case _                  => false
          }) {
        // when unconditional TRUE exist, joinWithOr should to evaluated to TRUE
        Some(SQLUtils.SQL_TRUE)
      } else {
        SQLSyntax.toOrConditionOpt(
          queries.map {
            // unconditional false can be skipped in OR
            case _: AspectQueryFalse => None
            case aspectQuery =>
              aspectQuery.toSql(recordIdSqlRef, tenantIdSqlRef)
          }: _*
        )
      }
    }
    if (negated) {
      joinedQuery.map(sqlQuery => sqls"NOT ${SQLSyntax.roundBracket(sqlQuery)}")
    } else {
      joinedQuery
    }
  }
}

sealed trait AspectQueryValue {
  // --- should create value using sqls"${value}" so it's used as `binding parameters`
  val value: SQLSyntax
  val postgresType: SQLSyntax
}

case class AspectQueryStringValue(string: String) extends AspectQueryValue {
  val value = sqls"${string}"
  val postgresType = SQLSyntax.createUnsafely("TEXT")
}

case class AspectQueryBooleanValue(boolean: Boolean) extends AspectQueryValue {
  val value = sqls"${boolean}"
  val postgresType = SQLSyntax.createUnsafely("BOOL")
}

case class AspectQueryBigDecimalValue(bigDecimal: BigDecimal)
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

    opStr match {
      case ":" =>
        // --- for =, compare as text works for other types (e.g. numeric as well)
        AspectQueryWithValue(
          aspectId = pathParts.head,
          path = pathParts.tail,
          value = AspectQueryStringValue(valueStr),
          operator = SQLSyntax.createUnsafely("=")
        )
      case ":!" =>
        AspectQueryWithValue(
          aspectId = pathParts.head,
          path = pathParts.tail,
          value = AspectQueryStringValue(valueStr),
          operator = SQLSyntax.createUnsafely("="),
          negated = true
        )
      case ":?" =>
        AspectQueryWithValue(
          aspectId = pathParts.head,
          path = pathParts.tail,
          value = AspectQueryStringValue(valueStr),
          operator = SQLSyntax.createUnsafely("ILIKE")
        )
      case ":!?" =>
        AspectQueryWithValue(
          aspectId = pathParts.head,
          path = pathParts.tail,
          value = AspectQueryStringValue(valueStr),
          operator = SQLSyntax.createUnsafely("ILIKE"),
          negated = true
        )
      case ":~" =>
        AspectQueryWithValue(
          aspectId = pathParts.head,
          path = pathParts.tail,
          value = AspectQueryStringValue(valueStr),
          operator = SQLSyntax.createUnsafely("~*")
        )
      case ":!~" =>
        AspectQueryWithValue(
          aspectId = pathParts.head,
          path = pathParts.tail,
          value = AspectQueryStringValue(valueStr),
          operator = SQLSyntax.createUnsafely("~*"),
          negated = true
        )
      case ":>" =>
        AspectQueryWithValue(
          aspectId = pathParts.head,
          path = pathParts.tail,
          value = if (numericValueRegex matches valueStr) {
            AspectQueryBigDecimalValue(valueStr.toDouble)
          } else {
            AspectQueryStringValue(valueStr)
          },
          operator = SQLSyntax.createUnsafely(">")
        )
      case ":>=" =>
        AspectQueryWithValue(
          aspectId = pathParts.head,
          path = pathParts.tail,
          value = if (numericValueRegex matches valueStr) {
            AspectQueryBigDecimalValue(valueStr.toDouble)
          } else {
            AspectQueryStringValue(valueStr)
          },
          operator = SQLSyntax.createUnsafely(">=")
        )
      case ":<" =>
        AspectQueryWithValue(
          aspectId = pathParts.head,
          path = pathParts.tail,
          value = if (numericValueRegex matches valueStr) {
            AspectQueryBigDecimalValue(valueStr.toDouble)
          } else {
            AspectQueryStringValue(valueStr)
          },
          operator = SQLSyntax.createUnsafely("<")
        )
      case ":<=" =>
        AspectQueryWithValue(
          aspectId = pathParts.head,
          path = pathParts.tail,
          value = if (numericValueRegex matches valueStr) {
            AspectQueryBigDecimalValue(valueStr.toDouble)
          } else {
            AspectQueryStringValue(valueStr)
          },
          operator = SQLSyntax.createUnsafely("<=")
        )
      case _ =>
        throw new Error(s"Unsupported aspectQuery operator: ${opStr}")
    }

  }
}
