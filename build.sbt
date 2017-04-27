

name := "magda-metadata"

lazy val commonSettings = Seq(
  organization := "au.csiro.data61",
  version := "0.0.25-SNAPSHOT",
  scalaVersion := "2.11.8"
)

lazy val root = (project in file("."))
  .aggregate(common, searchApi, indexer, registryApi, intTest)
  .settings(commonSettings: _*)
lazy val common = (project in file("common"))
  .settings(commonSettings: _*)
lazy val searchApi = (project in file("search-api"))
  .settings(commonSettings: _*)
  .dependsOn(common % "test->test;compile->compile")
  .enablePlugins(sbtdocker.DockerPlugin, JavaServerAppPackaging)
lazy val indexer = (project in file("indexer"))
  .settings(commonSettings: _*)
  .dependsOn(common % "test->test;compile->compile")
  .enablePlugins(sbtdocker.DockerPlugin, JavaServerAppPackaging)
lazy val registryApi = (project in file("registry-api"))
  .settings(commonSettings: _*)
  .dependsOn(common)
  .enablePlugins(sbtdocker.DockerPlugin, JavaServerAppPackaging)
lazy val intTest = (project in file("int-test"))
  .settings(commonSettings: _*)
  .dependsOn(indexer)
  .dependsOn(searchApi)

EclipseKeys.withJavadoc := true
EclipseKeys.withSource := true

Revolver.settings
Revolver.enableDebugging(port = 8000, suspend = false)

sources in EditSource <++= baseDirectory.map(d => (d / "deploy" / "kubernetes" ** "*.yml").get)
targetDirectory in EditSource <<= baseDirectory(_ / "target" / "kubernetes")
variables in EditSource += ("version", version.value)

concurrentRestrictions in Global += Tags.limit(Tags.Test, 1)
sbt.Keys.fork in Test := false

