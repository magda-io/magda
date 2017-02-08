enablePlugins(JavaServerAppPackaging)

name := "magda-metadata-api"

libraryDependencies ++= {
  val akkaV       = "2.4.16"
  val elastic4sV  = "5.2.4"
  Seq(
       "ch.megard" %% "akka-http-cors" % "0.1.11",
       "org.scala-lang.modules" %% "scala-parser-combinators" % "1.0.4",
       "com.rockymadden.stringmetric" % "stringmetric-core_2.11" % "0.27.4",
       "com.monsanto.labs" %% "mwundo" % "0.1.0" exclude("xerces", "xercesImpl"),
       "org.scalaz" %% "scalaz-core" % "7.2.8",
       "com.sksamuel.elastic4s" %% "elastic4s-core" % elastic4sV,

       "com.sksamuel.elastic4s" %% "elastic4s-testkit" % elastic4sV % "test",
       "com.sun.jna" % "jna" % "3.0.9",
       "org.scalacheck" %% "scalacheck" % "1.13.4" % "test"
     )
}

dockerfile in docker := {
  val appDir: File = stage.value
  val targetDir = "/app"

  new Dockerfile {
    from("java")
    entryPoint(s"$targetDir/bin/${executableScriptName.value}")
    env("S3_SECRET_KEY", "DUMMY")
    copy(appDir, targetDir)
    expose(80)
  }
}

imageNames in docker := Seq(
  ImageName(
    namespace = Some("data61"),
    repository = name.value,
    tag = Some("v" + version.value)
  )
)

EclipseKeys.withJavadoc := true
EclipseKeys.withSource := true

testOptions in Test += Tests.Argument("-oF")