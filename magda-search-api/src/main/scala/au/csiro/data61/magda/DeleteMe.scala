package au.csiro.data61.magda
import spray.json._
import DefaultJsonProtocol._

object DeleteMe {
  
  val source = scala.io.Source.fromFile("package.json").mkString
  val jsonAst = source.parseJson.asJsObject
  
   Map(
    "version" -> jsonAst.getFields("version").head.asInstanceOf[JsString].value
  )
}