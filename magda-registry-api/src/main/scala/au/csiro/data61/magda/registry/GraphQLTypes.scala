package au.csiro.data61.magda.registry

import spray.json._


object GraphQLTypes {
  case class Record(id: String, name: String, aspectsList: List[String], aspects: Map[String, JsValue])
  case class RecordsPageGraphQL(records: List[Record], nextPageToken: String)
}
