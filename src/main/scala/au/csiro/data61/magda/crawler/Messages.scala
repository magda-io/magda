package au.csiro.data61.magda.crawler

import java.net.URL
import au.csiro.data61.magda.api.Types._
import au.csiro.data61.magda.external.ExternalInterface
import au.csiro.data61.magda.external.ExternalInterface.ExternalInterfaceType._

/**
 * @author Foat Akhmadeev
 *         17/01/16
 */
case class Start(externalInterfaces: Seq[(ExternalInterfaceType, URL)])
case class ScrapeRepo()
case class ScrapeRepoFinished(baseUrl: URL)
case class ScrapeRepoFailed(baseUrl: URL, reason: Throwable)
case class ScrapeDataSets(start: Long, number: Long)
case class ScrapeDataSetsFinished(start: Long, number: Long)
case class ScrapeDataSetsFailed(start: Long, number: Long, reason: Throwable)
case class Index(baseUrl: URL, dataSets: List[DataSet])
case class IndexFinished(dataSets: List[DataSet], baseUrl: URL)
case class IndexFailed(baseUrl: URL, reason: Throwable)
