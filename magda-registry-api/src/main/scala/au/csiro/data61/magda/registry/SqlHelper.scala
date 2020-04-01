package au.csiro.data61.magda.registry

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
import au.csiro.data61.magda.client.AuthOperations

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
      opaQueries: Option[List[(String, List[List[OpaQuery]])]],
      operationType: AuthOperations.OperationType,
      defaultPolicyId: Option[String]
  ): SQLSyntax = opaQueries match {
    case None             => SQL_TRUE
    case Some(opaQueries) =>
      /**
        * Builds the policy id clause for a policy id (e.g. Records.authnReadPolicyId =). Will also
        * insert a clause for nulls if this policy is the default.
        */
      def policyIdClause(policyId: String) = {
        val basePolicyIdClause = sqls"Records.authnReadPolicyId = ${policyId}"

        // If this policy is the default policy, we need to also apply it to records with a null value in the policy column
        defaultPolicyId match {
          case Some(innerDefaultPolicyId) if innerDefaultPolicyId == policyId =>
            sqls"($basePolicyIdClause OR Records.authnReadPolicyId IS NULL)"
          case _ => basePolicyIdClause
        }
      }

      val queries = opaQueries.flatMap {
        case (policyId, Nil) =>
          None
        case (policyId, List(List(OpaQueryAllMatched))) =>
          // No need for anything other than the policy id clause here, because a record with this policy is allowed to be read
          Some(sqls"(${policyIdClause(policyId)})")
        case (policyId, policyQueries) =>
          val policySqlStatements = SQLSyntax.joinWithOr(policyQueries.map {
            outerRule =>
              val queries = opaQueriesToWhereClauseParts(
                outerRule
              )

              SQLSyntax.joinWithAnd(
                queries: _*
              )
          }: _*)

          Some(
            sqls"""
            (
              ${policyIdClause(policyId)} AND EXISTS (
                SELECT 1 FROM recordaspects
                WHERE
                  Recordaspects.recordid = Records.recordid AND
                  (${policySqlStatements})
              )
            )
            """
          )
      }

      queries match {
        case Nil => SQL_TRUE
        case _   => sqls"""(${SQLSyntax.joinWithOr(queries: _*)})"""
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
      case AspectQueryExists(aspectId, path) =>
        sqls"""
             aspectid = $aspectId AND (data #> string_to_array(${path.mkString(
          ","
        )}, ',')) IS NOT NULL
        """
      case AspectQueryWithValue(
          aspectId,
          path,
          value,
          sqlComparator
          ) =>
        sqls"""
             aspectid = $aspectId AND (data #>> string_to_array(${path
          .mkString(",")}, ','))::${value.postgresType} $sqlComparator ${value.value}
        """
      case AspectQueryAnyInArray(
          aspectId,
          path,
          value
          ) =>
        sqls"""
             aspectid = $aspectId AND jsonb_exists((data #>> string_to_array(${path
          .mkString(",")}, ','))::JSONB, ${value.value})
        """
      case e => throw new Exception(s"Could not handle query $e")
    }
  }

  private val SQL_TRUE = sqls"true"
  private val SQL_FALSE = sqls"false"
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
  ): List[SQLSyntax] = opaQueries match {
    case Nil                       => List(SQL_TRUE)
    case List(OpaQueryAllMatched)  => List(SQL_TRUE)
    case List(OpaQueryNoneMatched) => List(SQL_FALSE)

    case _ =>
      val opaAspectQueries: List[AspectQuery] = opaQueries.map({
        // Query that's testing for the existence of a property, rather than its value
        case OpaQueryExists(
            OpaRefObjectKey("object")
              :: OpaRefObjectKey("registry")
              :: OpaRefObjectKey("record")
              :: OpaRefObjectKey(accessAspectId)
              :: restOfKeys
            ) =>
          AspectQueryExists(aspectId = accessAspectId, path = restOfKeys.map {
            case OpaRefObjectKey(key) => key
            case e =>
              throw new Exception("Could not understand " + e)
          })

        // Query that's testing for any value in an array matching a value
        case OpaQueryMatchValue(
            OpaRefObjectKey("object")
              :: OpaRefObjectKey("registry")
              :: OpaRefObjectKey("record")
              :: OpaRefObjectKey(accessAspectId)
              :: restOfKeys,
            Eq,
            aValue
            ) if (restOfKeys.last) == OpaRefAnyInArray =>
          AspectQueryAnyInArray(
            aspectId = accessAspectId,
            path = restOfKeys.flatMap {
              case OpaRefObjectKey(key) => Some(key)
              case OpaRefAnyInArray     => None
              case e =>
                throw new Exception("Could not understand " + e)
            },
            value = opaValueToAspectQueryValue(aValue)
          )

        // Simple, a = b style match
        case OpaQueryMatchValue(
            OpaRefObjectKey("object")
              :: OpaRefObjectKey("registry")
              :: OpaRefObjectKey("record")
              :: OpaRefObjectKey(accessAspectId)
              :: restOfKeys,
            operation,
            aValue
            ) =>
          AspectQueryWithValue(
            aspectId = accessAspectId,
            path = restOfKeys.map {
              case OpaRefObjectKey(key) => key
              case e =>
                throw new Exception("Could not understand " + e)
            },
            value = opaValueToAspectQueryValue(aValue),
            sqlComparator = convertToSql(operation)
          )
        case e => throw new Exception(s"Could not understand $e")
      })

      aspectQueriesToSql(opaAspectQueries)
  }

  private def opaValueToAspectQueryValue(value: OpaValue) = {
    value match {
      case OpaValueString(string)   => AspectQueryString(string)
      case OpaValueBoolean(boolean) => AspectQueryBoolean(boolean)
      case OpaValueNumber(bigDec)   => AspectQueryBigDecimal(bigDec)
    }
  }
}
