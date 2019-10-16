package au.csiro.data61.magda.registry

import au.csiro.data61.magda.opa.OpaConsts.ANY_IN_ARRAY
import au.csiro.data61.magda.opa.OpaTypes.{
  OpaOp,
  OpaQuery,
  OpaQueryAllMatched,
  OpaQueryMatchValue,
  OpaQuerySkipAccessControl,
  OpaRefObjectKey,
  OpaValueBoolean,
  OpaValueNumber,
  OpaValueString,
  _
}
import scalikejdbc._

object SqlHelper {

  /**
    * Translate multiple OPA queries into one SQL clause.
    *
    * @param opaQueries OPA queries
    * @param operationType OPA operation type (E.g. read)
    * @param recordId If non-empty, filter by this record ID.
    * @return a single SQL clause
    */
  def getOpaConditions(
      opaQueries: Seq[List[OpaQuery]],
      operationType: AuthOperations.OperationType,
      recordId: Option[String] = None,
      tenantId: Option[BigInt] = None
  ): SQLSyntax = {

    val conditions: SQLSyntax = if (opaQueries.nonEmpty) {
      SQLSyntax.joinWithOr(
        opaQueries.map(outerRule => {
          SQLSyntax.joinWithAnd(
            opaQueriesToWhereClauseParts(outerRule): _*
          )
        }): _*
      )
    } else {
      SQL_TRUE
    }

    if (conditions.equals(SQL_TRUE)) {
      conditions
    } else {
      val theRecordId =
        if (recordId.nonEmpty) sqls"${recordId.get}" else sqls"Records.recordId"

      val theTenantId =
        if (tenantId.nonEmpty) sqls"${tenantId.get}" else sqls"Records.tenantId"

      val accessControlAspectId = getAccessAspectId(opaQueries.head.head)

      sqls"""
          (EXISTS (
            SELECT 1 FROM records_without_access_control
            WHERE (recordid, tenantid)=($theRecordId, $theTenantId)) or
          exists (
            select 1 from recordaspects
            where (RecordAspects.recordId, RecordAspects.aspectId, RecordAspects.tenantId)=($theRecordId, $accessControlAspectId, $theTenantId) and
            ($conditions)
          ))
        """
    }
  }

  /**
    * Convert a given aspect query into SQL comparison clause.
    *
    * It performs string comparison between the query json field and the query value,
    * using the query comparator (=, >, >=, <, <=).
    *
    * Limitation
    *
    * It only supports string comparison, which might cause unexpected result. For example,
    * if A = 12 and B = 9, the expression "A > B" will be evaluated to "false".
    *
    * However, in the current application, the comparator other than "=" is only used in
    * the comparison between the expiration time and query time (numbers comparison, in
    * access control query), which will not cause any problem in a few hundred years time.
    *
    * @param query a given aspect query
    * @return SQL comparison clause
    */
  def aspectQueryToSql(
      query: AspectQuery
  ): SQLSyntax = {
    query match {
      case AspectQuery(
          _,
          List(fieldName, ANY_IN_ARRAY),
          value,
          SQL_EQ
          ) =>
        sqls"""
             jsonb_exists((data->>$fieldName)::jsonb, $value::text)
        """
      case AspectQuery(
          _,
          path,
          value,
          sqlComparator
          ) =>
        sqls"""
             data #>> string_to_array(${path
          .mkString(",")}, ',') $sqlComparator $value
        """
      case e => throw new Exception(s"Could not handle query $e")
    }
  }

  private val SQL_TRUE = sqls"true"
  private val SQL_EQ = SQLSyntax.createUnsafely("=")

  private def convertToSql(operation: OpaOp): SQLSyntax = {
    if (operation == Eq) SQLSyntax.createUnsafely("=")
    else if (operation == Gt) SQLSyntax.createUnsafely(">")
    else if (operation == Lt) SQLSyntax.createUnsafely("<")
    else if (operation == Gte) SQLSyntax.createUnsafely(">=")
    else if (operation == Lte) SQLSyntax.createUnsafely("<=")
    else
      throw new Exception("Could not understand " + operation)
  }

  private def aspectQueriesToSql(
      queries: List[AspectQuery]
  ): List[SQLSyntax] = {
    val sqlTerms: List[SQLSyntax] = queries.map(query => {
      aspectQueryToSql(query)
    })
    sqlTerms
  }

  private def getAccessAspectId(opaQuery: OpaQuery) = {
    opaQuery match {
      case OpaQueryMatchValue(
          OpaRefObjectKey("object")
            :: OpaRefObjectKey("registry")
            :: OpaRefObjectKey("record")
            :: OpaRefObjectKey(accessAspectId)
            :: _,
          _,
          _
          ) =>
        sqls"$accessAspectId"
      case e => throw new Exception(s"Could not find access aspect ID from $e.")
    }
  }

  private def opaQueriesToWhereClauseParts(
      opaQueries: List[OpaQuery]
  ): List[SQLSyntax] = {
    val theOpaQueries =
      if (opaQueries.nonEmpty) {
        opaQueries
      } else {
        List(OpaQuerySkipAccessControl)
      }

    if (theOpaQueries.contains(OpaQueryAllMatched) || theOpaQueries.contains(
          OpaQuerySkipAccessControl
        )) {
      List(SQL_TRUE)
    } else {
      val opaAspectQueries: List[AspectQuery] = theOpaQueries.map({
        case OpaQueryMatchValue(
            OpaRefObjectKey("object")
              :: OpaRefObjectKey("registry")
              :: OpaRefObjectKey("record")
              :: OpaRefObjectKey(accessAspectId)
              :: restOfKeys,
            operation,
            aValue
            ) =>
          AspectQuery(
            aspectId = accessAspectId,
            path = restOfKeys.map {
              case OpaRefObjectKey(key) => key
              case e =>
                throw new Exception("Could not understand " + e)
            },
            value = aValue match {
              case OpaValueString(string)   => string
              case OpaValueBoolean(boolean) => boolean.toString
              case OpaValueNumber(bigDec)   => bigDec.toString()
            },
            sqlComparator = convertToSql(operation)
          )
        case e => throw new Exception(s"Could not understand $e")
      })

      aspectQueriesToSql(opaAspectQueries)
    }
  }

}
