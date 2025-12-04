import spray.json._
import DefaultJsonProtocol._
import sbt.{Def, Resolver}
import sbt.Keys.baseDirectory

name := "magda-metadata"

lazy val packageJson = {
  // Ideally, the version of each component would come from the component's own
  // package.json.  But for now our version number's are synchronized anyway, so
  // just use the version in lerna.json.
  val source = scala.io.Source.fromFile("lerna.json").mkString
  val jsonAst = source.parseJson.asJsObject

   Map(
    "version" -> jsonAst.getFields("version").head.asInstanceOf[JsString].value
  )
}

ThisBuild / resolvers ++= {
  val root = (ThisBuild / baseDirectory).value
  Seq(
    Resolver.mavenLocal,
    "monsanto-local" at (root / "dep-jars/dl.bintray.com/monsanto/maven").toURI.toString
  )
}

lazy val commonSettings = Seq(
  organization := "au.csiro.data61",
  version := packageJson("version"),
  scalaVersion := "2.12.10"
)

lazy val root = (project in file("."))
  .aggregate(common, searchApi, indexer, registryApi, intTest)
  .settings(commonSettings: _*)
lazy val common = (project in file("magda-scala-common"))
  .settings(commonSettings: _*)
lazy val searchApi = (project in file("magda-search-api"))
  .settings(commonSettings: _*)
  .dependsOn(common % "test->test;compile->compile")
  .enablePlugins(sbtdocker.DockerPlugin, JavaServerAppPackaging)
  .settings(
    dockerBaseImage := "eclipse-temurin:8-jre"
  )
lazy val indexer = (project in file("magda-indexer"))
  .settings(commonSettings: _*)
  .dependsOn(common % "test->test;compile->compile")
  .enablePlugins(sbtdocker.DockerPlugin, JavaServerAppPackaging)
  .settings(
    dockerBaseImage := "eclipse-temurin:8-jre"
  )
lazy val registryApi = (project in file("magda-registry-api"))
  .settings(commonSettings: _*)
  .dependsOn(common)
  .enablePlugins(sbtdocker.DockerPlugin, JavaServerAppPackaging)
  .settings(
    dockerBaseImage := "eclipse-temurin:8-jre"
  )
lazy val intTest = (project in file("magda-int-test"))
  .settings(commonSettings: _*)
  .dependsOn(indexer)
  .dependsOn(searchApi)
  .dependsOn(registryApi % "test->test;compile->compile")

Revolver.settings
Revolver.enableDebugging(port = 8000, suspend = false)

concurrentRestrictions in Global += Tags.limit(Tags.Test, 1)
sbt.Keys.fork in Test := false
