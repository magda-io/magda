package au.csiro.data61.magda.registry

import spray.json._


object GraphQLTypes {
  case class Record(id: String, name: String, aspectsList: List[String], aspects: Map[String, JsValue])
  case class RecordsPageGraphQL(records: List[Record], totalCount: Int, nextPageToken: Option[String])
//  case class RecordFilter(_and: Option[List[RecordFilter]] = None, _or: Option[List[RecordFilter]] = None, id: Option[String] = None, id_in: Option[List[String]] = None)
  case class RecordFilter(id: Option[String], aspects: Option[Map[String, JsValue]])
}
