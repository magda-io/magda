package au.csiro.data61.magda.search.elasticsearch

import au.csiro.data61.magda.AppConfig
import com.sksamuel.elastic4s.IndexesAndTypes
import com.typesafe.config.ConfigObject
import scala.collection.JavaConversions._

object Indexes {
  val DATASETS_INDEX_NAME = "datasets"
  val REGIONS_INDEX_NAME = "regions"
  private val indexVersions = AppConfig.conf.getConfig("elasticsearch.indexes").root().map {
    case (name: String, config: ConfigObject) => name -> config.toConfig.getInt("version")
  }
  def getIndexAndType(indexId: String): IndexesAndTypes = IndexesAndTypes.apply((indexId + indexVersions.get(indexId).get, indexId))
}
