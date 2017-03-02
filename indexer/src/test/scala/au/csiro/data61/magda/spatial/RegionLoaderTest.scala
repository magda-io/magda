package au.csiro.data61.magda.spatial

import java.nio.file.FileSystems
import java.nio.file.Files

import scala.collection.JavaConversions._
import scala.concurrent.duration._

import org.scalatest.BeforeAndAfterAll
import org.scalatest.FunSpecLike
import org.scalatest.Matchers
import org.scalatest.matchers.BeMatcher
import org.scalatest.matchers.MatchResult

import com.monsanto.labs.mwundo.GeoJson._
import com.sksamuel.elastic4s.testkit.ElasticSugar
import com.typesafe.config.ConfigFactory
import com.vividsolutions.jts.geom.Envelope

import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.Source
import akka.testkit.TestKit
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.model.misc.Protocols._
import au.csiro.data61.magda.search.elasticsearch.DefaultIndices
import au.csiro.data61.magda.search.elasticsearch.IndexDefinition
import au.csiro.data61.magda.search.elasticsearch.Indices
import au.csiro.data61.magda.search.elasticsearch.RegionLoader
import au.csiro.data61.magda.test.util.Generators
import au.csiro.data61.magda.test.util.MagdaGeneratorTest
import au.csiro.data61.magda.util.MwundoJTSConversions._
import spray.json._
import akka.stream.scaladsl.Sink
import org.locationtech.spatial4j.context.jts.JtsSpatialContext
import org.locationtech.spatial4j.shape.jts.JtsGeometry
import scala.util.Try
import com.typesafe.config.Config

class RegionLoaderTest extends TestKit(ActorSystem("MySpec")) with FunSpecLike with BeforeAndAfterAll with Matchers with MagdaGeneratorTest with ElasticSugar {
  implicit val ec = system.dispatcher

  implicit val materializer = ActorMaterializer()
  val indices = DefaultIndices

  override def beforeAll {
    super.beforeAll

    client.execute(IndexDefinition.regions.definition(None)).await
  }

  ignore("should load fake things good") {
    val dir = Files.createTempDirectory(FileSystems.getDefault().getPath(System.getProperty("java.io.tmpdir")), "magda-test")
    implicit val config = ConfigFactory.parseMap(Map(
      "regionLoading.cachePath" -> dir.getFileName.toFile().toString()
    )).withFallback(AppConfig.conf(None))

    forAll(Generators.nonEmptyListOf(Generators.regionGen(Generators.geometryGen(5, Generators.coordGen(Generators.longGen(), Generators.latGen()))))) { regions =>
      val regionLoader = new RegionLoader {
        def setupRegions() = Source.fromIterator(() => regions.iterator)
      }

      checkRegionLoading(regionLoader, regions)
    }
  }

  // ignored because it involves downloading a big old file
  it("should load real things good") {
    def getCurrentDirectory = new java.io.File("./../regions")
    implicit val config = ConfigFactory.parseMap(Map(
      "regionLoading.cachePath" -> getCurrentDirectory.toString()
    )).withFallback(AppConfig.conf(None))

    val regionSourceConfig = config.getConfig("regionSources")
    val regionSources = new RegionSources(regionSourceConfig)

    val regionLoader = RegionLoader(regionSources.sources.filter(_.name.equals("LGA")).toList)

    val regions = regionLoader.setupRegions().runWith(Sink.fold(List[(RegionSource, JsObject)]()) { case (agg, current) => current :: agg }).await(120 seconds)
      .filter(!_._2.fields("geometry").equals(JsNull))
      .filter(region => Try {
        val jts = region._2.fields("geometry").convertTo[Geometry].toJTSGeo
        new JtsGeometry(jts, JtsSpatialContext.GEO, false, false).validate()
        val env = jts.getEnvelopeInternal
        env.getMinX > -180 && env.getMaxX < 180
      }.getOrElse(false))

    checkRegionLoading(regionLoader, regions)
  }

  def checkRegionLoading(regionLoader: RegionLoader, regions: Seq[(RegionSource, JsObject)])(implicit config: Config) = {
    IndexDefinition.setupRegions(client, regionLoader).await(120 seconds)
    val indexName = indices.getIndex(config, Indices.RegionsIndex)
    val typeName = indices.getType(Indices.RegionsIndexType)
    refreshAll()
    Thread.sleep(2000)

    regions.foreach { region =>
      val regionId = region._1.name + "/" + region._2.fields("properties").asJsObject.fields(region._1.idProperty).asInstanceOf[JsString].value
      val inputGeometry = region._2.fields("geometry").convertTo[Geometry]
      val inputGeometryJts = inputGeometry.toJTSGeo

      blockUntilDocumentExists(regionId, indexName, typeName)
      val result = client.execute(get(regionId).from(indexName / typeName)).await(60 seconds)

      withClue("region " + regionId) {
        result.exists should be(true)

        val indexedGeometry = result.sourceAsString.parseJson.asJsObject.fields("geometry").convertTo[Geometry]
        val indexedGeometryJts = indexedGeometry.toJTSGeo

        withinFraction(indexedGeometryJts.getArea, inputGeometryJts.getArea, inputGeometryJts.getArea, 0.1)

        val inputRectangle = inputGeometryJts.getEnvelopeInternal
        val indexedRectangle = indexedGeometryJts.getEnvelopeInternal

        def recToSeq(rect: Envelope) = Seq(rect.getMinX, rect.getMaxY, rect.getMaxX, rect.getMinY)

        recToSeq(inputRectangle).zip(recToSeq(indexedRectangle)).foreach {
          case (inputDim, indexedDim) => withinFraction(indexedDim, inputDim, inputGeometryJts.getLength, 0.1)
        }
      }
    }
  }

  def withinFraction(left: Double, right: Double, comparison: Double, fraction: Double) = (
    if (comparison == 0) {
      left should equal(right)
    } else {
      left should be(right +- Math.abs(comparison * fraction))
    }
  )
}