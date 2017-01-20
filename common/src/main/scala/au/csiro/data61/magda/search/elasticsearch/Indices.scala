package au.csiro.data61.magda.search.elasticsearch

import scala.collection.JavaConversions._
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.IndexesAndTypes
import com.typesafe.config.Config
import com.typesafe.config.ConfigObject
import au.csiro.data61.magda.model.misc._

trait Indices {
  def indexVersions(config: Config) = config.getConfig("elasticsearch.indexes").root().map {
    case (name: String, config: ConfigObject) => name -> config.toConfig.getInt("version")
  }

  def getIndex(config: Config, index: Indices.Index): String =
    (index.name + indexVersions(config).get(index.name).get)

  def getType(`type`: Indices.IndexType) = `type`.name

  def typeForFacet(facetType: FacetType) = facetType match {
    case Format    => Indices.FormatsIndexType
    case Publisher => Indices.PublisherIndexType
    case Year      => throw new RuntimeException("No type for year")
  }

}

object DefaultIndices extends Indices {}

//case class IndicesBlah(datasetsIndexName: String, regionsIndexName: String) extends Indices {
//  def indexVersions(config: Config) = config.getConfig("elasticsearch.indexes").root().map {
//    case (name: String, config: ConfigObject) => name -> config.toConfig.getInt("version")
//  }
//
//  def getIndex(config: Config, indexId: String, `type`: Indices.IndexType): IndexesAndTypes =
//    (indexId + indexVersions(config).get(indexId).get) / `type`.name
//
//}

object Indices {
  //  val defaultIndices = new Indices("datasets", "regions")

  sealed trait Index {
    def name: String
  }
  case object DataSetsIndex extends Index {
    override def name = "datasets"
  }
  case object RegionsIndex extends Index {
    override def name = "regions"
  }

  sealed trait IndexType {
    def name: String
  }

  case object DataSetsIndexType extends IndexType {
    override def name() = "datasets"
  }
  case object RegionsIndexType extends IndexType {
    override def name() = "regions"
  }
  case object FormatsIndexType extends IndexType {
    override def name() = Format.id
  }
  case object PublisherIndexType extends IndexType {
    override def name() = Publisher.id
  }
}