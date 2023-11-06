package au.csiro.data61.magda

import com.typesafe.config.{ConfigFactory, ConfigRenderOptions}

object AppConfig {

  private val _config = ConfigFactory
    .load()
    .withFallback(ConfigFactory.parseResources("common.conf"))
    .resolve()

  if (_config.hasPath("printFullConfig") && _config.getBoolean(
        "printFullConfig"
      )) {
    println("Application config full print: ")
    println(_config.root().render(ConfigRenderOptions.defaults()))
  }

  /** The global config, potentially including env-custom settings for libraries like akka */
  def conf() = _config

}
