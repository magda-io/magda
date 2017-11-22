package au.csiro.data61.magda.registry

import scalikejdbc.DB
import spray.json._



object GraphQLDataConnection {
  class Fetcher {
    def getRecord(id: String, aspects: List[String]) : GraphQLTypes.Record = {
      val dbAspects = aspects.map(gqlToDb)
      println("Database aspects: " + dbAspects)
      val record = (DB readOnly { session => {
        RecordPersistence.getByIdWithAspects(session, id, Nil, dbAspects)
      }}).get
      GraphQLTypes.Record(id = record.id, name = record.name, record.aspects.keys.toList.map(dbToGql), record.aspects.map { case (k,v) => (dbToGql(k), v)})
    }
    // , paths: Vector[Vector[String]]
    def getRecordsPage(pageToken: Option[String], aspects: List[String]) : GraphQLTypes.RecordsPageGraphQL = {
      DB readOnly { session => {
        val page = RecordPersistence.getAllWithAspects(session, Nil, aspects, pageToken)
        GraphQLTypes.RecordsPageGraphQL(
          records = page.records.map(r => GraphQLTypes.Record(id=r.id, name=r.name, aspectsList=Nil, aspects = r.aspects)),
          nextPageToken = page.nextPageToken.get
        )
      }}
    }
  }

  private val dbAspects = DB readOnly { session =>
    AspectPersistence.getAll(session)
  }
  private val aspectsWithSchema = dbAspects.filter(aspect => aspect.jsonSchema.isDefined)

  private def cleanAspectId(id: String): String = id.replaceAll("^([0-9])|[^A-Za-z0-9_]", "_$1")
  private val aspectNamingLink: List[(String, String)] = aspectsWithSchema.map(aspect => aspect.id -> cleanAspectId(aspect.id))

  private def dbToGql(dbAspectName: String): String = aspectNamingLink.find(_._1 == dbAspectName).get._2
  private def gqlToDb(gqlAspectName: String): String = aspectNamingLink.find(_._2 == gqlAspectName).get._1

  // O(n^2) on number of aspects
  val aspects: List[(String, JsObject)] = aspectsWithSchema.map(aspect => dbToGql(aspect.id) -> aspect.jsonSchema.get)

}
