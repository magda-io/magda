package au.csiro.data61.magda.registry

import scalikejdbc.DB
import spray.json._

class GraphQLDataFetcher {
  def getRecordsPage(pageToken: Option[String]) : GraphQLSchema.RecordsPageGraphQL = {
    DB readOnly { session => {
      val summariesPage = RecordPersistence.getAll(session, pageToken, null, null)
      GraphQLSchema.RecordsPageGraphQL(records = summariesPage.records.map(rs => GraphQLSchema.Record(id=rs.id, name=rs.name, aspectsList=rs.aspects, aspects = JsObject())), nextPageToken = summariesPage.nextPageToken.get)
    }}
  }
}
