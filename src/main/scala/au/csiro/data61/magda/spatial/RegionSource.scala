package au.csiro.data61.magda.spatial

import java.net.URL

import com.typesafe.config.Config

import scala.collection.JavaConversions._
import com.typesafe.config.ConfigObject

/**
 * Created by gil308 on 12/10/2016.
 */
case class RegionSource(name: String, url: URL, id: String, shapePath: String)

object RegionSource {
  def loadFromConfig(config: Config): Seq[RegionSource] = {
    config.root().map {
      case (name: String, config: ConfigObject) =>
        val regionSourceConfig = config.toConfig()
        RegionSource(
          name,
          new URL(regionSourceConfig.getString("url")),
          regionSourceConfig.getString("idField"),
          regionSourceConfig.getString("shapePath"))
    }.toSeq}
}