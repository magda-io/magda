package au.csiro.data61.magda.search.elasticsearch

import scala.collection.JavaConverters._
import com.typesafe.config.Config
import com.typesafe.config.ConfigObject
import au.csiro.data61.magda.model.misc._

trait Indices {

  def indexVersions(config: Config) =
    config.getConfig("elasticSearch.indices").root().asScala.map {
      case (name: String, config: ConfigObject) =>
        name -> config.toConfig.getInt("version")
    }

  def getIndex(config: Config, index: Indices.Index): String = {
    (index.name + indexVersions(config)(index.name))
  }

  def indexForFacet(facetType: FacetType)(implicit config: Config) =
    facetType match {
      case Format    => getIndex(config, Indices.FormatsIndex)
      case Publisher => getIndex(config, Indices.PublishersIndex)
    }

}

object DefaultIndices extends Indices {}

object Indices {
  sealed trait Index {
    def name: String
  }
  case object DataSetsIndex extends Index {
    override def name = "datasets"
  }
  case object RegionsIndex extends Index {
    override def name = "regions"
  }
  case object PublishersIndex extends Index {
    override def name = "publishers"
  }
  case object FormatsIndex extends Index {
    override def name = "formats"
  }
}
