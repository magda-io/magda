package au.csiro.data61.magda.test.util

import akka.actor.ActorSystem
import com.typesafe.config.ConfigFactory
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.search.elasticsearch.HybridSearchConfig

object TestActorSystem {
  val AUTH_USER_ID = "36bf34b8-7610-4fd3-8aab-0beaa318920a"

  // This has to be separated out to make overriding the config work for some stupid reason.
  val config = ConfigFactory.parseString(s"""
    akka.loglevel = ERROR
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
    elasticSearch {
      connectTimeout = 30000
      socketTimeout = 600000
      maxRetryTimeout = 30000
      serverUrl = "elasticsearch://localhost:9201"
      indices.datasets.hybridSearch.enabled = false
      indices.datasets.innerHitsSize = 50
    }
    authorization {
      skipOpaQuery = true
      muteWarning = true
    }
    opa {
      baseUrl = "http://localhost:8888/v0/opa/"
      testSessionId = "general-search-api-tests"
    }
    auth.userId = "$AUTH_USER_ID"
    embeddingApi = {
      baseUrl = "http://localhost:3000"
      maxRetries = 12
      retryBackoff = 10s
      taskSize = 5
      main-dispatcher {
        type = Dispatcher
        executor = "thread-pool-executor"
        thread-pool-executor {
          fixed-pool-size = 8
        }
        throughput = 1
      }
    }
  """).resolve().withFallback(AppConfig.conf())

  HybridSearchConfig.setAppConfig(config)

  def actorSystem = ActorSystem("TestActorSystem", config)
}
