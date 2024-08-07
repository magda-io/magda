package au.csiro.data61.magda.search.elasticsearch

import au.csiro.data61.magda.AppConfig
import com.typesafe.config.Config

object HybridSearchConfig {
  var _conf: Option[Config] = None

  def get(useCache: Boolean = true) = {
    if (useCache && _conf.nonEmpty) {
      _conf.get
    } else {
      _conf = Some(
        AppConfig
          .conf(useCache = useCache)
          .getConfig("elasticSearch.indices.datasets.hybridSearch")
      )
      _conf.get
    }
  }

  def enabled = get().getBoolean("enabled")
  def k = get().getInt("k")
  def searchPipeline = get().getConfig("searchPipeline")
  def searchPipelineAutoCreate = searchPipeline.getBoolean("autoCreate")
  def searchPipelineId = searchPipeline.getString("id")

  val queryContextFieldName = "queryContext"
  val queryContextVectorFieldName = "queryContextVector"
}
