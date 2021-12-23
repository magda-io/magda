name := "magda-int-test"

scalacOptions := Seq("-unchecked", "-deprecation", "-encoding", "utf8")

// See ref https://github.com/sbt/sbt/issues/413
updateOptions := updateOptions.value.withCachedResolution(true)

resolvers += Resolver.bintrayRepo("monsanto", "maven")
resolvers += "elasticsearch-releases" at "https://artifacts.elastic.co/maven"

libraryDependencies ++= {
  val akkaV       = "2.5.20"
  val akkaHttpV   = "10.1.7"
  val scalaTestV  = "3.0.8"
  val LuceneVersion = "7.3.1"
  Seq(
    "org.scalatest"     %% "scalatest" % scalaTestV % "test",

    "org.elasticsearch.plugin" % "reindex-client" % "6.8.22" % "test",
    "org.elasticsearch.plugin" % "percolator-client" % "6.8.22" % "test",
    "org.elasticsearch.plugin" % "lang-mustache-client" % "6.8.22" % "test",
    "org.elasticsearch.plugin" % "transport-netty4-client" % "6.8.22" % "test",
    "org.codelibs.elasticsearch.module" % "analysis-common" % "6.8.12" % "test",

    "org.scalamock" %% "scalamock-scalatest-support" % "3.6.0" % "test",
    "com.fortysevendeg" %% "scalacheck-datetime" % "0.2.0" % "test",
    "com.typesafe.akka" %% "akka-http-testkit" % akkaHttpV % "test",
    "com.typesafe.akka" %% "akka-testkit" % akkaV % "test",
    "org.scalacheck" %% "scalacheck" % "1.13.4" % "test",
    "org.mock-server" % "mockserver-client-java" % "5.5.1" % "test",
    "org.mock-server" % "mockserver-netty" % "5.5.1" % "test"
  )
}

