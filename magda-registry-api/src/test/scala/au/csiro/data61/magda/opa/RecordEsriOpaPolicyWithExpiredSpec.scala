package au.csiro.data61.magda.opa

import akka.http.scaladsl.model.StatusCodes
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.registry._
import spray.json._

abstract class RecordEsriOpaPolicyWithExpiredSpec extends RecordEsriOpaPolicyWithInvalidAccessControlAspectSpec {
  override def prepareData(param: FixtureParam): Unit ={
    createAspectDefinitions(param)
    createRecords(param)
    import spray.json._
    val expired = JsObject("id"-> JsString("nsw-portal"), "data" -> JsObject("last crawl expiration" -> JsNumber(0)))
    updateExtraInput(expired)
  }
}
