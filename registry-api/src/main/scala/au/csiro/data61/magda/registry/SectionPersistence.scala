package au.csiro.data61.magda.registry

import scalikejdbc._
import spray.json.JsonParser

import scala.util.Try
import scala.util.{Failure, Success}
import java.sql.SQLException

import spray.json._
import gnieh.diffson.sprayJson._

object SectionPersistence extends Protocols with DiffsonProtocol {
  def getAll(implicit session: DBSession): List[Section] = {
    sql"select sectionID, name, jsonSchema from Section".map(rowToSection).list.apply()
  }
  
  def getById(implicit session: DBSession, id: String): Option[Section] = {
    sql"""select sectionID, name, jsonSchema from Section where sectionID=$id""".map(rowToSection).single.apply()
  }
  
  def putById(implicit session: DBSession, id: String, newSection: Section): Try[Section] = {
    for {
      _ <- if (id == newSection.id) Success(newSection) else Failure(new RuntimeException("The provided ID does not match the section's ID."))
      oldSection <- this.getById(session, id) match {
        case Some(section) => Success(section)
        case None => create(session, newSection)
      }
      sectionPatch <- Try {
        // Diff the old section and the new one
        val oldSectionJson = oldSection.toJson
        val newSectionJson = newSection.toJson

        JsonDiff.diff(oldSectionJson, newSectionJson, false)
      }
      result <- patchById(session, id, sectionPatch)
    } yield result
  }

  def patchById(implicit session: DBSession, id: String, sectionPatch: JsonPatch): Try[Section] = {
    for {
      section <- this.getById(session, id) match {
        case Some(section) => Success(section)
        case None => Failure(new RuntimeException("No section exists with that ID."))
      }
      eventID <- Try {
        if (sectionPatch.ops.length > 0) {
          val event = PatchSectionDefinitionEvent(id, sectionPatch).toJson.compactPrint
          sql"insert into Events (eventTypeID, userID, data) values (${PatchSectionDefinitionEvent.ID}, 0, $event::json)".updateAndReturnGeneratedKey().apply()
        } else {
          0
        }
      }
      patchedSection <- Try {
        val sectionJson = section.toJson
        val patchedJson = sectionPatch(sectionJson)
        patchedJson.convertTo[Section]
      }
      _ <- if (id == patchedSection.id) Success(patchedSection) else Failure(new RuntimeException("The patch must not change the section's ID."))
      _ <- Try {
        if (sectionPatch.ops.length > 0) {
          val jsonString = patchedSection.jsonSchema match {
            case Some(jsonSchema) => jsonSchema.compactPrint
            case None => null
          }
          sql"""insert into Section (sectionID, name, lastUpdate, jsonSchema) values (${patchedSection.id}, ${patchedSection.name}, $eventID, $jsonString::json)
               on conflict (sectionID) do update
               set name = ${patchedSection.name}, lastUpdate = $eventID, jsonSchema = $jsonString::json
               """.update.apply()
        } else {
          0
        }
      }
    } yield patchedSection
  }

  def create(implicit session: DBSession, section: Section): Try[Section] = {
    // Create a 'Create Section' event
    val eventJson = CreateSectionDefinitionEvent(section).toJson.compactPrint
    val eventID = sql"insert into Events (eventTypeID, userID, data) values (${CreateSectionDefinitionEvent.ID}, 0, $eventJson::json)".updateAndReturnGeneratedKey().apply()

    // Create the actual Section
    try {
      val jsonString = section.jsonSchema match {
        case Some(jsonSchema) => jsonSchema.compactPrint
        case None => null
      }
      sql"insert into Section (sectionID, name, lastUpdate, jsonSchema) values (${section.id}, ${section.name}, $eventID, $jsonString::json)".update.apply()
      Success(section)
    } catch {
      case e: SQLException => Failure(new RuntimeException("A section with the specified ID already exists."))
    }
  }
  
  private def rowToSection(rs: WrappedResultSet): Section = {
    val jsonSchema: Option[JsObject] = if (rs.string("jsonSchema") == null) None else Some(JsonParser(rs.string("jsonSchema")).asJsObject)
    Section(
      rs.string("sectionID"),
      rs.string("name"),
      jsonSchema)
  }
}