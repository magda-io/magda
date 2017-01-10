name := "magda-metadata-common"

resolvers += Resolver.bintrayRepo("monsanto", "maven")

libraryDependencies ++= {
  val akkaV       = "2.4.9"
  val scalaTestV  = "3.0.1"
  Seq(
       "com.typesafe.akka" %% "akka-actor" % akkaV,
       "com.typesafe.akka" %% "akka-stream" % akkaV,
       "com.typesafe.akka" %% "akka-contrib" % akkaV,
       "com.typesafe.akka" %% "akka-http-experimental" % akkaV,
       "com.typesafe.akka" %% "akka-http-spray-json-experimental" % akkaV,
       "com.sksamuel.elastic4s" %% "elastic4s-core" % "2.3.0",
       "com.monsanto.labs" %% "mwundo" % "0.1.0" exclude("xerces", "xercesImpl"),
       "org.scalaz" %% "scalaz-core" % "7.2.8",

       "org.scalatest" %% "scalatest" % scalaTestV % "test",
       "org.scalamock" %% "scalamock-scalatest-support" % "3.2.2" % "test",
       "com.sksamuel.elastic4s" %% "elastic4s-testkit" % "2.3.0" % "test"
     )
}