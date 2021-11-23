package au.csiro.data61.magda.model

import spray.json.{DefaultJsonProtocol, JsFalse, JsValue}
import scalikejdbc.interpolation.SQLSyntax
import scalikejdbc._

object Auth {
  case class User(
      id: String,
      isAdmin: Boolean
  )

  case class ConciseOperand(
      isRef: Boolean,
      value: JsValue
  )

  case class ConciseExpression(
      negated: Boolean,
      operator: Option[String],
      operands: Vector[ConciseOperand]
  )

  case class ConciseRule(
      default: Boolean,
      value: JsValue,
      fullName: String,
      name: String,
      expressions: List[ConciseExpression]
  )

  case class AuthDecision(
      hasResidualRules: Boolean,
      result: Option[JsValue],
      residualRules: Option[List[ConciseRule]],
      hasWarns: Boolean,
      warns: Option[List[String]],
      unknowns: Option[List[String]] = None
  ) {

    def toRecordSQLQueries(): Seq[SQLSyntax] = {
      if(hasResidualRules){
        result match {
          case Some(JsFalse) =>
            // use FALSE to negate the whole query
            Seq(SQLSyntax.createUnsafely("FALSE"))
          case _ =>
            // Any non-false result will be considered as TRUE i.e. unconditional allowed
            // output empty SQL so the final query result will purely depends on business logic generated queries
            Seq(SQLSyntax.empty)
        }
      } else {
        // generate record aspect Queries
        Seq(SQLSyntax.empty)
      }
    }
  }

  trait AuthProtocols extends DefaultJsonProtocol {
    implicit val userFormat = jsonFormat2(User)
    implicit val conciseOperand = jsonFormat2(ConciseOperand)
    implicit val conciseExpressionFormat = jsonFormat3(ConciseExpression)
    implicit val conciseRuleFormat = jsonFormat5(ConciseRule)
    implicit val authDecisionFormat = jsonFormat5(AuthDecision)
  }
}
