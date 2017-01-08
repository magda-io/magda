package au.csiro.data61.magda

import com.typesafe.config._

object AppConfig {
  def getEnv = if (System.getenv("SCALA_ENV") == null) "local" else System.getenv("SCALA_ENV")

  /** The global config, potentially including env-custom settings for libraries like akka */
  def conf(envOption: Option[String] = None, allowUnresolved: Boolean = false) = {
    val env = envOption match {
      case Some(env) => env
      case None      => getEnv
    }

    val parseOptions = ConfigParseOptions.defaults().setAllowMissing(false)
    val resolveOptions = ConfigResolveOptions.defaults().setAllowUnresolved(allowUnresolved)

    val commonGeneralConf = ConfigFactory.load("common.conf", parseOptions, resolveOptions)
    val commonEnvConf = ConfigFactory.load("common-env-specific-config/" + env, parseOptions, resolveOptions)
    val appConf = ConfigFactory.load("application.conf", parseOptions, resolveOptions)
    val envConf = ConfigFactory.load("env-specific-config/" + env, parseOptions, resolveOptions)

    envConf.withFallback(appConf).withFallback(commonEnvConf).withFallback(commonGeneralConf)
  }
}