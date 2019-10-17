import DockerSetup._

name := "magda-search-api"

libraryDependencies ++= {
  val akkaV       = "2.5.25"
  val akkaHttpV   = "10.1.10"
  val scalaTestV  = "3.0.1"
  Seq(
       "com.typesafe.akka" %% "akka-http-xml" % akkaHttpV,
       "com.monsanto.labs" %% "mwundo-core" % "0.5.0" exclude("xerces", "xercesImpl"),
       "com.monsanto.labs" %% "mwundo-spray" % "0.5.0",
       "org.scalaz" %% "scalaz-core" % "7.2.8"
     )
}

setupDocker(stage)
