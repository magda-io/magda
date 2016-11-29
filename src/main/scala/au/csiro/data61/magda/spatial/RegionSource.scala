package au.csiro.data61.magda.spatial

import java.net.URL

import com.typesafe.config.Config

import scala.collection.JavaConversions._
import com.typesafe.config.ConfigObject
import au.csiro.data61.magda.AppConfig

/**
 * Created by gil308 on 12/10/2016.
 */
case class RegionSource(
  name: String,
  url: URL,
  idProperty: String,
  nameProperty: String,
  includeIdInName: Boolean,
  shapePath: String,
  disabled: Boolean)

object RegionSource {
  val sources = loadFromConfig(AppConfig.conf.getConfig("regionSources"))

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
          disabled = regionSourceConfig.hasPath("disabled") && regionSourceConfig.getBoolean("disabled"))
    }.toSeq.filterNot(_.disabled)
  }
}