package au.csiro.data61.magda.util

import au.csiro.data61.magda.ServerError
import spray.json._
import spray.json.JsValue
import org.json4s.native.JsonMethods._
import com.jayway.jsonpath.{JsonPath, PathNotFoundException}
import net.minidev.json.{JSONArray, JSONValue}

import scala.util.{Failure, Success, Try}

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

  def deleteJsonArrayItemsByJsonPath(
      jsonData: JsValue,
      jsonPath: String,
      itemsToDelete: Seq[JsValue]
  ): JsValue = {
    val doc = JsonPath.parse(jsonData.toString())
    (Try {
      val readResult: JSONArray = doc.read(jsonPath)
      Option(readResult) // when a null json value is read, this will become a None
    } match {
      case Success(Some(v)) =>
        Some(v.toString().parseJson.asInstanceOf[JsArray])
      case Success(None)                     => None
      case Failure(e: PathNotFoundException) => None
      case Failure(e)                        => throw e
    }).map { v =>
        val newArray =
          JsArray(v.elements.filter(item => !itemsToDelete.contains(item)))
        val jsonSmartVal =
          JSONValue.parseWithException(newArray.toString()) match {
            case v: JSONArray => v
            case _ =>
              throw ServerError("Failed to convert json to JSONArray", 500)
          }
        doc.set(jsonPath, jsonSmartVal).jsonString().parseJson
      }
      .getOrElse(jsonData) // None indicate no data found at JsonPath
  }

}
