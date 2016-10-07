package au.csiro.data61.magda.crawler

import java.net.URL
import au.csiro.data61.magda.external.ExternalInterface
import au.csiro.data61.magda.external.ExternalInterface.ExternalInterfaceType._
import au.csiro.data61.magda.external.InterfaceConfig
import au.csiro.data61.magda.model.misc._

case object ScrapeAll
case object ScrapeRepo
case class ScrapeRepoFinished(baseUrl: URL)
case class ScrapeRepoFailed(baseUrl: URL, reason: Throwable)
case class ScrapeDataSets(start: Long, number: Long)
case class ScrapeDataSetsFinished(start: Long, number: Long)
case class ScrapeDataSetsFailed(start: Long, number: Long, reason: Throwable)
case class Index(source: String, dataSets: List[DataSet])
case object NeedsReIndexing
case class IndexFinished(dataSets: List[DataSet], source: String)
case class IndexFailed(source: String, reason: Throwable)
