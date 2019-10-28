package au.csiro.data61.magda.registry

import au.csiro.data61.magda.model.Registry._
import scalikejdbc._
import spray.json._
import org.everit.json.schema.loader.SchemaLoader
import org.json.JSONObject
import com.typesafe.config.Config
import gnieh.diffson._
import gnieh.diffson.sprayJson._


object AspectValidator {

    def shouldValidate(config: Config) = {
      // --- if not set default value is true
      if(!config.hasPath("validateJsonSchema")) false
      else config.getBoolean("validateJsonSchema")
    }

    def validate(aspectId:String, aspectData: JsObject, tenantId: BigInt)(implicit session: DBSession, config: Config) {
      if(shouldValidate(config)) {
        AspectPersistence.getById(session, aspectId, tenantId) match {
          case Some(aspectDef) => validateWithDefinition(aspectDef, aspectData)
          case None => throw new Exception(s"Failed to validate aspect data: Cannot locate aspect definition for aspect id: ${aspectId}")
        }
      }
    }

    def validateAspects(aspects: Map[String, JsObject], tenantId: BigInt)(implicit session: DBSession, config: Config): Unit = {
      aspects.foreach( aspect => validate(aspect._1, aspect._2, tenantId))
    }

    def validateWithDefinition(aspectDef: AspectDefinition, aspectData: JsObject): Unit ={
      if(!aspectDef.jsonSchema.isDefined) {
        throw new Exception(s"Failed to validate aspect data: Cannot locate json schema for aspect id: ${aspectDef.id}")
      }
      val rawSchema = new JSONObject(aspectDef.jsonSchema.get.toString())
      val schema = SchemaLoader.load(rawSchema)
      schema.validate(new JSONObject(aspectData.toString))
    }

    def validateWithAspectPatch(aspectPatch: JsonPatch, recordId: String, aspectId: String, tenantId: BigInt)(implicit session: DBSession, config: Config): Unit = {
      val originalAspect = (DefaultRecordPersistence.getRecordAspectById(session, tenantId, recordId, aspectId) match {
        case Some(aspect) => aspect
        case None => JsObject()
      })
      val patchedAspect = aspectPatch(originalAspect).asJsObject
      validate(aspectId, patchedAspect, tenantId)(session, config)
    }

    def validateWithRecordPatch(recordPatch: JsonPatch, recordId: String, tenantId: BigInt)(implicit session: DBSession, config: Config): Unit = {
      DefaultRecordPersistence.processRecordPatchOperationsOnAspects(recordPatch, (aspectId: String, aspectData: JsObject) => {
        validate(aspectId, aspectData, tenantId)(session, config)
      }, (aspectId: String, aspectPatch: JsonPatch) => {
        validateWithAspectPatch(aspectPatch, recordId, aspectId, tenantId)(session, config)
      }, (aspectId: String) => Unit)
    }

}
