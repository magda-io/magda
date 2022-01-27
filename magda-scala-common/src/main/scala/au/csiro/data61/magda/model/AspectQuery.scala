package au.csiro.data61.magda.model

import au.csiro.data61.magda.util.Regex._
import scalikejdbc._
import au.csiro.data61.magda.util.SQLUtils

import java.net.URLDecoder

// we should use all lowercase for table & column names
// when we create table, we didn't use double quotes. Thus, those identifier are actually stored as lowercase internally
// Upper case will work when we don't double quotes but it's due to the case insensitive treatment of PostgreSQL for non-quoted identifiers not because of its actual form.
// We should gradually change all identifiers in our SQL to lowercase and make sure all future identifiers are all in lowercase `snake_case`
case class AspectQueryToSqlConfig(
    // a list of prefixes used to simplify / shorten ref when translate OPA query to AspectQuery
    // e.g. input.object.record or input.object.webhook
    // they should be a context data ref used in the auth policy
    prefixes: Set[String] = Set("input.object.record"),
    recordIdSqlRef: String = "records.recordid",
    tenantIdSqlRef: String = "records.tenantid",
    genericQuery: Boolean = false,
    genericQueryTableRef: String = "",
    genericQueryUseLowerCaseColumnName: Boolean = true
)

sealed trait AspectQuery {
  val aspectId: String
  val path: Seq[String]
  val negated: Boolean

  // interface for implementing logic of translating different types of AspectQuery to SQL queries
  // This translation is done within `record aspect` context.
  // i.e. assumes AspectQuery is querying a record's aspect.
  protected def sqlQueries(): Option[SQLSyntax]

  /*
     interface for implementing logic of translating different types of AspectQuery to SQL queries (in single table query context).
     i.e. reuse the AspectQuery structure in single table query context:
     - AspectId will be a column name of the table
     - if `path` is not Nil, the the column must contain JSON data and the `path` can be used to access it.
     sqlQueries() will generate SQL in context of querying a registry record
     this method will generate SQL query against any generic table.
     any aspects query will considered as query against table columns.
     As we made the assumption of "single table query", this method can't handle queries require multiple table join.
     We should extends AspectQuery to support that if it's required in future.
   */
  protected def genericSqlQueries(
      genericQueryTableRef: String = "",
      genericQueryUseLowerCaseColumnName: Boolean = true
  ): Option[SQLSyntax]

  protected def sqlWithAspectQuery(
      recordIdSqlRef: String,
      tenantIdSqlRef: String
  ): Option[SQLSyntax] = {
    val aspectQuerySql = sqlQueries
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

  protected def sqlWithGenericQuery(
      genericQueryTableRef: String,
      genericQueryUseLowerCaseColumnName: Boolean = true
  ): Option[SQLSyntax] = {
    if (negated) {
      genericSqlQueries(
        genericQueryTableRef,
        genericQueryUseLowerCaseColumnName
      ).map(SQLSyntax.roundBracket(_))
        .map(item => sqls"NOT ${item}")
    } else {
      genericSqlQueries(genericQueryTableRef)
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
      config: AspectQueryToSqlConfig = AspectQueryToSqlConfig()
  ): Option[SQLSyntax] = {
    if (aspectId.isEmpty) {
      throw new Error(
        s"Invalid AspectQuery: aspectId cannot be empty."
      )
    }
    // we move actual implementation to method `sqlWithAspectQuery` so we can reuse its logic when override `toSql`
    if (!config.genericQuery) {
      sqlWithAspectQuery(config.recordIdSqlRef, config.tenantIdSqlRef)
    } else {
      sqlWithGenericQuery(
        config.genericQueryTableRef,
        config.genericQueryUseLowerCaseColumnName
      )
    }
  }
}

class AspectQueryTrue extends AspectQuery {
  val aspectId: String = ""
  val path: Seq[String] = Nil
  val negated: Boolean = false

  def sqlQueries(): Option[SQLSyntax] =
    Some(SQLSyntax.createUnsafely("TRUE"))

  def genericSqlQueries(
      genericQueryTableRef: String = "",
      genericQueryUseLowerCaseColumnName: Boolean = true
  ): Option[SQLSyntax] = sqlQueries

  override def toSql(
      config: AspectQueryToSqlConfig = AspectQueryToSqlConfig()
  ) =
    sqlQueries

}

class AspectQueryFalse extends AspectQuery {
  val aspectId: String = ""
  val path: Seq[String] = Nil
  val negated: Boolean = false

  def sqlQueries(): Option[SQLSyntax] =
    Some(SQLSyntax.createUnsafely("FALSE"))

  def genericSqlQueries(
      genericQueryTableRef: String = "",
      genericQueryUseLowerCaseColumnName: Boolean = true
  ): Option[SQLSyntax] = sqlQueries

  override def toSql(
      config: AspectQueryToSqlConfig = AspectQueryToSqlConfig()
  ) =
    sqlQueries
}

case class AspectQueryExists(
    aspectId: String,
    path: Seq[String],
    negated: Boolean = false
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

  def genericSqlQueries(
      genericQueryTableRef: String = "",
      genericQueryUseLowerCaseColumnName: Boolean = true
  ): Option[SQLSyntax] = {
    val fieldRef = SQLUtils.getTableColumnName(
      aspectId,
      genericQueryTableRef,
      genericQueryUseLowerCaseColumnName
    )
    if (path.length > 0) {
      // has path: the field specified by aspectId is a JSON field
      Some(sqls"""
           ("${fieldRef}" #> string_to_array(${path
        .mkString(
          ","
        )}, ',')) IS NOT NULL
        """)
    } else {
      // no path. Only test whether field aspectId is NULL or not
      Some(SQLSyntax.isNotNull(fieldRef))
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
             COALESCE(${value.value}::${value.postgresType} $operator (data #>> string_to_array(${path
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

  def toSQLInRecordAspectQueryContext(
      recordIdSqlRef: String = "records.recordid",
      tenantIdSqlRef: String = "records.tenantid"
  ): Option[SQLSyntax] = {
    if (aspectId.isEmpty) {
      throw new Error(
        s"Invalid AspectQueryWithValue: aspectId cannot be empty."
      )
    }
    if (!path.isEmpty) {
      // normal aspect query
      sqlWithAspectQuery(recordIdSqlRef, tenantIdSqlRef)
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

  def genericSqlQueries(
      genericQueryTableRef: String = "",
      genericQueryUseLowerCaseColumnName: Boolean = true
  ): Option[SQLSyntax] = {
    val fieldRef = SQLUtils.getTableColumnName(
      aspectId,
      genericQueryTableRef,
      genericQueryUseLowerCaseColumnName
    )
    val tableDataRef = if (path.isEmpty) {
      sqls"${fieldRef}::${value.postgresType}"
    } else {
      sqls"${fieldRef} #>> string_to_array(${path
        .mkString(",")}, ','))::${value.postgresType}"
    }

    Some(if (placeReferenceFirst) {
      sqls"""
             COALESCE(${tableDataRef} $operator ${value.value}::${value.postgresType}, false)
          """
    } else {
      sqls"""
             COALESCE(${value.value}::${value.postgresType} $operator ${tableDataRef}, false)
          """
    })
  }

  override def toSql(
      config: AspectQueryToSqlConfig = AspectQueryToSqlConfig()
  ): Option[SQLSyntax] = {
    if (!config.genericQuery) {
      toSQLInRecordAspectQueryContext(
        config.recordIdSqlRef,
        config.tenantIdSqlRef
      )
    } else {
      sqlWithGenericQuery(
        config.genericQueryTableRef,
        config.genericQueryUseLowerCaseColumnName
      )
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

  /**
    * As it's an AspectQueryArrayNotEmpty (in array context), the column should contains JSON data.
    * When path is not empty, we will use it as JSON path for our query.
    * Otherwise, the column data should be a JSON array
    *
    * @param genericQueryTableRef
    * @return
    */
  def genericSqlQueries(
      genericQueryTableRef: String = "",
      genericQueryUseLowerCaseColumnName: Boolean = true
  ): Option[SQLSyntax] = {
    val fieldRef = SQLUtils.getTableColumnName(
      aspectId,
      genericQueryTableRef,
      genericQueryUseLowerCaseColumnName
    )
    val tableDataRef = if (path.isEmpty) {
      sqls"(${fieldRef} #> string_to_array('0',','))"
    } else {
      sqls"(${fieldRef} #> string_to_array(${(path :+ "0").mkString(
        ","
      )},','))"
    }
    Some(SQLSyntax.isNotNull(tableDataRef))
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

  def genericSqlQueries(
      genericQueryTableRef: String = "",
      genericQueryUseLowerCaseColumnName: Boolean = true
  ): Option[SQLSyntax] = {
    val fieldRef = SQLUtils.getTableColumnName(
      aspectId,
      genericQueryTableRef,
      genericQueryUseLowerCaseColumnName
    )
    val tableDataRef = if (path.isEmpty) {
      sqls"""COALESCE(
        (${fieldRef}::JSONB #> string_to_array('0',',')::JSONB) @> ${value.value}::TEXT::JSONB,
        FALSE
      )"""
    } else {
      sqls"""COALESCE(
        (${fieldRef}::JSONB #> string_to_array(${path
        .mkString(",")}, ',')::JSONB) @> ${value.value}::TEXT::JSONB,
        FALSE
      )"""
    }
    Some(SQLSyntax.isNotNull(tableDataRef))
  }
}

case class AspectQueryGroup(
    queries: Seq[AspectQuery],
    // determine when convert into SQL, should we use "AND" (when value is `true`) or "OR" (when value is `false`) to join all `AspectQuery` together
    joinWithAnd: Boolean = true,
    negated: Boolean = false
) {

  def toSql(
      config: AspectQueryToSqlConfig = AspectQueryToSqlConfig()
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
              aspectQuery.toSql(config)
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
              aspectQuery.toSql(config)
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
