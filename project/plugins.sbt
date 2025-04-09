resolvers ++= Seq(
  Resolver.sbtPluginRepo("releases"),
  Resolver.mavenCentral,
  "Sonatype OSS Releases" at "https://oss.sonatype.org/content/repositories/releases",
  "Sonatype OSS Staging" at "https://oss.sonatype.org/content/repositories/staging",
  "Sonatype OSS Snapshots" at "https://oss.sonatype.org/content/repositories/snapshots",
)

addSbtPlugin("io.spray" % "sbt-revolver" % "0.9.1")

addSbtPlugin("com.typesafe.sbt" % "sbt-native-packager" % "1.3.3")

addSbtPlugin("se.marcuslonnberg" % "sbt-docker" % "1.7.0")

addSbtPlugin("net.virtual-void" % "sbt-dependency-graph" % "0.9.0")

addSbtPlugin("org.scalameta" % "sbt-scalafmt" % "2.0.4")