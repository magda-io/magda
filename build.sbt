

name := "magda-metadata"

lazy val commonSettings = Seq(
  organization := "au.csiro.data61",
  version := "0.0.16",
  scalaVersion := "2.11.8"
)

lazy val root = (project in file("."))
  .aggregate(common, searchApi, indexer, registryApi, ckanConnector)
  .settings(commonSettings: _*)
lazy val common = (project in file("common"))
  .settings(commonSettings: _*)
lazy val searchApi = (project in file("search-api"))
  .settings(commonSettings: _*)
  .dependsOn(common % "test->test;compile->compile")
  .dependsOn(indexer % "test->test")
  .enablePlugins(sbtdocker.DockerPlugin, JavaServerAppPackaging)
lazy val indexer = (project in file("indexer"))
  .settings(commonSettings: _*)
  .dependsOn(common % "test->test;compile->compile")
  .enablePlugins(sbtdocker.DockerPlugin, JavaServerAppPackaging)
lazy val registryApi = (project in file("registry-api"))
  .settings(commonSettings: _*)
  .dependsOn(common)
  .enablePlugins(sbtdocker.DockerPlugin, JavaServerAppPackaging)
lazy val ckanConnector = (project in file("ckan-connector"))
  .settings(commonSettings: _*)
  .dependsOn(common)
  .enablePlugins(sbtdocker.DockerPlugin, JavaServerAppPackaging)

EclipseKeys.withJavadoc := true
EclipseKeys.withSource := true

Revolver.settings
Revolver.enableDebugging(port = 8000, suspend = false)

sources in EditSource <++= baseDirectory.map(d => (d / "deploy" / "kubernetes" ** "*.yml").get)
targetDirectory in EditSource <<= baseDirectory(_ / "target" / "kubernetes")
variables in EditSource += ("version", version.value)