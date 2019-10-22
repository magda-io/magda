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
      recordPatch.ops
        .groupBy(
          op =>
            op.path match {
              case "aspects" / (name / _) => Some(name)
              case _                      => None
            }
        )
        .filterKeys(_.isDefined)
        .map({
          case (
            Some(aspectId),
            List(Add("aspects" / (_ / rest), aValue))
            ) =>
            if (rest == Pointer.Empty) {
              validate(aspectId, aValue.asJsObject, tenantId)(session, config)
            } else {
              validateWithAspectPatch(JsonPatch(Add(rest, aValue)), recordId, aspectId, tenantId)(session, config)
            }
          case (
            Some(aspectId),
            List(Remove("aspects" / (_ / rest), old))
            ) =>
            if(rest != Pointer.Empty) {
              validateWithAspectPatch(JsonPatch(Remove(rest, old)), recordId, aspectId, tenantId)(session, config)
            }
          // We patch in all other scenarios.
          case (Some(aspectId), operations) =>
            validateWithAspectPatch(JsonPatch(operations.map({
              // Make paths in operations relative to the aspect instead of the record
              case Add("aspects" / (_ / rest), aValue) =>
                Add(rest, aValue)
              case Remove("aspects" / (_ / rest), old) =>
                Remove(rest, old)
              case Replace("aspects" / (_ / rest), aValue, old) =>
                Replace(rest, aValue, old)
              case Move(
              "aspects" / (sourceName / sourceRest),
              "aspects" / (destName / destRest)
              ) =>
                if (sourceName != destName)
                // We can relax this restriction, and the one on Copy below, by turning a cross-aspect
                // Move into a Remove on one and an Add on the other.  But it's probably not worth
                // the trouble.
                  throw new RuntimeException(
                    "A patch may not move values between two different aspects."
                  )
                else
                  Move(sourceRest, destRest)
              case Copy(
              "aspects" / (sourceName / sourceRest),
              "aspects" / (destName / destRest)
              ) =>
                if (sourceName != destName)
                  throw new RuntimeException(
                    "A patch may not copy values between two different aspects."
                  )
                else
                  Copy(sourceRest, destRest)
              case Test("aspects" / (_ / rest), aValue) =>
                Test(rest, aValue)
              case _ =>
                throw new RuntimeException(
                  "The patch contains an unsupported operation for aspect " + aspectId
                )
            })), recordId, aspectId, tenantId)(session, config)
          case _ =>
            throw new RuntimeException(
              "Aspect ID is missing (this shouldn't be possible)."
            )
        })
    }

}
