import DockerSetup._

name := "magda-search-api"

libraryDependencies ++= {
  val akkaV       = "2.4.18"
  val akkaHttpV   = "10.0.7"
  val scalaTestV  = "3.0.1"
  Seq(
       "com.typesafe.akka" %% "akka-http-xml" % akkaHttpV,
       "com.rockymadden.stringmetric" %% "stringmetric-core" % "0.27.4",
       "com.monsanto.labs" %% "mwundo" % "0.1.0" exclude("xerces", "xercesImpl"),
       "org.scalaz" %% "scalaz-core" % "7.2.8"
     )
}

EclipseKeys.withJavadoc := true
EclipseKeys.withSource := true

setupDocker(stage)
