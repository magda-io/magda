name := "magda-metadata-common"

resolvers += Resolver.bintrayRepo("monsanto", "maven")
resolvers += Resolver.sonatypeRepo("releases")

libraryDependencies ++= {
  val akkaV       = "2.4.16"
  val akkaHttpV   = "10.0.3"
  val scalaTestV  = "3.0.1"
  Seq(
       "com.typesafe.akka" %% "akka-actor" % akkaV,
       "com.typesafe.akka" %% "akka-stream" % akkaV,
       "com.typesafe.akka" %% "akka-contrib" % akkaV,
       "com.typesafe.akka" %% "akka-http" % akkaHttpV,
    	 "com.typesafe.akka" %% "akka-http-xml" % akkaHttpV,
       "com.typesafe.akka" %% "akka-http-spray-json" % akkaHttpV,
       "com.typesafe.akka" %% "akka-slf4j" % akkaV,
       "ch.qos.logback" % "logback-classic" % "1.1.3",
       "com.monsanto.labs" %% "mwundo" % "0.1.2" exclude("xerces", "xercesImpl"),
       "org.scalaz" %% "scalaz-core" % "7.2.8",

       "org.scalatest" %% "scalatest" % scalaTestV % "test",
       "org.scalacheck" %% "scalacheck" % "1.13.4" % "test",
       "com.fortysevendeg" %% "scalacheck-datetime" % "0.2.0" % "test",
       
    	 "com.typesafe.akka" %% "akka-testkit" % akkaV % "test",
    	 "com.typesafe.akka" %% "akka-http-testkit" % akkaHttpV % "test"
     )
}