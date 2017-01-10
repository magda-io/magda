package au.csiro.data61.magda

import com.typesafe.config.ConfigFactory
import com.typesafe.config.ConfigParseOptions
import com.typesafe.config.ConfigResolveOptions

object AppConfig {
  def getEnv = if (System.getenv("SCALA_ENV") == null) "local" else System.getenv("SCALA_ENV")

  /** The global config, potentially including env-custom settings for libraries like akka */
  def conf(envOption: Option[String] = None) = {
    val env = envOption match {
      case Some(env) => env
      case None      => getEnv
    }

    val parseOptionsAllowMissing = ConfigParseOptions.defaults().setAllowMissing(true)
    val parseOptionsForbidMissing = ConfigParseOptions.defaults().setAllowMissing(false)
    val resolveOptions = ConfigResolveOptions.defaults().setAllowUnresolved(false)

    val commonGeneralConf = ConfigFactory.load("common.conf", parseOptionsForbidMissing, resolveOptions)
    val commonEnvConf = ConfigFactory.load("common-env-specific-config/" + env, parseOptionsAllowMissing, resolveOptions)
    val appConf = ConfigFactory.load("application.conf", parseOptionsForbidMissing, resolveOptions)
    val envConf = ConfigFactory.load("env-specific-config/" + env, parseOptionsForbidMissing, resolveOptions)

    envConf.withFallback(appConf).withFallback(commonEnvConf).withFallback(commonGeneralConf)
  }
}