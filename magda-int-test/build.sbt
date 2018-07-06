name := "magda-int-test"

scalacOptions := Seq("-unchecked", "-deprecation", "-encoding", "utf8")

resolvers += Resolver.bintrayRepo("monsanto", "maven")
resolvers += Resolver.sonatypeRepo("releases")
resolvers += "elasticsearch-releases" at "https://artifacts.elastic.co/maven"

libraryDependencies ++= {
  val akkaV       = "2.4.18"
  val scalaTestV  = "2.2.6"
  val LuceneVersion = "7.3.1"
  Seq(
    "com.typesafe.akka" %% "akka-http-testkit" % akkaV % "test",
    "org.scalatest"     %% "scalatest" % scalaTestV % "test",

    "org.elasticsearch.plugin" % "reindex-client" % "6.3.0" % "test",
    "org.elasticsearch.plugin" % "percolator-client" % "6.3.0" % "test",
    "org.elasticsearch.plugin" % "lang-mustache-client" % "6.3.0" % "test",
    "org.elasticsearch.plugin" % "transport-netty4-client" % "6.3.0" % "test",
    "org.codelibs.elasticsearch.module" % "analysis-common" % "6.3.0" % "test",

    "org.scalamock" %% "scalamock-scalatest-support" % "3.6.0" % "test",
    "com.fortysevendeg" %% "scalacheck-datetime" % "0.2.0" % "test",
    "com.typesafe.akka" %% "akka-http-testkit" % akkaV % "test",
    "org.scalacheck" %% "scalacheck" % "1.13.4" % "test"
  )
}

EclipseKeys.withJavadoc := true
EclipseKeys.withSource := true
