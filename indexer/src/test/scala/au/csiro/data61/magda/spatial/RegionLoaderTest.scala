package au.csiro.data61.magda.spatial

import java.nio.file.Files

import scala.collection.JavaConversions._

import org.scalacheck.Gen
import org.scalatest.BeforeAndAfterAll
import org.scalatest.FunSpecLike
import org.scalatest.Matchers

import com.sksamuel.elastic4s.testkit.ElasticSugar
import com.typesafe.config.ConfigFactory

import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.Source
import akka.testkit.TestKit
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.search.elasticsearch.IndexDefinition
import au.csiro.data61.magda.search.elasticsearch.RegionLoader
import au.csiro.data61.magda.test.util.Generators
import au.csiro.data61.magda.test.util.MagdaGeneratorTest
import java.nio.file.FileSystems
import scala.concurrent.duration._

class CrawlerTest extends TestKit(ActorSystem("MySpec")) with FunSpecLike with BeforeAndAfterAll with Matchers with MagdaGeneratorTest with ElasticSugar {
  implicit val ec = system.dispatcher
  val dir = Files.createTempDirectory(FileSystems.getDefault().getPath(System.getProperty("java.io.tmpdir")), "magda-test")

  implicit val config = ConfigFactory.parseMap(Map(
    "regionLoading.cachePath" -> dir.getFileName.toFile().toString()
  )).withFallback(AppConfig.conf(None))
  implicit val materializer = ActorMaterializer()

  it("should load things good") {
    try {
      forAll(Generators.nonEmptyListOf(Generators.regionGen(100))) { regions =>
        val regionLoader = new RegionLoader {
          def setupRegions() = Source.fromIterator(() => regions.iterator)
        }

        IndexDefinition.setupRegions(client, regionLoader).await(120 seconds)
      }
    } catch {
      case (e: Throwable) =>
        e.printStackTrace
        throw e
    }
  }

}