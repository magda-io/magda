package au.csiro.data61.magda.registry

import scalikejdbc._
import spray.json.JsonParser

import scala.util.Try
import scala.util.{Failure, Success}
import java.sql.SQLException

import spray.json._
import gnieh.diffson.sprayJson._

import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.model.TenantId._

object AspectPersistence extends Protocols with DiffsonProtocol {

  def getAll(
      tenantId: TenantId
  )(implicit session: DBSession): List[AspectDefinition] = {
    sql"select aspectId, name, jsonSchema, tenantId from Aspects where ${SQLUtil.tenantIdToWhereClause(tenantId)}"
      .map(rowToAspect)
      .list
      .apply()
  }

  def getById(
      id: String,
      tenantId: TenantId
  )(implicit session: DBSession): Option[AspectDefinition] = {
    sql"""select aspectId, name, jsonSchema, tenantId from Aspects where aspectId=$id and ${SQLUtil
      .tenantIdToWhereClause(tenantId)}""".map(rowToAspect).single.apply()
  }

  def getByIds(
      ids: Iterable[String],
      tenantId: TenantId
  )(implicit session: DBSession): List[AspectDefinition] = {
    if (ids.isEmpty)
      List()
    else {
      sql"""select aspectId, name, jsonSchema, tenantId from Aspects where ${SQLUtil
        .tenantIdToWhereClause(tenantId)} and aspectId in ($ids)"""
        .map(rowToAspect)
        .list
        .apply()
    }
  }

  def putById(
      id: String,
      newAspect: AspectDefinition,
      tenantId: SpecifiedTenantId,
      userId: String
  )(implicit session: DBSession): Try[AspectDefinition] = {
    for {
      _ <- if (id == newAspect.id) Success(newAspect)
      else
        Failure(
          new RuntimeException(
            "The provided ID does not match the aspect's ID."
          )
        )
      oldAspect <- this.getById(id, tenantId) match {
        case Some(aspect) => Success(aspect)
        case None         => create(newAspect, tenantId, userId)
      }
      aspectPatch <- Try {
        // Diff the old aspect and the new one
        val oldAspectJson = oldAspect.toJson
        val newAspectJson = newAspect.toJson

        JsonDiff.diff(oldAspectJson, newAspectJson, false)
      }
      result <- patchById(id, aspectPatch, tenantId, userId)
    } yield result
  }

  def patchById(
      id: String,
      aspectPatch: JsonPatch,
      tenantId: SpecifiedTenantId,
      userId: String
  )(implicit session: DBSession): Try[AspectDefinition] = {
    for {
      aspect <- this.getById(id, tenantId) match {
        case Some(aspect) => Success(aspect)
        case None =>
          Failure(new RuntimeException("No aspect exists with that ID."))
      }

      patchedAspect <- Try {
        val aspectJson = aspect.toJson
        val patchedJson = aspectPatch(aspectJson)
        patchedJson.convertTo[AspectDefinition]
      }

      testAspectPatch <- Try {
        // Diff the old aspect and the new one
        val oldAspectJson = aspect.toJson
        val newAspectJson = patchedAspect.toJson

        JsonDiff.diff(oldAspectJson, newAspectJson, false)
      }

      _ <- if (id == patchedAspect.id) Success(patchedAspect)
      else
        Failure(
          new RuntimeException("The patch must not change the aspect's ID.")
        )

      eventId <- Try {
        if (testAspectPatch.ops.length > 0) {
          val event = PatchAspectDefinitionEvent(
            id,
            aspectPatch,
            tenantId.tenantId
          ).toJson.compactPrint
          sql"insert into Events (eventTypeId, userId, tenantId, data) values (${PatchAspectDefinitionEvent.Id}, ${userId}::uuid, ${tenantId.tenantId}, $event::json)"
            .updateAndReturnGeneratedKey()
            .apply()
        } else {
          0
        }
      }

      _ <- Try {
        if (testAspectPatch.ops.length > 0) {
          val jsonString = patchedAspect.jsonSchema match {
            case Some(jsonSchema) => jsonSchema.compactPrint
            case None             => null
          }
          sql"""insert into Aspects (aspectId, tenantId, name, lastUpdate, jsonSchema) values (${patchedAspect.id}, ${tenantId.tenantId}, ${patchedAspect.name}, $eventId, $jsonString::json)
               on conflict (aspectId, tenantId) do update
               set name = ${patchedAspect.name}, lastUpdate = $eventId, jsonSchema = $jsonString::json
               """.update.apply()
        } else {
          0
        }
      }
    } yield patchedAspect
  }

  def create(
      aspect: AspectDefinition,
      tenantId: SpecifiedTenantId,
      userId: String
  )(implicit session: DBSession): Try[AspectDefinition] = {
    // Create a 'Create Aspect' event
    val eventJson = CreateAspectDefinitionEvent(
      aspect.id,
      aspect.name,
      aspect.jsonSchema,
      tenantId.tenantId
    ).toJson.compactPrint
    val eventId =
      sql"insert into Events (eventTypeId, userId, tenantId, data) values (${CreateAspectDefinitionEvent.Id}, ${userId}::uuid, ${tenantId.tenantId}, $eventJson::json)"
        .updateAndReturnGeneratedKey()
        .apply()

    // Create the actual Aspect
    try {
      val jsonString = aspect.jsonSchema match {
        case Some(jsonSchema) => jsonSchema.compactPrint
        case None             => null
      }
      sql"insert into Aspects (aspectId, tenantId, name, lastUpdate, jsonSchema) values (${aspect.id}, ${tenantId.tenantId}, ${aspect.name}, $eventId, $jsonString::json)".update
        .apply()
      Success(aspect)
    } catch {
      case e: SQLException =>
        Failure(
          new RuntimeException(
            "An aspect with the specified ID already exists."
          )
        )
    }
  }

  private def rowToAspect(rs: WrappedResultSet): AspectDefinition = {
    val jsonSchema: Option[JsObject] =
      if (rs.string("jsonSchema") == null) None
      else Some(JsonParser(rs.string("jsonSchema")).asJsObject)
    AspectDefinition(rs.string("aspectId"), rs.string("name"), jsonSchema)
  }
}
