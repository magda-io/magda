import sbt._
import sbt.Keys._

import sys.process.Process
import sbtdocker.DockerKeys
import spray.revolver.Actions.restartApp
import spray.revolver.RevolverPlugin.autoImport.{reForkOptions, reLogTag, reStartArgs}

object RelaunchKeys {
  lazy val relaunch = taskKey[Unit]("Launch this project using sbt-revolver whenever the incremental compile actually does something.")
}

object RelaunchPlugin extends AutoPlugin {
  override val projectSettings = Seq(
    RelaunchKeys.relaunch := Def.taskDyn {
      val incrementalCompileResult = (sbt.Keys.compileIncremental in Compile).value
      (sbt.Keys.compile in Compile).value // make sure the entire compile finishes first

      // Is this project already running with sbt-revolver?
      val isRunning = spray.revolver.Actions.revolverState.getProcess(thisProjectRef.value).find(_.isRunning) match {
        case Some(_) => true
        case None => false
      }

      if (!isRunning || incrementalCompileResult.hasModified) {
        Def.task {
          val restart = (spray.revolver.RevolverPlugin.autoImport.reStart in Compile).toTask("").value
          true
        }
      } else {
        Def.task {
          false
        }
      }
    }.value
  )

  override def requires = spray.revolver.RevolverPlugin
  override def trigger = allRequirements
}
