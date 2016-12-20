name := "magda-metadata"

lazy val commonSettings = Seq(
  organization := "au.csiro.data61",
  version := "0.0.12",
  scalaVersion := "2.11.8"
)

lazy val root = (project in file("."))
  .aggregate(common, searchApi, indexer)
  .settings(commonSettings: _*)
lazy val common = (project in file("common"))
  .settings(commonSettings: _*)
lazy val searchApi = (project in file("search-api"))
  .settings(commonSettings: _*)
  .dependsOn(common)
lazy val indexer = (project in file("indexer"))
  .settings(commonSettings: _*)
  .dependsOn(common)
  .enablePlugins(sbtdocker.DockerPlugin, JavaServerAppPackaging)