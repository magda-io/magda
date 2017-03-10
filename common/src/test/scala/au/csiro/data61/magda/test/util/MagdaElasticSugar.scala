package au.csiro.data61.magda.test.util

import com.sksamuel.elastic4s.testkit.LocalNodeProvider
import org.scalatest.Suite
import com.sksamuel.elastic4s.testkit.SharedElasticSugar
import com.sksamuel.elastic4s.embedded.LocalNode
import com.sksamuel.elastic4s.testkit.ClassloaderLocalNodeProvider
import java.nio.file.Paths
import java.nio.file.Path
import java.util.UUID

trait MagdaElasticSugar extends SharedElasticSugar {
  this: Suite with LocalNodeProvider =>

  override def getNode: LocalNode = ClassloaderLocalNodeProvider.node

  object ClassloaderLocalNodeProvider {
    lazy val node = {

      val tempDirectoryPath: Path = Paths get System.getProperty("java.io.tmpdir")
      val pathHome: Path = tempDirectoryPath resolve UUID.randomUUID().toString
      val requiredSettings = LocalNode.requiredSettings("classloader-node", pathHome.toAbsolutePath.toString)

      val settings = requiredSettings ++ Map(
        "index.number_of_replicas" -> "1",
        "index.number_of_shards" -> "1"
      )

      LocalNode(settings)
    }
  }
}