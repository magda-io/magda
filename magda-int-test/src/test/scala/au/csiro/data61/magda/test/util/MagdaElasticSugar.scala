package au.csiro.data61.magda.test.util

import java.nio.file.Paths
import scala.concurrent.duration._
import java.nio.file.Path
import java.util.UUID
import com.sksamuel.elastic4s.embedded.LocalNode
import com.sksamuel.elastic4s.testkit.LocalNodeProvider
import com.sksamuel.elastic4s.testkit.SharedElasticSugar
import org.scalatest.Suite
import org.elasticsearch.action.admin.indices.refresh.RefreshResponse
import com.sksamuel.elastic4s.Indexes

import java.nio.file.StandardCopyOption.REPLACE_EXISTING
import java.nio.file.Files
import java.nio.file.Files.copy


trait MagdaElasticSugar extends SharedElasticSugar {
  this: Suite with LocalNodeProvider =>

  override def getNode: LocalNode = ClassloaderLocalNodeProvider.node

  override def refresh(indexes: Indexes): RefreshResponse = {
    client.execute {
      refreshIndex(indexes)
    }.await(60 seconds)
  }
}
object ClassloaderLocalNodeProvider {
  lazy val node = {

    val tempDirectoryPath: Path = Paths get System.getProperty("java.io.tmpdir")

    val pathHome: Path = tempDirectoryPath resolve UUID.randomUUID().toString
    val requiredSettings = LocalNode.requiredSettings("classloader-node", pathHome.toAbsolutePath.toString)

    val cwdPath: Path = Paths get System.getProperty("user.dir")
    val analysisFolderPath: Path = pathHome.resolve("config/analysis")

    if(!Files.exists(analysisFolderPath)) Files.createDirectories(analysisFolderPath)

    copy (cwdPath.resolve("magda-elastic-search/wn_s.pl"), analysisFolderPath.resolve("wn_s.pl"), REPLACE_EXISTING)

    val settings = requiredSettings ++ Map(
      "bootstrap.memory_lock" -> "true",
      "cluster.routing.allocation.disk.threshold_enabled" -> "false")

    LocalNode(settings)
  }
}
