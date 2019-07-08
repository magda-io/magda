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
  shortNameProperty: Option[String],
  includeIdInName: Boolean,
  disabled: Boolean,
  order: Int,
  simplifyToleranceRatio: Double = 0.01,
  requireSimplify: Boolean = true,
  STEIdField: Option[String] = None,
  SA4IdField: Option[String] = None,
  SA3IdField: Option[String] = None,
  SA2IdField: Option[String] = None,
  STEAbbrevField: Option[String] = None)

object RegionSource {
  def generateRegionId(regionType: String, id: String) = s"${regionType}/$id".toLowerCase
}

class RegionSources(config: Config) {
  val sources = loadFromConfig(config)

  private lazy val lookup = sources.groupBy(_.name.toLowerCase).mapValues(_.head)

  def forName(name: String): Option[RegionSource] = lookup.get(name.toLowerCase)

  private def getOptionalStringConfig(fieldName: String, regionSourceConfig: Config):Option[String] = {
    if (regionSourceConfig.hasPath(fieldName)) Some(regionSourceConfig.getString(fieldName)) else None
  }

  private def loadFromConfig(config: Config): Seq[RegionSource] = {
    config.root().map {
      case (name: String, config: ConfigObject) =>
        val regionSourceConfig = config.toConfig()
        RegionSource(
          name = name,
          url = new URL(regionSourceConfig.getString("url")),
          idProperty = regionSourceConfig.getString("idField"),
          nameProperty = regionSourceConfig.getString("nameField"),
          shortNameProperty = getOptionalStringConfig("shortNameField", regionSourceConfig),
          includeIdInName = if (regionSourceConfig.hasPath("includeIdInName")) regionSourceConfig.getBoolean("includeIdInName") else false,
          disabled = regionSourceConfig.hasPath("disabled") && regionSourceConfig.getBoolean("disabled"),
          order = regionSourceConfig.getInt("order"),
          simplifyToleranceRatio =
            if (regionSourceConfig.hasPath("simplifyToleranceRatio"))
              regionSourceConfig.getDouble("simplifyToleranceRatio")
            else 0.01,
          requireSimplify =
            if (regionSourceConfig.hasPath("requireSimplify"))
              regionSourceConfig.getBoolean("requireSimplify")
            else true,
          STEIdField = getOptionalStringConfig("STEIdField", regionSourceConfig),
          SA4IdField = getOptionalStringConfig("SA4IdField", regionSourceConfig),
          SA3IdField = getOptionalStringConfig("SA3IdField", regionSourceConfig),
          SA2IdField = getOptionalStringConfig("SA2IdField", regionSourceConfig),
          STEAbbrevField = getOptionalStringConfig("STEAbbrevField", regionSourceConfig)
        )
    }.toSeq.filterNot(_.disabled)
  }
}

