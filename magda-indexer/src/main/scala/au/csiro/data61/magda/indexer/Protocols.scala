package au.csiro.data61.magda.indexer

import au.csiro.data61.magda.indexer.search.SearchIndexer.IndexResult
import spray.json.{DefaultJsonProtocol, RootJsonFormat}

trait Protocols extends DefaultJsonProtocol {
  implicit val IndexResultFormat: RootJsonFormat[IndexResult] =
    jsonFormat5(IndexResult.apply)
}
