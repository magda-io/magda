import sbt._
import sbt.Keys._

object RelaunchKeys {
  lazy val relaunch = taskKey[Boolean]("Launch this project using sbt-revolver whenever the incremental compile actually does something.")
}

object RelaunchPlugin extends AutoPlugin {
  override val projectSettings = Seq(
    RelaunchKeys.relaunch := Def.taskDyn {
      (sbt.Keys.compile in Compile).value // make sure the entire compile finishes first

      // Does this project have a mainClass we can run?
      val hasMainClass = (mainClass in run in Compile).value.nonEmpty

      // Is this project already running with sbt-revolver?
      val isRunning = spray.revolver.Actions.revolverState.getProcess(thisProjectRef.value).find(_.isRunning).nonEmpty

      // Did the incremental compile actually do anything?
      // We need to look to see if any of this project's dependencies compiled.
      val incrementalCompileDidSomething = (sbt.Keys.compileIncremental in Compile).all(ScopeFilter(inDependencies(ThisProject))).value.find(_.hasModified).nonEmpty

      if (hasMainClass && (!isRunning || incrementalCompileDidSomething)) {
        Def.task {
          (spray.revolver.RevolverPlugin.autoImport.reStart in Compile).toTask("").value
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
