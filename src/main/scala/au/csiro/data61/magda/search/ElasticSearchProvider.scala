package au.csiro.data61.magda.search

import com.sksamuel.elastic4s.ElasticClient
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.ElasticsearchClientUri
import com.sksamuel.elastic4s.source.Indexable

import au.csiro.data61.magda.api.Types._
import au.csiro.data61.magda.api.Types.Protocols._
import spray.json._
import spray.json.JsValue
import spray.json.RootJsonFormat

class ElasticSearchProvider extends SearchProvider {
  implicit object CharacterIndexable extends Indexable[JsValue] {
    override def json(t: JsValue): String = t.toString(CompactPrinter)
  }

  val uri = ElasticsearchClientUri("elasticsearch://search:9300")
  val client = ElasticClient.transport(uri)

  override def index(dataSets: List[DataSet]) = {
    println(dataSets.head.toJson)
    
    client.execute {
      ElasticDsl.index into "datasets" source dataSets.head.toJson
    }
  }

  override def search(query: String) = ???
}