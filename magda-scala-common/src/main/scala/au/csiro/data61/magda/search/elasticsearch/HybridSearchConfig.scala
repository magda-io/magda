package au.csiro.data61.magda.search.elasticsearch

import au.csiro.data61.magda.AppConfig
import com.typesafe.config.Config
import au.csiro.data61.magda.util.RichConfig._

object HybridSearchConfig {
  val configPath = "elasticSearch.indices.datasets.hybridSearch"
  var _conf: Option[Config] = None

  def setAppConfig(appConfig: Config): Unit = {
    _conf = Some(appConfig.getConfig(configPath))
  }

  def get(useCache: Boolean = true): Config = {
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

  def enabled: Boolean = get().getBoolean("enabled")
  def k: Option[Int] = get().getOptionalInt("k")
  def minScore: Option[Double] = get().getOptionalDouble("minScore")
  def maxDistance: Option[Double] = get().getOptionalDouble("maxDistance")
  def searchPipeline: Config = get().getConfig("searchPipeline")

  def searchPipelineAutoCreate: Boolean =
    searchPipeline.getBoolean("autoCreate")
  def searchPipelineId: String = searchPipeline.getString("id")

  private def knnVectorFieldConfig = get().getConfig("knnVectorFieldConfig")
  def mode: Option[String] = knnVectorFieldConfig.getOptionalString("mode")
  def dimension: Int = knnVectorFieldConfig.getInt("dimension")

  def spaceType: Option[String] =
    knnVectorFieldConfig.getOptionalString("spaceType")

  def efConstruction: Option[Int] =
    knnVectorFieldConfig.getOptionalInt("efConstruction")
  def efSearch: Option[Int] = knnVectorFieldConfig.getOptionalInt("efSearch")
  def m: Option[Int] = knnVectorFieldConfig.getOptionalInt("m")

  def compressionLevel: Option[String] =
    knnVectorFieldConfig.getOptionalString("compressionLevel")
  private def encoderConfig = knnVectorFieldConfig.getConfig("encoder")
  def encoderName: Option[String] = encoderConfig.getOptionalString("name")
  def encoderType: Option[String] = encoderConfig.getOptionalString("type")
  def encoderClip: Option[Boolean] = encoderConfig.getOptionalBoolean("clip")

  val queryContextFieldName = "queryContext"
  val queryContextVectorFieldName = "queryContextVector"
}
