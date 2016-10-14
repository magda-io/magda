package au.csiro.data61.magda

import com.typesafe.config._

object AppConfig {
  val env: String = if (System.getenv("SCALA_ENV") == null) "local" else System.getenv("SCALA_ENV")
  
  private val defaultConf = ConfigFactory.load()
  private val envConf = ConfigFactory.load("env-specific-config/" + env, ConfigParseOptions.defaults().setAllowMissing(false), ConfigResolveOptions.defaults())

  /** The global config, potentially including env-custom settings for libraries like akka */
  val conf = envConf.withFallback(defaultConf)
}