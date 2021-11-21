package au.csiro.data61.magda.model

import spray.json.DefaultJsonProtocol
import spray.json.JsValue

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
      residualRules: Option[ConciseRule],
      hasWarns: Boolean,
      warns: Option[List[String]]
  )

  trait AuthProtocols extends DefaultJsonProtocol {
    implicit val userFormat = jsonFormat2(User)
    implicit val conciseOperand = jsonFormat2(ConciseOperand)
    implicit val conciseExpressionFormat = jsonFormat3(ConciseExpression)
    implicit val conciseRuleFormat = jsonFormat5(ConciseRule)
    implicit val authDecisionFormat = jsonFormat5(AuthDecision)
  }
}
