name := "magda-metadata-api"

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