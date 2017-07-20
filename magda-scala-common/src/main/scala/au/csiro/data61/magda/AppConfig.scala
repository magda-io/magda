package au.csiro.data61.magda

import com.typesafe.config.ConfigFactory
import com.typesafe.config.ConfigParseOptions
import com.typesafe.config.ConfigResolveOptions

object AppConfig {
  def getEnv = if (System.getenv("SCALA_ENV") == null) "host" else System.getenv("SCALA_ENV")

  /** The global config, potentially including env-custom settings for libraries like akka */
  def conf(envOption: Option[String] = None) = {
    val env = envOption.getOrElse(getEnv)

    val parseOptionsAllowMissing = ConfigParseOptions.defaults().setAllowMissing(true)
    val parseOptionsForbidMissing = ConfigParseOptions.defaults().setAllowMissing(false)
    val resolveOptions = ConfigResolveOptions.defaults().setAllowUnresolved(false)

    val commonGeneralConf = ConfigFactory.parseResources("common.conf")
    val commonEnvConf = ConfigFactory.parseResources("common-env-specific-config/" + env + ".conf")
    val appConf = ConfigFactory.parseResources("application.conf")
    val envConf = ConfigFactory.parseResources("env-specific-config/" + env + ".conf")

    envConf.withFallback(appConf).withFallback(commonEnvConf).withFallback(commonGeneralConf).resolve(resolveOptions)
  }
}
