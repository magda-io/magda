import sbt._
import sbt.Keys._

import sys.process.Process
import sbtdocker.DockerKeys
import spray.revolver.Actions.restartApp
import spray.revolver.RevolverPlugin.autoImport.{reForkOptions, reLogTag, reStartArgs}

object RelaunchKeys {
  lazy val relaunch = taskKey[Unit]("Launch this project using sbt-revolver whenever its JAR changes.")
  lazy val foofoo = taskKey[Unit]("foofoo")
}

object RelaunchPlugin extends AutoPlugin {
  val dynamic = Def.taskDyn {
    val foo = (sbt.Keys.`package` in Compile).value
    println(foo)
    println((sbt.Keys.fullClasspath in Compile).value)
    if (name.value == "magda-registry-api")
      Def.task {
        val restart = (spray.revolver.RevolverPlugin.autoImport.reStart in Compile).toTask("").value
        println(restart)
        true
      }
    else
      Def.task {
        true
      }
  }

  val checkForCompileChange = Def.taskDyn {
    val incrementalCompileResult = (sbt.Keys.compileIncremental in Compile).value
    if (incrementalCompileResult.hasModified) {
      Def.task {
        val restart = (spray.revolver.RevolverPlugin.autoImport.reStart in Compile).toTask("").value
        true
      }
    } else {
      Def.task {
        false
      }
    }
  }

  override val projectSettings = Seq(
    RelaunchKeys.foofoo := {
      println(checkForCompileChange.value)
//      val cr = (sbt.Keys.compile in Compile).value
//      val mostRecentCompilation = cr.compilations.allCompilations(cr.compilations.allCompilations.length - 1)
//      println(mostRecentCompilation)
//      val justCompiledInternal = cr.apis.internal.filter(x => x._2.compilation() == mostRecentCompilation)
//      println(justCompiledInternal)
    },
//    RelaunchKeys.relaunch in Compile := Def.task {
//      println("Foo")
////      val jar = (sbt.Keys.`package` in Compile).value
////
////      spray.revolver.Actions.stopAppWithStreams(streams.value, thisProjectRef.value)
////
////      val cmdLineOptions = spray.revolver.Actions.ExtraCmdLineOptions(Seq[String](), Seq[String]())
////      val reStart = spray.revolver.RevolverPlugin.autoImport.reStart
////      spray.revolver.Actions.startApp(
////        streams.value,
////        reLogTag.value,
////        thisProjectRef.value,
////        reForkOptions.value,
////        (mainClass in reStart).value,
////        (fullClasspath in reStart).value,
////        reStartArgs.value,
////        cmdLineOptions)
//
//      //restartApp(streams, reLogTag, thisProjetRef, reForkOptions, mainClass in reStart, fullClasspath in reStart, reStartArgs, spray.revolver.Actions.ExtraCmdLineOptions(Seq[String](), Seq[String]()))
////      val reStart = spray.revolver.RevolverPlugin.autoImport.reStart
////      (streams, reLogTag, thisProjectRef, reForkOptions, mainClass in reStart, fullClasspath in reStart, reStartArgs, spray.revolver.Actions.ExtraCmdLineOptions(Seq[String](), Seq[String]()))
////        .map(restartApp)
////        .dependsOn(products in Compile)
//
//      //      spray.revolver.RevolverPlugin.autoImport.reStart.evaluated
////      println(jar)
//    }.triggeredBy(sbt.Keys.`package` in Compile)

    // Using deprecated syntax because the new syntax apparently doesn't work?
    // http://stackoverflow.com/questions/23445644/triggered-execution-in-sbt-0-13-x
    RelaunchKeys.relaunch in Compile <<= Def.task {
      println(dynamic.value)
      println("TRIGGERED BY COMPILE")
    }.triggeredBy(sbt.Keys.`package` in Compile)
  )

  override def requires = spray.revolver.RevolverPlugin
  override def trigger = allRequirements
}
