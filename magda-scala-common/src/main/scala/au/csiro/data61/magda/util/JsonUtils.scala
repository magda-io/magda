package au.csiro.data61.magda.util

import spray.json._
import spray.json.{JsValue}
import org.json4s.native.JsonMethods._

object JsonUtils {

  def merge(a: JsValue, b: JsValue): JsValue = {
    compact(render(parse(a.toString) merge parse(b.toString))).parseJson
  }

}
