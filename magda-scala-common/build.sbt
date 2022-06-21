name := "magda-scala-common"

resolvers += Resolver.bintrayRepo("monsanto", "maven")
resolvers += Resolver.sonatypeRepo("releases")
resolvers += "elasticsearch-releases" at "https://artifacts.elastic.co/maven"
resolvers += "jitpack" at "https://jitpack.io"

libraryDependencies ++= {
  val akkaV = "2.5.32"
  val akkaHttpV = "10.2.7"
  val scalaTestV = "3.0.8"
  val jjwtV = "0.10.7"

  Seq(
    "com.typesafe.akka"            %% "akka-actor"           % akkaV,
    "com.typesafe.akka"            %% "akka-stream"          % akkaV,
    "com.typesafe.akka"            %% "akka-contrib"         % akkaV,
    "com.typesafe.akka"            %% "akka-http"            % akkaHttpV,
    "com.typesafe.akka"            %% "akka-http-spray-json" % akkaHttpV,
    "com.typesafe.akka"            %% "akka-slf4j"           % akkaV,
    "ch.qos.logback"               % "logback-classic"       % "1.2.10",
    "com.monsanto.labs"            %% "mwundo-core"          % "0.5.0" exclude ("xerces", "xercesImpl"),
    "com.monsanto.labs"            %% "mwundo-spray"         % "0.5.0",
    "org.scalaz"                   %% "scalaz-core"          % "7.2.8",
    "org.locationtech.spatial4j"   % "spatial4j"             % "0.7",
    "org.locationtech.jts"         % "jts-core"              % "1.15.0",
    "org.elasticsearch"            % "elasticsearch"         % "6.8.22" exclude ("org.apache.logging.log4j", "log4j-api"),
    "com.sksamuel.elastic4s"       %% "elastic4s-core"       % "6.7.8",
    "com.sksamuel.elastic4s"       %% "elastic4s-http"       % "6.7.8",
    "com.beachape"                 %% "enumeratum"           % "1.5.10",
    "com.github.swagger-akka-http" %% "swagger-akka-http"    % "1.4.0",
    "net.virtual-void"             %% "json-lenses"          % "0.6.2",
    "com.mapbox.mapboxsdk"         % "mapbox-sdk-geojson"    % "4.5.0",
    "org.gnieh"                    %% "diffson-spray-json"   % "2.1.2",
    "io.jsonwebtoken"              % "jjwt-api"              % jjwtV,
    "io.jsonwebtoken"              % "jjwt-impl"             % jjwtV,
    "io.jsonwebtoken"              % "jjwt-jackson"          % jjwtV,
    "org.scalatest"                %% "scalatest"            % scalaTestV % Test,
    "com.typesafe.akka"            %% "akka-stream-testkit"  % akkaV % Test,
    "com.typesafe.akka"            %% "akka-http-testkit"    % akkaHttpV % Test,
    "io.lemonlabs"                 %% "scala-uri"            % "3.6.0",
    "org.scalamock"                %% "scalamock"            % "5.1.0" % Test,
    "org.scalikejdbc"              %% "scalikejdbc"          % "3.0.0-RC3",
    "org.json4s"                   %  "json4s-native_2.12"   % "4.0.5"
  )
}
