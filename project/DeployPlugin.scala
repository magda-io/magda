import sbt._
import sbt.Keys._
import sys.process.Process
import sbtdocker.DockerKeys

object DeployKeys {
  lazy val deployLocal = taskKey[Unit]("Deploy this service to the local Kubernetes cluster.")
}

object DeployPlugin extends AutoPlugin {
  override val projectSettings = Seq(
    DeployKeys.deployLocal := Def.taskDyn {
      (sbt.Keys.compile in Compile).value // make sure the entire compile finishes first

      // Does this project have a mainClass we can run?
      val hasMainClass = (mainClass in run in Compile).value.nonEmpty

      // Did the incremental compile actually do anything?
      val incrementalCompileDidSomething = (sbt.Keys.compileIncremental in Compile).value.hasModified

      if (hasMainClass && incrementalCompileDidSomething) {
        Def.task {
          val dockerImageID = DockerKeys.dockerBuildAndPush.value

          // Remove the created image; we don't need it once it has been pushed to the registry
          val rmi = Process("docker rmi " + dockerImageID).!!
          println(rmi)

          // Delete pods associated with this deployment, so they spin back up with the new version
          val delete = Process("kubectl delete pods -l service=" + baseDirectory.value.getName()).!!
          println(delete)
          true
        }
      } else {
        Def.task {
          false
        }
      }
    }.value
  )

  override def requires = sbtdocker.DockerPlugin
  override def trigger = allRequirements
}
