package au.csiro.data61.magda.search.elasticsearch

import scala.collection.JavaConversions.mapAsScalaMap

import com.sksamuel.elastic4s.IndexesAndTypes
import com.typesafe.config.Config
import com.typesafe.config.ConfigObject

object Indices {
  val DATASETS_INDEX_NAME = "datasets"
  val REGIONS_INDEX_NAME = "regions"
  def indexVersions(config: Config) = config.getConfig("elasticsearch.indexes").root().map {
    case (name: String, config: ConfigObject) => name -> config.toConfig.getInt("version")
  }
  def getIndexAndType(config: Config, indexId: String): IndexesAndTypes = IndexesAndTypes.apply((indexId + indexVersions(config).get(indexId).get, indexId))
}
