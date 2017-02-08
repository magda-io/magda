enablePlugins(JavaServerAppPackaging)

name := "magda-registry-api"

libraryDependencies ++= {
  val akkaV       = "2.4.9"
  val scalaTestV  = "3.0.1"
  Seq(
//  	"com.networknt" % "json-schema-validator" % "0.1.0",
    "com.typesafe.akka" %% "akka-actor" % akkaV,
    "com.typesafe.akka" %% "akka-stream" % akkaV,
    "com.typesafe.akka" %% "akka-http-experimental" % akkaV,
    "com.typesafe.akka" %% "akka-http-spray-json-experimental" % akkaV,
    "com.typesafe.akka" %% "akka-http-testkit" % akkaV,
    "ch.megard" %% "akka-http-cors" % "0.1.5",
    "org.scalikejdbc" %% "scalikejdbc" % "2.4.2",
    "org.scalikejdbc" %% "scalikejdbc-config"  % "2.4.2",
    "ch.qos.logback"  %  "logback-classic" % "1.1.7",
    "org.postgresql"  %  "postgresql" % "9.4.1211.jre7",
    "org.scalatest" %% "scalatest" % scalaTestV % "test",
    "de.heikoseeberger" %% "akka-http-circe" % "1.10.1",
    "io.circe" %% "circe-generic" % "0.5.3",
    "io.circe" %% "circe-java8" % "0.5.3",
    "com.github.swagger-akka-http" %% "swagger-akka-http" % "0.7.2",
    "org.gnieh" %% "diffson" % "2.0.2"
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