enablePlugins(JavaServerAppPackaging)

name := "magda-metadata"
organization := "au.com.csiro.data61"
version := "0.0.1"
scalaVersion := "2.11.8"

scalacOptions := Seq("-unchecked", "-deprecation", "-encoding", "utf8")

libraryDependencies ++= {
  val akkaV       = "2.4.9"
  val scalaTestV  = "2.2.6"
  Seq(
    "com.typesafe.akka" %% "akka-actor" % akkaV,
    "com.typesafe.akka" %% "akka-stream" % akkaV,
    "com.typesafe.akka" %% "akka-http-experimental" % akkaV,
    "com.typesafe.akka" %% "akka-http-spray-json-experimental" % akkaV,
    "com.typesafe.akka" %% "akka-http-xml-experimental" % akkaV,
    "com.typesafe.akka" %% "akka-http-testkit" % akkaV,
    "com.typesafe.akka" %% "akka-contrib" % akkaV,
    "ch.megard" %% "akka-http-cors" % "0.1.5",
    
    "org.scalatest"     %% "scalatest" % scalaTestV % "test"
  )
}

EclipseKeys.withJavadoc := true
EclipseKeys.withSource := true

Revolver.settings

dockerExposedPorts := Seq(9000)

/*
lazy val dockerSettings = Seq(
    // things the docker file generation depends on are listed here
    dockerfile in docker := {
    
		// The assembly task generates a fat JAR file
		val artifact: File = assembly.value
		val artifactTargetPath = s"/app/${artifact.name}"
    
    new Dockerfile {
	    from("java")
	    add(artifact, artifactTargetPath)
	    entryPoint("java", "-jar", artifactTargetPath)
 		}
	}
)  */