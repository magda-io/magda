package au.csiro.data61.magda.indexer.external

import com.typesafe.config.Config
import scala.collection.JavaConversions._
import java.net.URL
import com.typesafe.config.ConfigObject
import com.typesafe.config.ConfigValue
import com.typesafe.config.ConfigException
import au.csiro.data61.magda.model.misc.Agent
import com.typesafe.config.ConfigFactory

case class InterfaceConfig(
  name: String,
  interfaceType: String,
  baseUrl: URL,
  pageSize: Long,
  landingPageUrl: (String*) => Option[String] = _ => None,
  ignore: Boolean = false,
  defaultPublisherName: Option[String] = None,
  raw: Config = ConfigFactory.empty())

case class FakeConfig(
  datasetPath: String,
  mimeType: String)

object InterfaceConfig {
  def apply(config: Config): InterfaceConfig = {
    val isFaked = config.hasPath("isFaked") && config.getBoolean("isFaked")

    InterfaceConfig(
      name = config.getString("name"),
      interfaceType = config.getString("type"),
      baseUrl = new URL(config.getString("baseUrl")),
      pageSize = config.getLong("pageSize"),
      landingPageUrl = strings =>
        if (config.hasPath("landingPageTemplate"))
          Some(config.getString("landingPageTemplate").format(strings: _*))
        else None,
      ignore = config.hasPath("ignore") && config.getBoolean("ignore"),
      defaultPublisherName = if (config.hasPath("defaultPublisherName")) Some(config.getString("defaultPublisherName")) else None,
      raw = config)
  }

  def all(implicit config: Config): Map[String, InterfaceConfig] = config.getConfig("indexedServices").root().foldRight(Map[String, InterfaceConfig]()) {
    case ((id: String, serviceConfig: ConfigValue), soFar) =>
      try {
        soFar + ((id, InterfaceConfig(serviceConfig.asInstanceOf[ConfigObject].toConfig)))
      } catch {
        case (e: ConfigException) =>
          throw new RuntimeException(s"Problem with $id", e)
      }

  }
}