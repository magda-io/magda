package au.csiro.data61.magda.registry

import scalikejdbc.DB
import spray.json._

class GraphQLDataFetcher {
  def getRecord(id: String) : GraphQLSchema.Record = {
    GraphQLSchema.Record(id = id, name = "made-up name", Nil, null)
  }
  // , paths: Vector[Vector[String]]
  def getRecordsPage(pageToken: Option[String], aspects: ) : GraphQLSchema.RecordsPageGraphQL = {
    DB readOnly { session => {
      val summariesPage = RecordPersistence.getAll(session, pageToken, null, null)
      GraphQLSchema.RecordsPageGraphQL(records = summariesPage.records.map(rs => GraphQLSchema.Record(id=rs.id, name=rs.name, aspectsList=rs.aspects, aspects = JsObject())), nextPageToken = summariesPage.nextPageToken.get)
    }}
  }
}
