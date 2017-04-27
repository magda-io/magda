package au.csiro.data61.magda.registry

import akka.actor.ActorSystem
import au.csiro.data61.magda.AppConfig
import com.typesafe.config.ConfigFactory
import java.io.File
import ch.qos.logback.classic.Level

/**
 * Command line interface for the registry.
 */
object CommandLine {
  val config = ConfigFactory.parseString(s"""
    akka.loglevel = "ERROR"
  """).resolve().withFallback(AppConfig.conf(Some("local")))
  implicit val system = ActorSystem("blah", config)
  val root = org.slf4j.LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME).asInstanceOf[ch.qos.logback.classic.Logger]
  root.setLevel(Level.ERROR);

  /**
   * Generates a swagger.json file and writes it to the path specified in the first command line arg.
   *
   * Execute from the command line with sbt "registryApi/runMain au.csiro.data61.magda.registry.CommandLine ./swagger.json"
   */
  def main(args: Array[String]) = {
    val swaggerJson = new SwaggerDocService("localhost", 9001, system).generateSwaggerJson
    system.terminate()

    val file = new File(args(0))
    val parent = file.getParentFile()
    if ((!parent.exists() && !parent.mkdirs()) || file.createNewFile()) {
      throw new IllegalStateException("Couldn't create file: " + file);
    }

    printToFile(file) { p =>
      p.println(swaggerJson)
    }
  }

  def printToFile(f: java.io.File)(op: java.io.PrintWriter => Unit) {
    val p = new java.io.PrintWriter(f)
    try { op(p) } finally { p.close() }
  }
}