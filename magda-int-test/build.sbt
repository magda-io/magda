name := "magda-int-test"

scalacOptions := Seq("-unchecked", "-deprecation", "-encoding", "utf8")

libraryDependencies ++= {
  val akkaV       = "2.4.18"
  val scalaTestV  = "2.2.6"
  Seq(
    "com.typesafe.akka" %% "akka-http-testkit" % akkaV % "test",
    "org.scalatest"     %% "scalatest" % scalaTestV % "test",
    "com.sksamuel.elastic4s" %% "elastic4s-testkit" % "5.4.3" % "test",
    "org.scalamock" %% "scalamock-scalatest-support" % "3.6.0" % "test",
    "com.fortysevendeg" %% "scalacheck-datetime" % "0.2.0" % "test",
    "com.typesafe.akka" %% "akka-http-testkit" % akkaV % "test",
    "org.scalacheck" %% "scalacheck" % "1.13.4" % "test"
  )
}

EclipseKeys.withJavadoc := true
EclipseKeys.withSource := true
