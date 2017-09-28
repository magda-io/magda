	name := "magda-scala-common"

resolvers += Resolver.bintrayRepo("monsanto", "maven")
resolvers += Resolver.sonatypeRepo("releases")

libraryDependencies ++= {
  val akkaV       = "2.4.18"
  val akkaHttpV   = "10.0.7"
  val scalaTestV  = "3.0.1"
  Seq(
       "com.typesafe.akka" %% "akka-actor" % akkaV,
       "com.typesafe.akka" %% "akka-stream" % akkaV,
       "com.typesafe.akka" %% "akka-contrib" % akkaV,
       "com.typesafe.akka" %% "akka-http" % akkaHttpV,
       "com.typesafe.akka" %% "akka-http-spray-json" % akkaHttpV,
       "com.typesafe.akka" %% "akka-slf4j" % akkaV,
       "ch.megard" %% "akka-http-cors" % "0.2.1",
       "ch.qos.logback" % "logback-classic" % "1.1.3",
       "com.monsanto.labs" %% "mwundo" % "0.1.0" exclude("xerces", "xercesImpl"),
       "org.scalaz" %% "scalaz-core" % "7.2.8",
       "com.sksamuel.elastic4s" %% "elastic4s-core" % "5.4.3",
       "com.sksamuel.elastic4s" %% "elastic4s-tcp" % "5.4.3",
       "com.mchange" %% "leftright" % "0.0.1",
       "com.beachape" %% "enumeratum" % "1.5.10",
       "com.github.swagger-akka-http" %% "swagger-akka-http" % "0.9.1",
       "com.auth0" % "java-jwt" % "3.2.0"
     )
}
