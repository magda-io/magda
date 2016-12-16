enablePlugins(sbtdocker.DockerPlugin, JavaServerAppPackaging)

name := "magda-metadata"
organization := "au.com.csiro.data61"
version := "0.0.11"
scalaVersion := "2.11.8"

scalacOptions := Seq("-unchecked", "-deprecation", "-encoding", "utf8")

resolvers += Resolver.bintrayRepo("monsanto", "maven")

libraryDependencies ++= {
  val akkaV       = "2.4.9"
  val scalaTestV  = "2.2.6"
  Seq(
    "com.typesafe.akka" %% "akka-actor" % akkaV,
    "com.typesafe.akka" %% "akka-stream" % akkaV,
    "com.typesafe.akka" %% "akka-http-experimental" % akkaV,
    "com.typesafe.akka" %% "akka-http-spray-json-experimental" % akkaV,
    "com.typesafe.akka" %% "akka-http-xml-experimental" % akkaV,
    "com.typesafe.akka" %% "akka-contrib" % akkaV,
    "ch.megard" %% "akka-http-cors" % "0.1.5",
    "com.sksamuel.elastic4s" %% "elastic4s-core" % "2.3.0",
    "org.scala-lang.modules" %% "scala-parser-combinators" % "1.0.4",
    "com.rockymadden.stringmetric" %% "stringmetric-core" % "0.27.4",
    "com.monsanto.labs" %% "mwundo" % "0.1.0" exclude("xerces", "xercesImpl"),
    "org.scalaz" %% "scalaz-core" % "7.2.8",
    
    "com.typesafe.akka" %% "akka-http-testkit" % akkaV,
    "org.scalatest"     %% "scalatest" % scalaTestV % "test"
  )
}

EclipseKeys.withJavadoc := true
EclipseKeys.withSource := true

Revolver.settings
Revolver.enableDebugging(port = 8000, suspend = false)

unmanagedResourceDirectories in Compile ++= {  
  if (Option(System.getProperty("includeMockData")).getOrElse("false").equals("true")) {
    println("mock-data")
    List(baseDirectory.value / "mock-data")
  } else {
    println("nil")
    Nil
  }   
}

dockerfile in docker := {
  val appDir: File = stage.value
  val targetDir = "/app"

  new Dockerfile {
    from("java")
    entryPoint(s"$targetDir/bin/${executableScriptName.value}")
    env("S3_SECRET_KEY", "DUMMY")
    copy(appDir, targetDir)
    expose(80)
  }
}

imageNames in docker := Seq(
  ImageName(
    namespace = Some("data61"),
    repository = name.value,
    tag = Some("v" + version.value)
  )
)

val fixWindowsPath = (path: String) => if (path.substring(0, 3) == "C:\\") {
  // Dodgy hack to replace Windows paths with paths that will work within the minikube VM
  "/c/" + path.substring(3).replace('\\', '/')
} else {
  path
}

sources in EditSource <++= baseDirectory.map(d => (d / "kubernetes" ** "*.yml").get)
targetDirectory in EditSource <<= baseDirectory(_ / "target" / "kubernetes")
val baseDirPath = new File("./").getAbsolutePath
val baseDir = fixWindowsPath(baseDirPath.substring(0, baseDirPath.length - 2))
val homeDir = fixWindowsPath(System.getProperty("user.home"))
variables in EditSource += ("projectDir", baseDir)
variables in EditSource += ("homeDir", homeDir)
variables in EditSource += ("version", version.value)