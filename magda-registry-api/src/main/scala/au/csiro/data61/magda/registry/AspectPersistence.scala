package au.csiro.data61.magda.registry

import au.csiro.data61.magda.model.AspectQueryToSqlConfig
import au.csiro.data61.magda.model.Auth.{
  AuthDecision,
  UnconditionalTrueDecision
}
import scalikejdbc._
import spray.json.JsonParser

import scala.util.Try
import scala.util.{Failure, Success}
import java.sql.SQLException
import spray.json._
import gnieh.diffson.sprayJson._
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.model.TenantId._
import au.csiro.data61.magda.util.SQLUtils
import scalikejdbc.interpolation.SQLSyntax

/**
  * Thrown by `AspectPersistence.deleteById` when the aspect definition is still referenced by
  * record aspect data and therefore must not be deleted. A dedicated exception type lets the
  * `AspectsService` delete route distinguish this "in use" case (mapped to `409 Conflict`) from
  * other failures (mapped to `400`). `recordCount` is the number of referencing records and is
  * surfaced in the error message.
  */
class AspectInUseException(val recordCount: Long)
    extends Exception(
      s"Cannot delete the aspect definition: $recordCount record(s) still reference it. Delete the referencing record aspect data first."
    )

object AspectPersistence extends Protocols with DiffsonProtocol {

  def getAll(
      tenantId: TenantId,
      authDecision: AuthDecision
  )(implicit session: DBSession): List[AspectDefinition] = {

    val authDecisionCondition =
      authDecision.toSql(
        AspectQueryToSqlConfig(
          prefixes = Set("input.object.aspect"),
          genericQuery = true
        )
      )

    val whereClauseParts = Seq(authDecisionCondition) :+ SQLUtils
      .tenantIdToWhereClause(tenantId, "tenantid")

    sql"select aspectId, name, jsonSchema, tenantId from Aspects ${SQLSyntax
      .where(SQLUtils.toAndConditionOpt(whereClauseParts: _*))}"
      .map(rowToAspect)
      .list
      .apply()
  }

  def getById(
      id: String,
      tenantId: TenantId,
      authDecision: AuthDecision
  )(implicit session: DBSession): Option[AspectDefinition] = {
    val authDecisionCondition =
      authDecision.toSql(
        AspectQueryToSqlConfig(
          prefixes = Set("input.object.aspect"),
          genericQuery = true
        )
      )

    val whereClauseParts = Seq(authDecisionCondition) :+ SQLUtils
      .tenantIdToWhereClause(tenantId, "tenantid") :+ Some(
      SQLSyntax.eq(sqls"aspectId", id)
    )

    sql"select aspectId, name, jsonSchema, tenantId from Aspects ${SQLSyntax
      .where(SQLUtils.toAndConditionOpt(whereClauseParts: _*))}"
      .map(rowToAspect)
      .single
      .apply()
  }

  def getByIds(
      ids: Iterable[String],
      tenantId: TenantId,
      authDecision: AuthDecision
  )(implicit session: DBSession): List[AspectDefinition] = {
    if (ids.isEmpty)
      List()
    else {
      val authDecisionCondition =
        authDecision.toSql(
          AspectQueryToSqlConfig(
            prefixes = Set("input.object.aspect"),
            genericQuery = true
          )
        )

      val whereClauseParts = Seq(authDecisionCondition) :+ SQLUtils
        .tenantIdToWhereClause(tenantId, "tenantid") :+ Some(
        SQLSyntax.in(sqls"aspectId", ids.toSeq)
      )

      sql"select aspectId, name, jsonSchema, tenantId from Aspects ${SQLSyntax
        .where(SQLUtils.toAndConditionOpt(whereClauseParts: _*))}"
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
      oldAspect <- this.getById(id, tenantId, UnconditionalTrueDecision) match {
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
      aspect <- this.getById(id, tenantId, UnconditionalTrueDecision) match {
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
    Try {
      val jsonString = aspect.jsonSchema match {
        case Some(jsonSchema) => jsonSchema.compactPrint
        case None             => null
      }
      sql"insert into Aspects (aspectId, tenantId, name, lastUpdate, jsonSchema) values (${aspect.id}, ${tenantId.tenantId}, ${aspect.name}, $eventId, $jsonString::json)".update
        .apply()
      aspect
    }
  }

  /**
    * Delete an aspect definition, tenant-scoped. Mirrors `RecordPersistence.deleteRecord`.
    *
    * Safety guard: the definition is deleted only when NO record aspect data references the
    * aspect within the tenant. If any does, this returns `Failure(AspectInUseException)` and
    * nothing is deleted (no event emitted). When the aspect does not exist, nothing is deleted
    * and no event is emitted either.
    *
    * A `DeleteAspectDefinitionEvent` is emitted only when a row is actually removed. The whole
    * operation runs in the caller's transaction (`DB localTx`), so the in-use check and the
    * delete are atomic with respect to that transaction.
    *
    * @return `(deleted, eventId)` — `deleted` is true iff a row was removed; `eventId` is the
    *         generated event id, or `0L` when nothing was deleted.
    */
  def deleteById(
      aspectId: String,
      tenantId: SpecifiedTenantId,
      userId: String
  )(implicit session: DBSession): Try[(Boolean, Long)] = {
    for {
      // count record-aspect data referencing this aspect within the tenant
      referencingCount <- Try {
        sql"select count(*) from RecordAspects where (aspectId, tenantId)=($aspectId, ${tenantId.tenantId})"
          .map(_.long(1))
          .single
          .apply()
          .getOrElse(0L)
      }
      // refuse (and delete nothing) when the aspect is still in use
      _ <- if (referencingCount > 0)
        Failure(new AspectInUseException(referencingCount))
      else Success(referencingCount)
      rowsDeleted <- Try {
        sql"""delete from Aspects where (aspectId, tenantId)=($aspectId, ${tenantId.tenantId})""".update
          .apply()
      }
      eventId <- Try {
        if (rowsDeleted > 0) {
          // --- only generate event when the aspect was actually removed
          val eventJson =
            DeleteAspectDefinitionEvent(aspectId, tenantId.tenantId).toJson.compactPrint
          sql"insert into Events (eventTypeId, userId, tenantId, data) values (${DeleteAspectDefinitionEvent.Id}, ${userId}::uuid, ${tenantId.tenantId}, $eventJson::json)".updateAndReturnGeneratedKey
            .apply()
        } else {
          // --- No aspect was deleted, return 0 as event ID
          0L
        }
      }
    } yield (rowsDeleted > 0, eventId)
  }

  private def rowToAspect(rs: WrappedResultSet): AspectDefinition = {
    val jsonSchema: Option[JsObject] =
      if (rs.string("jsonSchema") == null) None
      else Some(JsonParser(rs.string("jsonSchema")).asJsObject)
    AspectDefinition(rs.string("aspectId"), rs.string("name"), jsonSchema)
  }
}
