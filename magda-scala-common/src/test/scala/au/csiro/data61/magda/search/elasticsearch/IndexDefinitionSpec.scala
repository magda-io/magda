package au.csiro.data61.magda.search.elasticsearch

import au.csiro.data61.magda.AppConfig
import com.typesafe.config.ConfigFactory
import com.sksamuel.elastic4s.fields.{
  ElasticField,
  KeywordField,
  ObjectField,
  TextField
}
import org.scalatest.{FunSpec, Matchers}

class IndexDefinitionSpec extends FunSpec with Matchers {

  describe("datasets index mapping") {
    // index settings normally provided by the indexer / search api config
    val config = ConfigFactory
      .parseString("""
                     |elasticSearch.shardCount = 1
                     |elasticSearch.replicaCount = 0
                     |elasticSearch.esInstanceSupport = false
                     |""".stripMargin)
      .withFallback(AppConfig.conf())
    val request = IndexDefinition.dataSets.definition(DefaultIndices, config)
    val properties: Seq[ElasticField] =
      request.mapping.map(_.properties).getOrElse(Nil)

    it(
      "should map `publisher.aggKeywords.keyword`, as the organisations search collapses on it"
    ) {
      val publisherFields = properties.collectFirst {
        case f: ObjectField if f.name == "publisher" => f.properties
      }
      publisherFields shouldBe defined

      val aggKeywords = publisherFields.get.collectFirst {
        case f: TextField if f.name == "aggKeywords" => f
      }
      aggKeywords shouldBe defined

      aggKeywords.get.fields should contain(
        KeywordField("keyword", ignoreAbove = Some(256))
      )
    }
  }
}
