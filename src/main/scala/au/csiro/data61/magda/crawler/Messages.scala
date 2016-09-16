package au.csiro.data61.magda.crawler

import java.net.URL
import au.csiro.data61.magda.api.Types._
import au.csiro.data61.magda.external.ExternalInterface
import au.csiro.data61.magda.external.ExternalInterface.ExternalInterfaceType._
import au.csiro.data61.magda.external.InterfaceConfig

case class Start(externalInterfaces: Seq[InterfaceConfig])
case class ScrapeRepo()
case class ScrapeRepoFinished(baseUrl: URL)
case class ScrapeRepoFailed(baseUrl: URL, reason: Throwable)
case class ScrapeDataSets(start: Long, number: Long)
case class ScrapeDataSetsFinished(start: Long, number: Long)
case class ScrapeDataSetsFailed(start: Long, number: Long, reason: Throwable)
case class Index(source: String, dataSets: List[DataSet])
case class IndexFinished(dataSets: List[DataSet], source: String)
case class IndexFailed(source: String, reason: Throwable)
