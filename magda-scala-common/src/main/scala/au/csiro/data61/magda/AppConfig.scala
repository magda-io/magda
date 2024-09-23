package au.csiro.data61.magda

import com.typesafe.config.{Config, ConfigFactory, ConfigRenderOptions}

object AppConfig {

  private var _conf: Option[Config] = None

  /** The global config, potentially including env-custom settings for libraries like akka */
  def conf(useCache: Boolean = true) = {
    if (useCache && _conf.nonEmpty) {
      _conf.get
    } else {
      _conf = Some(
        ConfigFactory
          .load()
          .withFallback(ConfigFactory.parseResources("common.conf"))
          .resolve()
      )
      val config = _conf.get
      if (config.hasPath("printFullConfig") && config.getBoolean(
            "printFullConfig"
          )) {
        println("Application config full print: ")
        println(config.root().render(ConfigRenderOptions.defaults()))
      }
      config
    }
  }

}
