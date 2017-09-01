package au.csiro.data61.magda

import com.typesafe.config.ConfigFactory
import com.typesafe.config.ConfigParseOptions
import com.typesafe.config.ConfigResolveOptions

object AppConfig {
  def getEnv = if (System.getenv("SCALA_ENV") == null) "host" else System.getenv("SCALA_ENV")

  /** The global config, potentially including env-custom settings for libraries like akka */
  def conf(envOption: Option[String] = None) = {
    ConfigFactory.load().withFallback(ConfigFactory.parseResources("common.conf"))
  }
}
