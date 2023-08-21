package au.csiro.data61.magda

import com.typesafe.config.{
  ConfigFactory,
  ConfigParseOptions,
  ConfigRenderOptions,
  ConfigResolveOptions
}

object AppConfig {

  /** The global config, potentially including env-custom settings for libraries like akka */
  def conf() = {
    val config = ConfigFactory
      .load()
      .withFallback(ConfigFactory.parseResources("common.conf"))
      .resolve()
    if (config.hasPath("printFullConfig") && config.getBoolean(
          "printFullConfig"
        )) {
      println("Application config full print: ")
      println(config.root().render(ConfigRenderOptions.defaults()))
    }
    config
  }

}
