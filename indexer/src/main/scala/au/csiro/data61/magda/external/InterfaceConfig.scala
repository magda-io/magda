package au.csiro.data61.magda.external

import com.typesafe.config.Config
import scala.collection.JavaConversions._
import java.net.URL
import au.csiro.data61.magda.external.ExternalInterface.ExternalInterfaceType
import au.csiro.data61.magda.external.ExternalInterface.ExternalInterfaceType._
import com.typesafe.config.ConfigObject
import com.typesafe.config.ConfigValue

case class InterfaceConfig(
  name: String,
  interfaceType: ExternalInterfaceType,
  baseUrl: URL,
  pageSize: Long,
  landingPageUrl: (String*) => Option[String],
  fakeConfig: Option[FakeConfig],
  ignore: Boolean,
  raw: Config)

case class FakeConfig(
  datasetPath: String,
  mimeType: String)

object InterfaceConfig {
  def apply(config: Config): InterfaceConfig = {
    val isFaked = config.hasPath("isFaked") && config.getBoolean("isFaked")

    new InterfaceConfig(
      name = config.getString("name"),
      interfaceType = ExternalInterfaceType.withName(config.getString("type")),
      baseUrl = new URL(config.getString("baseUrl")),
      pageSize = config.getLong("pageSize"),
      landingPageUrl = strings =>
        if (config.hasPath("landingPageTemplate"))
          Some(config.getString("landingPageTemplate").format(strings: _*))
        else None,
      ignore = config.hasPath("ignore") && config.getBoolean("ignore"),
      fakeConfig = {
        if (isFaked && config.hasPath("fake"))
          Some(new FakeConfig(
            config.getString("fake.dataFilePath"),
            config.getString("fake.mimeType")))
        else None
      },
      raw = config
    )
  }

  def all(implicit config: Config) = config.getConfig("indexedServices").root().map {
    case (name: String, serviceConfig: ConfigValue) =>
      InterfaceConfig(serviceConfig.asInstanceOf[ConfigObject].toConfig)
  }.toSeq
}