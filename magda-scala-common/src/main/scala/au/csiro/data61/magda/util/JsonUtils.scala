package au.csiro.data61.magda.util

import au.csiro.data61.magda.ServerError
import spray.json._
import spray.json.JsValue
import org.json4s.native.JsonMethods._

object JsonUtils {

  def isArray(v: JsValue): Boolean = v match {
    case JsArray(_) => true
    case _          => false
  }

  def isObject(v: JsValue): Boolean = v match {
    case JsObject(_) => true
    case _           => false
  }

  def merge(a: JsValue, b: JsValue): JsValue = {
    if (!isArray(a) && !isObject(a)) {
      throw ServerError(
        s"Failed to merge Json: `${a.toString()}` must be an array or object",
        400
      )
    }

    if (!isArray(b) && !isObject(b)) {
      throw ServerError(
        s"Failed to merge Json: `${b.toString()}` must be an array or object",
        400
      )
    }

    if (isArray(a) != isArray(b)) {
      throw ServerError(
        s"Failed to merge Json: both json values should be in the same type",
        400
      )
    }
    compact(render(parse(a.toString) merge parse(b.toString))).parseJson
  }

}
