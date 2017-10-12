package au.csiro.data61.magda.test.util

import akka.actor.ActorSystem
import com.typesafe.config.ConfigFactory
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.test.util.ContinuousIntegration

object TestActorSystem {
  // This has to be separated out to make overriding the config work for some stupid reason.
  val config = ConfigFactory.parseString(s"""
    akka.loglevel = ${if (ContinuousIntegration.isCi) "WARNING" else "DEBUG"}
    indexer.refreshInterval = -1
    akka.http.server.request-timeout = 30s
    maxResults = 100
    http.port = 80
    registry.webhookUrl = "http://indexer/v0/registry-hook"
    regionSources {
      SA4.disabled = true
      SA3.disabled = true
      SA2.disabled = true
      SA1.disabled = true
      LGA.disabled = false
      POA.disabled = true
      COM_ELB_ID_2016.disabled = true
      STE.disabled = false
    }
    auth.userId = "1"
  """).resolve().withFallback(AppConfig.conf())

  def actorSystem = ActorSystem("TestActorSystem", config)
}
