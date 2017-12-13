package au.csiro.data61.magda.registry

import scalikejdbc.DB
import spray.json._



object GraphQLDataConnection {
  class Fetcher {
    def getRecord(id: String, aspects: List[String]) : GraphQLTypes.Record = {
      val dbAspects = aspects.map(gqlToDb)
      val record = (DB readOnly { session => {
        RecordPersistence.getByIdWithAspects(session, id, Nil, dbAspects)
      }}).get
      GraphQLTypes.Record(id = record.id, name = record.name, record.aspects.keys.toList.map(dbToGql), record.aspects.map { case (k,v) => (dbToGql(k), v) })
    }

    def getRecordsPage(pageToken: Option[String], filter: Option[GraphQLTypes.RecordFilter], aspects: List[String]) : GraphQLTypes.RecordsPageGraphQL = {
      // Convert the list of aspects to DB aspect names
      val dbAspects = aspects.map(gqlToDb)
      // Convert aspect names at the first level of filter to DB aspect names
      val filter2 = filter.map(x => x.copy(aspects = x.aspects.map(_.map { case (k,v) => gqlToDb(k) -> v } )))

      val page = DB readOnly { session => {
        RecordPersistence.getAllWithAspectsFiltered(session, dbAspects, filter2, pageToken)
      }}
      GraphQLTypes.RecordsPageGraphQL(
        records = page.records.map(r => GraphQLTypes.Record(id=r.id, name=r.name, aspectsList=Nil, aspects = r.aspects.map { case (k,v) => (dbToGql(k), v) })),
        totalCount = page.totalCount,
        nextPageToken = page.nextPageToken
      )
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
