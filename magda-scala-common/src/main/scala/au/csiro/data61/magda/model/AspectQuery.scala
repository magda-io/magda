package au.csiro.data61.magda.model

import au.csiro.data61.magda.util.Regex._
import scalikejdbc._
import au.csiro.data61.magda.util.SQLUtils
import com.sksamuel.elastic4s.http.ElasticDsl
import com.sksamuel.elastic4s.searches.queries.{
  ExistsQuery,
  Query => EsDslQuery
}
import com.sksamuel.elastic4s.searches.queries.matches.{
  MatchAllQuery,
  MatchNoneQuery,
  MatchQuery
}

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

case class AspectQueryToEsDslConfig(
    prefixes: Set[String] = Set("input.object.dataset")
)

sealed trait AspectQuery {

  val registryRefToEsRefMappings = Map(
    "access-control" -> Map(
      "orgUnitId" -> "accessControl.orgUnitId",
      "ownerId" -> "accessControl.ownerId",
      "preAuthorisedPermissionIds" -> "accessControl.preAuthorisedPermissionIds"
    ),
    "dcat-dataset-strings" -> Map(
      "title" -> "title",
      "description" -> "description",
      "issued" -> "issued",
      "modified" -> "modified",
      "languages" -> "languages.keyword",
      "publisher" -> "publisher.name.keyword",
      "accrualPeriodicity" -> "accrualPeriodicity.keyword",
      "accrualPeriodicityRecurrenceRule" -> "accrualPeriodicityRecurrenceRule",
      "temporal.start" -> "temporal.start.date",
      "temporal.end" -> "temporal.end.date",
      "spatial" -> "spatial.geoJson",
      "themes" -> "themes.keyword",
      "keywords" -> "keywords.keyword",
      "contactPoint.id" -> "contactPoint.identifier",
      "landingPage" -> "landingPage.keyword"
    ),
    "access" -> Map(
      "location" -> "accessNotes.location.keyword",
      "notes" -> "accessNotes.notes.keyword"
    ),
    "dataset-quality-rating" -> Map(
      "rating.score" -> "quality",
      "rating.weighting" -> "quality"
    ),
    "provenance" -> Map(
      "mechanism" -> "provenance.mechanism.keyword",
      "sourceSystem" -> "provenance.sourceSystem.keyword",
      "affiliatedOrganizationIds" -> "provenance.affiliatedOrganizationIds.keyword",
      "isOpenData" -> "provenance.isOpenData"
    ),
    "publisher" -> Map(
      "id" -> "publisher.identifier",
      "title" -> "publisher.name.keyword",
      "source.id" -> "publisher.source.id.keyword",
      "source.name" -> "publisher.source.name.keyword",
      "source.url" -> "publisher.source.url.keyword",
      "organization-details.title" -> "publisher.name.keyword",
      "organization-details.jurisdiction" -> "publisher.jurisdiction.keyword",
      "organization-details.description" -> "publisher.description.keyword",
      "organization-details.imageUrl" -> "publisher.imageUrl",
      "organization-details.phone" -> "publisher.phone",
      "organization-details.email" -> "publisher.email",
      "organization-details.addrStreet" -> "publisher.addrStreet",
      "organization-details.addrSuburb" -> "publisher.addrSuburb",
      "organization-details.addrState" -> "publisher.addrState",
      "organization-details.addrPostCode" -> "publisher.addrPostCode",
      "organization-details.addrCountry" -> "publisher.addrCountry",
      "organization-details.website" -> "publisher.website"
    ),
    "organization-details" -> Map(
      "id" -> "publisher.identifier",
      "title" -> "publisher.name.keyword",
      "jurisdiction" -> "publisher.jurisdiction.keyword",
      "description" -> "publisher.description.keyword",
      "imageUrl" -> "publisher.imageUrl",
      "phone" -> "publisher.phone",
      "email" -> "publisher.email",
      "addrStreet" -> "publisher.addrStreet",
      "addrSuburb" -> "publisher.addrSuburb",
      "addrState" -> "publisher.addrState",
      "addrPostCode" -> "publisher.addrPostCode",
      "addrCountry" -> "publisher.addrCountry",
      "website" -> "publisher.website"
    ),
    "publishing" -> Map(
      "state" -> "publishingState"
    ),
    "source" -> Map(
      "id" -> "source.id.keyword",
      "name" -> "source.name.keyword",
      "originalName" -> "source.originalName.keyword",
      "originalUrl" -> "source.originalUrl",
      "url" -> "source.url"
    )
  )

  val aspectId: String
  val path: Seq[String]
  val negated: Boolean

  // interface for implementing logic of translating different types of AspectQuery to ElasticSearch DSL queries
  protected def esDslQueries(): Option[EsDslQuery]

  protected def getEsFieldPath(): Option[String] = {
    if (aspectId == "tenantId") {
      Some(aspectId)
    } else if (aspectId == "id") {
      Some("identifier")
    } else if (aspectId.isEmpty || registryRefToEsRefMappings
                 .get(aspectId)
                 .isEmpty || path.isEmpty) {
      None
    } else {
      val mappings = registryRefToEsRefMappings(aspectId)
      val fieldPath = path.mkString(".")
      mappings.get(fieldPath)
    }
  }

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
    * @param config AspectQueryToSqlConfig
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

  /**
    * Public interface of all types of AspectQuery. Call this method to covert AspectQuery to ElasticSearch DSL query.
    * @param config AspectQueryToEsDslConfig
    * @return
    */
  def toEsDsl(
      config: AspectQueryToEsDslConfig = AspectQueryToEsDslConfig()
  ): Option[EsDslQuery] = esDslQueries
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

  def esDslQueries(): Option[EsDslQuery] =
    Some(MatchAllQuery())

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

  def esDslQueries(): Option[EsDslQuery] =
    Some(MatchNoneQuery())
}

case class AspectQueryExists(
    aspectId: String,
    path: Seq[String],
    negated: Boolean = false
) extends AspectQuery {

  def esDslQueries(): Option[EsDslQuery] = {
    val field = getEsFieldPath
    if (field.isEmpty) {
      throw new Exception(
        s"Failed to create ES DSL query: cannot convert registry ref to es ref: ${aspectId} / ${path
          .mkString(".")}"
      )
    }
    if (!negated) {
      Some(ExistsQuery(field.get))
    } else {
      Some(ElasticDsl.boolQuery().not(ExistsQuery(field.get)))
    }
  }

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
           (${fieldRef} #> string_to_array(${path
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

  def esDslQueries(): Option[EsDslQuery] = {
    val fieldOpt = getEsFieldPath
    if (fieldOpt.isEmpty) {
      throw new Exception(
        s"Failed to create ES DSL query: cannot convert registry ref to es ref: ${aspectId} / ${path
          .mkString(".")}"
      )
    }
    val field = fieldOpt.get
    val query = operator.value match {
      case "=" => ElasticDsl.termQuery(field, value.esValue)
      case ">" =>
        if (placeReferenceFirst) {
          ElasticDsl.rangeQuery(field).copy(gt = Some(value.esValue))
        } else {
          ElasticDsl.rangeQuery(field).copy(lt = Some(value.esValue))
        }
      case "<" =>
        if (placeReferenceFirst) {
          ElasticDsl.rangeQuery(field).copy(lt = Some(value.esValue))
        } else {
          ElasticDsl.rangeQuery(field).copy(gt = Some(value.esValue))
        }
      case ">=" =>
        if (placeReferenceFirst) {
          ElasticDsl.rangeQuery(field).copy(gte = Some(value.esValue))
        } else {
          ElasticDsl.rangeQuery(field).copy(lte = Some(value.esValue))
        }
      case "<=" =>
        if (placeReferenceFirst) {
          ElasticDsl.rangeQuery(field).copy(lte = Some(value.esValue))
        } else {
          ElasticDsl.rangeQuery(field).copy(gte = Some(value.esValue))
        }
      case unknownOp =>
        throw new Exception(s"Unrecognised operator ${unknownOp}")
    }

    if (!negated) {
      Some(query)
    } else {
      Some(ElasticDsl.boolQuery().not(query))
    }
  }

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
        val recordQuery =
          sqls"SELECT 1 FROM records as record_tbl_sub_query_ref".where(
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
      sqls"(${fieldRef} #>> string_to_array(${path
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

  def esDslQueries(): Option[EsDslQuery] = {
    val fieldOpt = getEsFieldPath
    if (fieldOpt.isEmpty) {
      throw new Exception(
        s"Failed to create ES DSL query: cannot convert registry ref to es ref: ${aspectId} / ${path
          .mkString(".")}"
      )
    }
    val field = fieldOpt.get
    if (!negated) {
      Some(ExistsQuery(field))
    } else {
      Some(ElasticDsl.boolQuery().not(ExistsQuery(field)))
    }
  }

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

  override def esDslQueries(): Option[EsDslQuery] = {
    val fieldOpt = getEsFieldPath
    if (fieldOpt.isEmpty) {
      throw new Exception(
        s"Failed to create ES DSL query: cannot convert registry ref to es ref: ${aspectId} / ${path
          .mkString(".")}"
      )
    }
    val field = fieldOpt.get
    val query = MatchQuery(field, value.esValue)
    if (!negated) {
      Some(query)
    } else {
      Some(ElasticDsl.boolQuery().not(query))
    }
  }

  def sqlQueries(): Option[SQLSyntax] = {
    if (path.isEmpty) {
      throw new Error(
        s"Invalid AspectQueryValueInArray for aspectId `${aspectId}` path cannot be empty."
      )
    }
    Some(sqls"""
           COALESCE(
              (
                (data::JSONB #> string_to_array(${path
      .mkString(",")}, ','))::JSONB
              ) @> to_json(${value.value})::JSONB,
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
        (
          (${fieldRef}::JSONB #> string_to_array('0',','))::JSONB
        ) @> to_json(${value.value})::JSONB,
        FALSE
      )"""
    } else {
      sqls"""COALESCE(
        (
          (${fieldRef}::JSONB #> string_to_array(${path
        .mkString(",")}, ','))::JSONB
        ) @> to_json(${value.value})::JSONB,
        FALSE
      )"""
    }
    Some(tableDataRef)
  }
}

case class AspectQueryGroup(
    queries: Seq[AspectQuery],
    // determine when convert into SQL, should we use "AND" (when value is `true`) or "OR" (when value is `false`) to join all `AspectQuery` together
    joinWithAnd: Boolean = true,
    negated: Boolean = false
) {

  def toEsDsl(
      config: AspectQueryToEsDslConfig = AspectQueryToEsDslConfig()
  ): Option[EsDslQuery] = {
    if (queries.isEmpty) {
      return None
    }
    val joinedQuery = if (joinWithAnd) {
      if (queries.exists {
            case _: AspectQueryFalse => true
            case _                   => false
          }) {
        // when unconditional FALSE exist, joinWithAnd should to evaluated to FALSE
        MatchNoneQuery()
      } else {
        val esQueries = queries.map {
          // unconditional true can be skipped in AND
          case _: AspectQueryTrue => None
          case aspectQuery =>
            aspectQuery.toEsDsl(config)
        }.flatten

        if (esQueries.isEmpty) {
          MatchAllQuery()
        } else {
          ElasticDsl
            .boolQuery()
            // use `must` for AND
            .must(esQueries)
        }
      }
    } else {
      if (queries.exists {
            case _: AspectQueryTrue => true
            case _                  => false
          }) {
        // when unconditional TRUE exist, joinWithOr should to evaluated to TRUE
        MatchAllQuery()
      } else {
        val esQueries = queries.map {
          // unconditional false can be skipped in OR
          case _: AspectQueryFalse => None
          case aspectQuery =>
            aspectQuery.toEsDsl(config)
        }.flatten

        if (esQueries.isEmpty) {
          MatchNoneQuery()
        } else {
          ElasticDsl
            .boolQuery()
            // use `should` for OR
            .should(esQueries)
        }
      }
    }
    if (negated) {
      Some(
        ElasticDsl
          .boolQuery()
          .not(joinedQuery)
      )
    } else {
      Some(joinedQuery)
    }
  }

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
        Some(
          SQLSyntax
            .toAndConditionOpt(
              queries.map {
                // unconditional true can be skipped in AND
                case _: AspectQueryTrue => None
                case aspectQuery =>
                  aspectQuery.toSql(config)
              }: _*
            )
            .getOrElse(SQLUtils.SQL_TRUE)
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
        Some(
          SQLSyntax
            .toOrConditionOpt(
              queries.map {
                // unconditional false can be skipped in OR
                case _: AspectQueryFalse => None
                case aspectQuery =>
                  aspectQuery.toSql(config)
              }: _*
            )
            .getOrElse(SQLUtils.SQL_FALSE)
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
  val esValue: Any
  val postgresType: SQLSyntax
}

case class AspectQueryStringValue(string: String) extends AspectQueryValue {
  val value = sqls"${string}"
  val esValue = string
  val postgresType = SQLSyntax.createUnsafely("TEXT")
}

case class AspectQueryBooleanValue(boolean: Boolean) extends AspectQueryValue {
  val value = sqls"${boolean}"
  val esValue = boolean
  val postgresType = SQLSyntax.createUnsafely("BOOL")
}

case class AspectQueryBigDecimalValue(bigDecimal: BigDecimal)
    extends AspectQueryValue {
  val value = sqls"${bigDecimal}"
  val esValue = bigDecimal.toDouble
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
    * `:<|` contains the value
    * `:!<|` not contains the value
    *
    * Value after the operator should be in `application/x-www-form-urlencoded` MIME format
    * Example URL with aspectQuery: dcat-dataset-strings.title:?%rating% (Search keyword `rating` in `dcat-dataset-strings` aspect `title` field)
    * /v0/records?limit=100&optionalAspect=source&aspect=dcat-dataset-strings&aspectQuery=dcat-dataset-strings.title:?%2525rating%2525
    */
  val operatorValueRegex = raw"^(.+)(:[!><=?~|]*)(.+)$$".r
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
      case ":<|" =>
        AspectQueryValueInArray(
          aspectId = pathParts.head,
          path = pathParts.tail,
          value = if (numericValueRegex matches valueStr) {
            AspectQueryBigDecimalValue(valueStr.toDouble)
          } else {
            AspectQueryStringValue(valueStr)
          }
        )
      case ":!<|" =>
        AspectQueryValueInArray(
          aspectId = pathParts.head,
          path = pathParts.tail,
          value = if (numericValueRegex matches valueStr) {
            AspectQueryBigDecimalValue(valueStr.toDouble)
          } else {
            AspectQueryStringValue(valueStr)
          },
          true
        )
      case _ =>
        throw new Error(s"Unsupported aspectQuery operator: ${opStr}")
    }

  }
}
