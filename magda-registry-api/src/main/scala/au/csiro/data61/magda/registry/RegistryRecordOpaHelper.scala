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

object RegistryRecordOpaHelper {
  private val SQL_TRUE = sqls"true"

  def getOpaConditions(
      opaQueries: Seq[List[OpaQuery]],
      operationType: AuthOperations.OperationType,
      recordId: String = ""
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
        if (recordId.nonEmpty) sqls"$recordId" else sqls"Records.recordId"

      val accessControlAspectId = getAccessAspectId(opaQueries.head.head)

      sqls"""
          (EXISTS (
            SELECT 1 FROM records_without_access_control
            WHERE (recordid, tenantid)=($theRecordId, records.tenantId)) or
          exists (
            select 1 from recordaspects
            where (RecordAspects.recordId, RecordAspects.aspectId, RecordAspects.tenantId)=($theRecordId, $accessControlAspectId, Records.tenantId) and
            ($conditions)
          ))
        """
    }
  }

  private def convertToSql(operation: OpaOp) = {
    if (operation == Eq) "="
    else if (operation == Gt) ">"
    else if (operation == Lt) "<"
    else if (operation == Gte) ">="
    else if (operation == Lte) "<="
    else
      throw new Exception("Could not understand " + operation)
  }

  private def opaAspectToSql(
      queries: List[AspectQuery]
  ): List[SQLSyntax] = {
    val sqlTerms: List[SQLSyntax] = queries.map(query => {
      val operation = SQLSyntax.createUnsafely(query.operation)
      val equalsOrContainsClauses =
        if (query.path.length == 2 && query.path(1).equals(ANY_IN_ARRAY)) {
          sqls"""
               jsonb_exists((data->>${query.path.head})::jsonb, ${query.value}::text)
          """
        } else {
          sqls"""
               data #>> string_to_array(${query.path
            .mkString(",")}, ',') $operation ${query.value}
          """
        }
      equalsOrContainsClauses
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
            operation = convertToSql(operation)
          )
        case e => throw new Exception(s"Could not understand $e")
      })

      opaAspectToSql(opaAspectQueries)
    }
  }

}
