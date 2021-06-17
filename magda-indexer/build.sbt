import DockerSetup._

name := "magda-indexer"

scalacOptions := Seq("-unchecked", "-deprecation", "-encoding", "utf8")

resolvers += Resolver.bintrayRepo("monsanto", "maven")

libraryDependencies ++= {
  val akkaV       = "2.5.23"
  val akkaHttpV   = "10.1.8"
  val scalaTestV  = "3.0.8"
  Seq(
    "com.typesafe.akka" %% "akka-actor" % akkaV,
    "com.typesafe.akka" %% "akka-stream" % akkaV,
    "com.typesafe.akka" %% "akka-http" % akkaHttpV,
    "com.typesafe.akka" %% "akka-http-spray-json" % akkaHttpV,
    "com.typesafe.akka" %% "akka-http-xml" % akkaHttpV,
    "com.typesafe.akka" %% "akka-contrib" % akkaV,
    "org.scala-lang.modules" %% "scala-parser-combinators" % "1.0.4",
    "com.monsanto.labs" %% "mwundo-core" % "0.5.0" exclude("xerces", "xercesImpl"),
    "com.monsanto.labs" %% "mwundo-spray" % "0.5.0",
    "org.scalaz" %% "scalaz-core" % "7.2.8",
    "com.typesafe.akka" %% "akka-testkit" % akkaV % Test,
    "com.typesafe.akka" %% "akka-stream-testkit" % akkaV % Test,
    "org.scalatest" %% "scalatest" % scalaTestV % Test,
    "org.scalamock" %% "scalamock-scalatest-support" % "3.6.0" % Test,
    "org.jsoup" % "jsoup" % "1.13.1"
  )
}

unmanagedResourceDirectories in Compile ++= {
  if (Option(System.getProperty("excludeMockData")).getOrElse("false").equals("true")) {
    Nil
  } else {
    List(baseDirectory.value / "mock-data")
  }
}

setupDocker( stage)
