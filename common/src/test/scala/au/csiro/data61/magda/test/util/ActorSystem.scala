package au.csiro.data61.magda.test.util

import akka.actor.ActorSystem
import com.typesafe.config.ConfigFactory
import au.csiro.data61.magda.AppConfig

object TestActorSystem {
  // This has to be separated out to make overriding the config work for some stupid reason.
  val config = ConfigFactory.parseString(s"""
    akka.loglevel = ${if (ContinuousIntegration.isCi) "ERROR" else "INFO"}
  """).resolve().withFallback(AppConfig.conf(Some("local")))

  def actorSystem = ActorSystem("TestActorSystem", config)
}