package au.csiro.data61.magda.search.elasticsearch

import au.csiro.data61.magda.AppConfig
import com.typesafe.config.Config
import au.csiro.data61.magda.util.RichConfig._

object HybridSearchConfig {
  val configPath = "elasticSearch.indices.datasets.hybridSearch"
  var _conf: Option[Config] = None

  def setAppConfig(appConfig: Config) = {
    _conf = Some(appConfig.getConfig(configPath))
  }

  def get(useCache: Boolean = true) = {
    if (useCache && _conf.nonEmpty) {
      _conf.get
    } else {
      _conf = Some(
        AppConfig
          .conf(useCache = useCache)
          .getConfig(configPath)
      )
      _conf.get
    }
  }

  def enabled = get().getBoolean("enabled")
  def k = get().getOptionalInt("k")
  def minScore = get().getOptionalDouble("minScore")
  def maxDistance = get().getOptionalDouble("maxDistance")
  def searchPipeline = get().getConfig("searchPipeline")
  def searchPipelineAutoCreate = searchPipeline.getBoolean("autoCreate")
  def searchPipelineId = searchPipeline.getString("id")

  val queryContextFieldName = "queryContext"
  val queryContextVectorFieldName = "queryContextVector"
}
