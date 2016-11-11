package au.csiro.data61.magda.crawler

import akka.actor.{ Actor, ActorLogging, ActorRef }
import akka.stream.ActorMaterializer
import au.csiro.data61.magda.search.SearchProvider
import au.csiro.data61.magda.spatial.RegionSource

import scala.util.{ Failure, Success }
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchQueryer
import au.csiro.data61.magda.search.SearchIndexer
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchIndexer
import au.csiro.data61.magda.AppConfig

class Indexer(supervisor: ActorRef) extends Actor with ActorLogging {
  implicit val ec = context.dispatcher
  implicit val system = context.system
  implicit val materializer = ActorMaterializer.create(context)
  val searchProvider: SearchIndexer = new ElasticSearchIndexer()

  // On startup, check that the index isn't empty (as it would be on first boot or after an index schema upgrade)
  if (AppConfig.conf.getBoolean("indexer.alwaysReindex")) {
    supervisor ! NeedsReIndexing
  } else {
    searchProvider.needsReindexing().onComplete {
      case Success(needsReindexing) => needsReindexing match {
        case true  => supervisor ! NeedsReIndexing
      case false => // Index isn't empty so it's all good :) 
        log.info("Index wasn't empty, no need to crawl")
      }
      case Failure(e) => {
        log.error(e, "Failed to determine whether the index needs reindexing - this might mean that there's out-of-date or no data to search on")
      }
    }
  }

  def receive: Receive = {
    case Index(source, dataSets) =>
      val filteredDataSets = dataSets.filterNot(_.distributions.isEmpty)

      val ineligibleDataSetCount = dataSets.size - filteredDataSets.size
      if (ineligibleDataSetCount > 0) {
        log.info("Filtering out {} datasets from {} because they have no distributions", ineligibleDataSetCount, source)
      }

      searchProvider.index(source, filteredDataSets) onComplete {
        case Success(_)      => supervisor ! IndexFinished(filteredDataSets, source)
        case Failure(reason) => supervisor ! IndexFailed(source, reason)
      }
  }

  @throws[Exception](classOf[Exception])
  override def postStop(): Unit = {
    super.postStop()
  }
}