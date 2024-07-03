package au.csiro.data61.magda.spatial

import java.net.URL

import au.csiro.data61.magda.AppConfig
import com.typesafe.config.{Config, ConfigObject}
import au.csiro.data61.magda.util.RichConfig._
import scala.collection.JavaConverters._

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
    // --- `lvxIdField` config field allow to specify the property field that the id value can be retrieved from
    lv1IdField: Option[String] = None,
    lv2IdField: Option[String] = None,
    lv3IdField: Option[String] = None,
    lv4IdField: Option[String] = None,
    lv5IdField: Option[String] = None,
    // --- `lvxId` config field allow to specify the id value directly
    lv1Id: Option[String] = None,
    lv2Id: Option[String] = None,
    lv3Id: Option[String] = None,
    lv4Id: Option[String] = None,
    lv5Id: Option[String] = None
)

object RegionSource {

  def generateRegionId(regionType: String, id: String) =
    s"${regionType}/$id".toLowerCase
}

class RegionSources(config: Config) {
  val sources = loadFromConfig(config)

  private lazy val lookup =
    sources.groupBy(_.name.toLowerCase).mapValues(_.head)

  def forName(name: String): Option[RegionSource] = lookup.get(name.toLowerCase)

  private def loadFromConfig(config: Config): Seq[RegionSource] = {
    config
      .root()
      .asScala
      .map {
        case (name: String, config: ConfigObject) =>
          val regionSourceConfig = config.toConfig()

          val disabled = regionSourceConfig
            .hasPath("disabled") && regionSourceConfig.getBoolean("disabled")

          if (disabled) {
            println(s"""Region ${name} file is disabled and ignored.""")
            None
          } else {
            Some(
              RegionSource(
                name = name,
                url = new URL(regionSourceConfig.getString("url")),
                idProperty = regionSourceConfig.getString("idField"),
                nameProperty = regionSourceConfig.getString("nameField"),
                shortNameProperty =
                  regionSourceConfig.getOptionalString("shortNameField"),
                includeIdInName =
                  if (regionSourceConfig.hasPath("includeIdInName"))
                    regionSourceConfig.getBoolean("includeIdInName")
                  else false,
                disabled = regionSourceConfig
                  .hasPath("disabled") && regionSourceConfig
                  .getBoolean("disabled"),
                order = regionSourceConfig.getInt("order"),
                simplifyToleranceRatio =
                  if (regionSourceConfig.hasPath("simplifyToleranceRatio"))
                    regionSourceConfig.getDouble("simplifyToleranceRatio")
                  else 0.01,
                requireSimplify =
                  if (regionSourceConfig.hasPath("requireSimplify"))
                    regionSourceConfig.getBoolean("requireSimplify")
                  else true,
                lv1IdField = regionSourceConfig.getOptionalString("lv1IdField"),
                lv2IdField = regionSourceConfig.getOptionalString("lv2IdField"),
                lv3IdField = regionSourceConfig.getOptionalString("lv3IdField"),
                lv4IdField = regionSourceConfig.getOptionalString("lv4IdField"),
                lv5IdField = regionSourceConfig.getOptionalString("lv5IdField"),
                lv1Id = regionSourceConfig.getOptionalString("lv1Id"),
                lv2Id = regionSourceConfig.getOptionalString("lv2Id"),
                lv3Id = regionSourceConfig.getOptionalString("lv3Id"),
                lv4Id = regionSourceConfig.getOptionalString("lv4Id"),
                lv5Id = regionSourceConfig.getOptionalString("lv5Id")
              )
            )
          }
      }
      .toSeq
      .filterNot(_.isEmpty)
      .map(_.get)
  }
}
