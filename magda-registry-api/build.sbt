import java.io.File
import DockerSetup._

name := "magda-registry-api"

libraryDependencies ++= {
  val akkaV       = "2.5.32"
  val akkaHttpV   = "10.2.7"
  val scalaTestV  = "3.0.8"
  Seq(
    "com.typesafe.akka" %% "akka-actor" % akkaV,
    "com.typesafe.akka" %% "akka-stream" % akkaV,
    "com.typesafe.akka" %% "akka-http" % akkaHttpV,
    "com.typesafe.akka" %% "akka-http-spray-json" % akkaHttpV,
    "org.scalikejdbc" %% "scalikejdbc" % "3.2.4",
    "org.scalikejdbc" %% "scalikejdbc-config" % "3.2.4",
    "org.scalikejdbc" %% "scalikejdbc-test" % "3.2.4" % Test,
    "ch.qos.logback"  %  "logback-classic" % "1.2.10",
    "org.postgresql"  %  "postgresql" % "9.4.1212",
    "org.scalatest" %% "scalatest" % scalaTestV % Test,
    "org.gnieh" %% "diffson-spray-json" % "2.1.2",
    "net.virtual-void" %%  "json-lenses" % "0.6.2",
    "com.typesafe.akka" %% "akka-testkit" % akkaV % Test,
    "com.typesafe.akka" %% "akka-http-testkit" % akkaHttpV % Test,
    "org.flywaydb" % "flyway-core" % "4.2.0" % Test,
    "org.scalamock" %% "scalamock-scalatest-support" % "3.6.0" % Test,
    "com.github.everit-org.json-schema" % "org.everit.json.schema" % "1.12.0",
    "jakarta.xml.bind" % "jakarta.xml.bind-api" % "2.3.2",
    "org.glassfish.jaxb" % "jaxb-runtime" % "2.3.2"
  )
}

mainClass in Compile := Some("au.csiro.data61.magda.registry.RegistryApp")

setupDocker(stage)

unmanagedResourceDirectories in Test += baseDirectory.value.getParentFile / "magda-migrator-registry-db"
includeFilter in (Test, unmanagedResources) := new SimpleFileFilter(file => file.getParentFile() == baseDirectory.value.getParentFile / "magda-migrator-registry-db" / "sql") && "*.sql"
