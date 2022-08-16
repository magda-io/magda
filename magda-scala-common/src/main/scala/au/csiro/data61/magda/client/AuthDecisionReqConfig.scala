package au.csiro.data61.magda.client

import spray.json.JsObject

case class AuthDecisionReqConfig(
    operationUri: String,
    resourceUri: Option[String] = None,
    unknowns: Option[Seq[String]] = None,
    rawAst: Option[Boolean] = None,
    explain: Option[String] = None,
    pretty: Option[Boolean] = None,
    humanReadable: Option[Boolean] = None,
    concise: Option[Boolean] = None,
    input: Option[JsObject] = None
)

object AuthDecisionReqConfig {

  def apply(operationUri: String) =
    new AuthDecisionReqConfig(operationUri = operationUri)
}
