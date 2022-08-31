package au.csiro.data61.magda.client

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.marshalling.{Marshal, ToEntityMarshaller}
import akka.http.scaladsl.model.{
  HttpHeader,
  HttpResponse,
  ResponseEntity,
  StatusCode
}
import au.csiro.data61.magda.model.Auth.{AuthDecision, AuthProtocols}
import spray.json.{JsObject, JsString, JsValue}

import scala.concurrent.{ExecutionContext, Future}
import io.lemonlabs.uri.Url

class MockAuthHttpFetcher(implicit ec: ExecutionContext)
    extends HttpFetcher
    with AuthProtocols
    with SprayJsonSupport {

  var authCallLog: List[(AuthDecision, String, Option[JsValue])] =
    List()

  /**
    * log a list of auth call parameters
    * @param authDecision
    * @param operationUri
    * @param input the context data that supplied to policy engine (if any).
    */
  def logAuthCall(
      authDecision: AuthDecision,
      operationUri: String,
      input: Option[JsValue]
  ): Unit = {
    authCallLog = (authDecision, operationUri, input) :: authCallLog
  }

  def totalCallTimes = authCallLog.length

  def callTimesByOperationUri(operationUri: String) =
    authCallLog.filter(_._2 == operationUri).length

  /**
    * a list of pre-setup authDecisions.
    * Can add / update authDecision for an operationUri via `setAuthDecision` method
    */
  var authDecisionList: Map[String, AuthDecision] = Map()

  def setAuthDecision(operationUri: String, decision: AuthDecision) = {
    authDecisionList += operationUri -> decision
  }

  var presetFixedResponse: Option[(StatusCode, String)] = None

  def setResponse(code: StatusCode, response: String) = {
    presetFixedResponse = Some(code, response)
  }

  var presetError: Option[Throwable] = None

  def setError(e: Throwable) = {
    presetError = Some(e)
  }

  def resetMock() = {
    authDecisionList = Map()
    authCallLog = List()
    presetFixedResponse = None
    presetError = None
  }

  private def getFieldFromPayload(fieldName: String, payload: Option[Any]) =
    payload match {
      case Some(v: JsObject) => v.fields.get(fieldName)
      case _                 => None
    }

  private def getOperationUriFromPayload(payload: Option[Any]): Option[String] =
    getFieldFromPayload("operationUri", payload).map {
      case JsString(value) => value
      case _ =>
        throw new Exception(s"Invalid operationUri type in payload: ${payload}")
    }

  private def locateAuthDecisionFromPath(
      url: String,
      payload: Option[Any] = None
  ) = {
    val baseUrl = "/v0/opa/decision/"
    val urlPath = Url.parse(url).path.toString()
    if ((urlPath + "/") != baseUrl && !urlPath.startsWith(baseUrl)) {
      throw new Exception(
        s"MockAuthHttpFetch received invalid request URL: ${url}"
      )
    } else {
      val requestOperationUri = getOperationUriFromPayload(payload).getOrElse(
        urlPath.substring(baseUrl.length)
      )
      val authDecision =
        authDecisionList.find(t => t._1 == requestOperationUri).map(_._2)
      if (authDecision.isEmpty) {
        throw new Exception(
          s"NockAuthHttpFetch cannot locate pre-setup authDecision for operationUri: ${requestOperationUri}"
        )
      } else {
        (requestOperationUri -> authDecision.get)
      }
    }
  }

  def get(
      path: String,
      headers: Seq[HttpHeader] = Seq()
  ): Future[HttpResponse] = {

    if (presetFixedResponse.isDefined) {
      Marshal(presetFixedResponse.get._2)
        .to[ResponseEntity]
        .map(
          authDecision =>
            HttpResponse(
              status = presetFixedResponse.get._1,
              entity = authDecision
            )
        )
    } else if (presetError.isDefined) {
      throw presetError.get
    } else {
      val lookupResult = locateAuthDecisionFromPath(path)
      val requestOperationUri = lookupResult._1
      val authDecision = lookupResult._2
      this.logAuthCall(authDecision, requestOperationUri, None)

      Marshal(authDecision)
        .to[ResponseEntity]
        .map(
          authDecision => HttpResponse(status = 200, entity = authDecision)
        )
    }
  }

  def post[T](
      path: String,
      payload: T,
      headers: Seq[HttpHeader] = Seq(),
      autoRetryConnection: Boolean = false
  )(
      implicit m: ToEntityMarshaller[T]
  ): Future[HttpResponse] = {
    if (presetFixedResponse.isDefined) {
      Marshal(presetFixedResponse.get._2)
        .to[ResponseEntity]
        .map(
          authDecision =>
            HttpResponse(
              status = presetFixedResponse.get._1,
              entity = authDecision
            )
        )
    } else if (presetError.isDefined) {
      throw presetError.get
    } else {
      val lookupResult = locateAuthDecisionFromPath(path, Some(payload))
      val requestOperationUri = lookupResult._1
      val authDecision = lookupResult._2
      this.logAuthCall(authDecision, requestOperationUri, payload match {
        case v: JsObject => v.fields.get("input")
        case _           => None
      })

      Marshal(authDecision)
        .to[ResponseEntity]
        .map(
          authDecision => HttpResponse(status = 200, entity = authDecision)
        )
    }
  }

  def put[T](
      path: String,
      payload: T,
      headers: Seq[HttpHeader] = Seq(),
      autoRetryConnection: Boolean = false
  )(
      implicit m: ToEntityMarshaller[T]
  ): Future[HttpResponse] = {
    if (presetFixedResponse.isDefined) {
      Marshal(presetFixedResponse.get._2)
        .to[ResponseEntity]
        .map(
          authDecision =>
            HttpResponse(
              status = presetFixedResponse.get._1,
              entity = authDecision
            )
        )
    } else if (presetError.isDefined) {
      throw presetError.get
    } else {
      val lookupResult = locateAuthDecisionFromPath(path, Some(payload))
      val requestOperationUri = lookupResult._1
      val authDecision = lookupResult._2
      this.logAuthCall(authDecision, requestOperationUri, payload match {
        case v: JsObject => v.fields.get("input")
        case _           => None
      })

      Marshal(authDecision)
        .to[ResponseEntity]
        .map(
          authDecision => HttpResponse(status = 200, entity = authDecision)
        )
    }
  }
}
