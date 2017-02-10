import DockerSetup._

name := "magda-search-api"

libraryDependencies ++= {
  val akkaV       = "2.4.9"
  val scalaTestV  = "3.0.1"
  Seq(
       "com.typesafe.akka" %% "akka-http-xml-experimental" % akkaV,
       "ch.megard" %% "akka-http-cors" % "0.1.5",
       "org.scala-lang.modules" %% "scala-parser-combinators" % "1.0.4",
       "com.rockymadden.stringmetric" %% "stringmetric-core" % "0.27.4",
       "com.monsanto.labs" %% "mwundo" % "0.1.0" exclude("xerces", "xercesImpl"),
       "org.scalaz" %% "scalaz-core" % "7.2.8",

       "org.scalatest" %% "scalatest" % scalaTestV % "test",
       "org.scalamock" %% "scalamock-scalatest-support" % "3.2.2" % "test",
       "com.sksamuel.elastic4s" %% "elastic4s-testkit" % "5.2.4" % "test",
       "com.typesafe.akka" %% "akka-http-testkit" % akkaV % "test",
       "org.scalacheck" %% "scalacheck" % "1.13.4" % "test"
     )
}

EclipseKeys.withJavadoc := true
EclipseKeys.withSource := true

setupDocker(stage)