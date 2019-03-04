name := "magda-scala-common"

resolvers += Resolver.bintrayRepo("monsanto", "maven")
resolvers += Resolver.sonatypeRepo("releases")
resolvers += "elasticsearch-releases" at "https://artifacts.elastic.co/maven"

libraryDependencies ++= {
  val akkaV       = "2.5.20"
  val akkaHttpV   = "10.1.7"
  val scalaTestV  = "3.0.1"
  Seq(
       "com.typesafe.akka" %% "akka-actor" % akkaV,
       "com.typesafe.akka" %% "akka-stream" % akkaV,
       "com.typesafe.akka" %% "akka-contrib" % akkaV,
       "com.typesafe.akka" %% "akka-http" % akkaHttpV,
       "com.typesafe.akka" %% "akka-http-spray-json" % akkaHttpV,
       "com.typesafe.akka" %% "akka-slf4j" % akkaV,
       "ch.qos.logback" % "logback-classic" % "1.2.3",
       "com.monsanto.labs" %% "mwundo" % "0.1.0" exclude("xerces", "xercesImpl"),
       "org.scalaz" %% "scalaz-core" % "7.2.8",

       "org.locationtech.spatial4j" % "spatial4j" % "0.7",
       "org.locationtech.jts" % "jts-core" % "1.15.0",
       "org.elasticsearch" % "elasticsearch" % "6.5.1",

       "com.sksamuel.elastic4s" %% "elastic4s-core" % "6.5.1",
       "com.sksamuel.elastic4s" %% "elastic4s-http" % "6.5.1",
       "org.apache.logging.log4j" % "log4j-core" % "2.9.1",
       "org.apache.logging.log4j" % "log4j-api" % "2.9.1",

       "com.mchange" %% "leftright" % "0.0.1",
       "com.beachape" %% "enumeratum" % "1.5.10",
       "com.github.swagger-akka-http" %% "swagger-akka-http" % "0.14.1",
       "com.auth0" % "java-jwt" % "3.7.0",
       "net.virtual-void" %%  "json-lenses" % "0.6.2"
     )
}
