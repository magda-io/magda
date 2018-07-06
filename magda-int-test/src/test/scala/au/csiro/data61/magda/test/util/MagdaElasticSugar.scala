package au.csiro.data61.magda.test.util

import java.nio.file.Paths

import scala.concurrent.duration._
import java.nio.file.Path
import java.util.UUID

import au.csiro.data61.magda.test.util.testkit.LocalNode
import org.scalatest.Suite
import com.sksamuel.elastic4s.http.index.admin.RefreshIndexResponse
import com.sksamuel.elastic4s.Indexes
import java.nio.file.StandardCopyOption.REPLACE_EXISTING
import java.nio.file.Files
import java.nio.file.Files.copy

import au.csiro.data61.magda.test.util.testkit.SharedElasticSugar
import au.csiro.data61.magda.search.elasticsearch.ElasticDsl._
import com.sksamuel.elastic4s.http.HttpClient
import au.csiro.data61.magda.search.elasticsearch.ClientProvider

trait MagdaElasticSugar extends SharedElasticSugar {
  this: Suite =>

  override def getNode: LocalNode = MagdaClassloaderLocalNodeProvider.node
  override def refresh(indexes: Indexes): RefreshIndexResponse = {
    client.execute {
      refreshIndex(indexes)
    }.await(60 seconds)
      .right
      .get
      .result
  }
}
object MagdaClassloaderLocalNodeProvider {
  val node = {

    val tempDirectoryPath: Path = Paths get System.getProperty("java.io.tmpdir")

    val pathHome: Path = tempDirectoryPath resolve UUID.randomUUID().toString
    val requiredSettings = LocalNode.requiredSettings("classloader-node", pathHome.toAbsolutePath.toString)

    val cwdPath: Path = Paths get System.getProperty("user.dir")
    val analysisFolderPath: Path = pathHome.resolve("config/analysis")

    if(!Files.exists(analysisFolderPath)) Files.createDirectories(analysisFolderPath)

    if(!Files.exists(cwdPath.resolve("magda-elastic-search/wn_s_test.pl"))) {
        throw new Exception("Cannot locate sample WordNet synonym lib.")
    }

    if(!Files.exists(analysisFolderPath.resolve("wn_s.pl"))){
        println("**** WordNet synonym lib not exists. Copying...****")
        copy (cwdPath.resolve("magda-elastic-search/wn_s_test.pl"), analysisFolderPath.resolve("wn_s.pl"), REPLACE_EXISTING)
        println("**** WordNet synonym lib creation completed! ****")
    }else{
        println("**** WordNet synonym lib exists before creation****")
    }

    val settings = requiredSettings ++ Map(
      "bootstrap.memory_lock" -> "true",
      "cluster.routing.allocation.disk.threshold_enabled" -> "false")

    LocalNode(settings)
  }
}
