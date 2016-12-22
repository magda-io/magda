
name := "magda-metadata"

lazy val commonSettings = Seq(
  organization := "au.csiro.data61",
  version := "0.0.12",
  scalaVersion := "2.11.8"
)

//lazy val root = (project in file("."))
//  .aggregate(common, searchApi, indexer)
//  .settings(commonSettings: _*)
lazy val common = (project in file("common"))
  .settings(commonSettings: _*)
lazy val searchApi = (project in file("search-api"))
  .settings(commonSettings: _*)
  .dependsOn(common)
  .enablePlugins(sbtdocker.DockerPlugin, JavaServerAppPackaging)
lazy val indexer = (project in file("indexer"))
  .settings(commonSettings: _*)
  .dependsOn(common)
  .enablePlugins(sbtdocker.DockerPlugin, JavaServerAppPackaging)

EclipseKeys.withJavadoc := true
EclipseKeys.withSource := true

val fixWindowsPath = (path: String) => if (path.substring(0, 3) == "C:\\") {
  // Dodgy hack to replace Windows paths with paths that will work within the minikube VM
  "/c/" + path.substring(3).replace('\\', '/')
} else {
  path
}

sources in EditSource <++= baseDirectory.map(d => (d / "deploy" / "kubernetes" ** "*.yml").get)
targetDirectory in EditSource <<= baseDirectory(_ / "target" / "kubernetes")
val baseDirPath = new File("./").getAbsolutePath
val baseDir = fixWindowsPath(baseDirPath.substring(0, baseDirPath.length - 2))
val homeDir = fixWindowsPath(System.getProperty("user.home"))
variables in EditSource += ("projectDir", baseDir)
variables in EditSource += ("homeDir", homeDir)
variables in EditSource += ("version", version.value)

Revolver.settings
Revolver.enableDebugging(port = 8000, suspend = false)