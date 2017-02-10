import sbt._
import Keys._
import sbtdocker._
import com.typesafe.sbt.SbtNativePackager
import com.typesafe.sbt.SbtNativePackager.autoImport._
import sbtdocker.DockerPlugin.autoImport._
import sbtdocker.immutable.Dockerfile
import sbtdocker.ImageName
import sbt.TaskKey

object DockerSetup {
  def setupDocker(stage: TaskKey[File], dockerFileMod: Dockerfile => Dockerfile = identity) = {
    val nameSpacePrefix = Option(System.getProperty("dockerHub")) match {
      case Some("true") => ""
      case _            => "localhost:5000/"
    }

    Seq(
      imageNames in docker := Seq(
        ImageName(
          namespace = Some(s"${nameSpacePrefix}data61"),
          repository = name.value,
          tag = Some("latest")
        )
      ),

      dockerfile in docker := {
        val appDir: File = stage.value
        val targetDir = "/app"

        dockerFileMod(Dockerfile.empty
          .from("java")
          .entryPoint(s"$targetDir/bin/${executableScriptName.value}")
          .copy(appDir, targetDir)
          .expose(80))
      }
    )
  }
}