name := "magda-metadata-indexer"

scalacOptions := Seq("-unchecked", "-deprecation", "-encoding", "utf8")

resolvers += Resolver.bintrayRepo("monsanto", "maven")

libraryDependencies ++= {
  val akkaV       = "2.4.16"
  val akkaHttpV   = "10.0.3"
  val elastic4sV  = "5.2.4"
  Seq(
    "com.sksamuel.elastic4s" %% "elastic4s-core" % elastic4sV,
    "org.scala-lang.modules" %% "scala-parser-combinators" % "1.0.4",
    "org.scalaz" %% "scalaz-core" % "7.2.8"
  )
}

unmanagedResourceDirectories in Compile ++= {  
  if (Option(System.getProperty("includeMockData")).getOrElse("false").equals("true")) {
    List(baseDirectory.value / "mock-data")
  } else {
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

watchSources <<= (watchSources) map { files =>
  if (Option(System.getProperty("project")).getOrElse("none").equals("indexer")) {
    files
  } else {
    Nil
  }
}