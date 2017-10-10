import java.io.File
import DockerSetup._

name := "magda-registry-api"

libraryDependencies ++= {
  val akkaV       = "2.4.18"
  val akkaHttpV   = "10.0.7"
  val scalaTestV  = "3.0.1"
  Seq(
//  	"com.networknt" % "json-schema-validator" % "0.1.0",
    "com.typesafe.akka" %% "akka-actor" % akkaV,
    "com.typesafe.akka" %% "akka-stream" % akkaV,
    "com.typesafe.akka" %% "akka-http" % akkaHttpV,
    "com.typesafe.akka" %% "akka-http-spray-json" % akkaHttpV,
    "com.typesafe.akka" %% "akka-http-testkit" % akkaHttpV,
    "ch.megard" %% "akka-http-cors" % "0.2.1",
    "org.scalikejdbc" %% "scalikejdbc" % "3.0.0-RC3",
    "org.scalikejdbc" %% "scalikejdbc-config" % "3.0.0-RC3",
    "org.scalikejdbc" %% "scalikejdbc-test" % "3.0.0-RC3" % "test",
    "ch.qos.logback"  %  "logback-classic" % "1.1.7",
    "org.postgresql"  %  "postgresql" % "9.4.1212",
    "org.scalatest" %% "scalatest" % scalaTestV % "test",
    "de.heikoseeberger" %% "akka-http-circe" % "1.16.1",
    "io.circe" %% "circe-generic" % "0.8.0",
    "io.circe" %% "circe-java8" % "0.8.0",
    "org.gnieh" %% "diffson-spray-json" % "2.1.2",
    "net.virtual-void" %%  "json-lenses" % "0.6.2",
    "com.auth0" % "java-jwt" % "3.2.0",
    "org.flywaydb" % "flyway-core" % "4.2.0" % "test",
    "org.scalamock" %% "scalamock-scalatest-support" % "3.6.0" % "test"
  )
}

mainClass in Compile := Some("au.csiro.data61.magda.registry.RegistryApp")

EclipseKeys.withJavadoc := true
EclipseKeys.withSource := true

setupDocker(stage)

unmanagedResourceDirectories in Test += baseDirectory.value.getParentFile / "magda-registry-datastore"
includeFilter in (Test, unmanagedResources) := new SimpleFileFilter(file => file.getParentFile() == baseDirectory.value.getParentFile / "magda-registry-datastore" / "sql") && "*.sql"
