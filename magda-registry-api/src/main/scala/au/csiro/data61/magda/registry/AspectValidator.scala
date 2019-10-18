package au.csiro.data61.magda.registry

import au.csiro.data61.magda.model.Registry._
import scalikejdbc._
import spray.json._
import org.everit.json.schema.loader.SchemaLoader
import org.json.JSONObject
import com.typesafe.config.Config


object AspectValidator {

    def shouldValidate(config: Config) = {
      // --- if not set default value is true
      if(!config.hasPath("validateJsonSchema")) true
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
      val rawSchema = new JSONObject(aspectDef.jsonSchema.get.toJson)
      val schema = SchemaLoader.load(rawSchema)
      schema.validate(new JSONObject(aspectData.toJson))
    }

}
