import java.io.File
import DockerSetup._

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
    "org.scalikejdbc" %% "scalikejdbc" % "3.0.0-RC3",
    "org.scalikejdbc" %% "scalikejdbc-config" % "3.0.0-RC3",
    "org.scalikejdbc" %% "scalikejdbc-test" % "3.0.0-RC3" % "test",
    "ch.qos.logback"  %  "logback-classic" % "1.1.7",
    "org.postgresql"  %  "postgresql" % "9.4.1212",
    "org.scalatest" %% "scalatest" % scalaTestV % "test",
    "de.heikoseeberger" %% "akka-http-circe" % "1.10.1",
    "io.circe" %% "circe-generic" % "0.5.3",
    "io.circe" %% "circe-java8" % "0.5.3",
    "org.gnieh" %% "diffson-spray-json" % "2.1.2",
    "net.virtual-void" %%  "json-lenses" % "0.6.2",
    "io.swagger" % "swagger-codegen-cli" % "2.2.2"
  )
}

EclipseKeys.withJavadoc := true
EclipseKeys.withSource := true

setupDocker(stage)

unmanagedResources in Test += baseDirectory.value.getParentFile / "registry-datastore" / "scripts" / "init" / "evolveschema.sql"
