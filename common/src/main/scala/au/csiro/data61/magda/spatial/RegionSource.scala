package au.csiro.data61.magda.spatial

import java.net.URL

import au.csiro.data61.magda.AppConfig
import com.typesafe.config.{ Config, ConfigObject }

import scala.collection.JavaConversions._

case class RegionSource(
  name: String,
  url: URL,
  idProperty: String,
  nameProperty: String,
  includeIdInName: Boolean,
  shapePath: String,
  disabled: Boolean,
  order: Int)

object RegionSource {
  def generateRegionId(regionType: String, id: String) = s"${regionType}/$id".toLowerCase
}

class RegionSources(config: Config) {
  val sources = loadFromConfig(config)

  private lazy val lookup = sources.groupBy(_.name.toLowerCase).mapValues(_.head)

  def forName(name: String): Option[RegionSource] = lookup.get(name.toLowerCase)

  private def loadFromConfig(config: Config): Seq[RegionSource] = {
    config.root().map {
      case (name: String, config: ConfigObject) =>
        val regionSourceConfig = config.toConfig()
        RegionSource(
          name = name,
          url = new URL(regionSourceConfig.getString("url")),
          idProperty = regionSourceConfig.getString("idField"),
          nameProperty = regionSourceConfig.getString("nameField"),
          includeIdInName = if (regionSourceConfig.hasPath("includeIdInName")) regionSourceConfig.getBoolean("includeIdInName") else false,
          shapePath = regionSourceConfig.getString("shapePath"),
          disabled = regionSourceConfig.hasPath("disabled") && regionSourceConfig.getBoolean("disabled"),
          order = regionSourceConfig.getInt("order"))
    }.toSeq.filterNot(_.disabled)
  }
}

