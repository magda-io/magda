package au.csiro.data61.magda.search.elasticsearch

import scala.collection.JavaConversions._
import com.sksamuel.elastic4s.IndexesAndTypes
import com.typesafe.config.Config
import com.typesafe.config.ConfigObject

case class Indices(datasetsIndexName: String, regionsIndexName: String) {
  def indexVersions(config: Config) = config.getConfig("elasticsearch.indexes").root().map {
    case (name: String, config: ConfigObject) => name -> config.toConfig.getInt("version")
  }

  def getIndex(config: Config, indexId: String): String =
    indexId + indexVersions(config).get(indexId).get

}

object Indices {
  val defaultIndices = new Indices("datasets", "regions")
}
