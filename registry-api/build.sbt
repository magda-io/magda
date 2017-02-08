enablePlugins(JavaServerAppPackaging)

name := "magda-registry-api"

libraryDependencies ++= {
  val akkaV       = "2.4.16"
  Seq(
    "com.typesafe.akka" %% "akka-actor" % akkaV,
    "com.typesafe.akka" %% "akka-stream" % akkaV,
    "com.typesafe.akka" %% "akka-testkit" % akkaV,
    "ch.megard" %% "akka-http-cors" % "0.1.11",
    "org.scalikejdbc" %% "scalikejdbc" % "2.5.0",
    "org.scalikejdbc" %% "scalikejdbc-config"  % "2.5.0",
    "ch.qos.logback"  %  "logback-classic" % "1.1.7",
    "org.postgresql"  %  "postgresql" % "9.4.1211.jre7",
    "de.heikoseeberger" %% "akka-http-circe" % "1.12.0",
    "io.circe" %% "circe-generic" % "0.7.0",
    "io.circe" %% "circe-java8" % "0.7.0",
    "com.github.swagger-akka-http" %% "swagger-akka-http" % "0.9.1",
    "org.gnieh" %% "diffson-circe" % "2.1.2"
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

watchSources <<= (watchSources) map { files =>
  if (Option(System.getProperty("project")).getOrElse("none").equals("registryApi")) {
    files
  } else {
    Nil
  }
}

EclipseKeys.withJavadoc := true
EclipseKeys.withSource := true