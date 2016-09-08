package au.csiro.data61.magda.crawler

import java.net.URL
import au.csiro.data61.magda.api.Types._
import au.csiro.data61.magda.external.ExternalInterface
import au.csiro.data61.magda.external.ExternalInterface.ExternalInterfaceType._

/**
 * @author Foat Akhmadeev
 *         17/01/16
 */
case class Start(interfaceType: ExternalInterfaceType, baseUrl: URL)
case class ScrapeRepo()
case class ScrapeDataSets(start: Long, number: Long)
case class ScrapeDataSetsFinished(apiType: String, baseUrl: String)
case class Index(dataSets: List[DataSet])
case class Content(dataSets: List[DataSet])
case class ScrapeFinished(apiType: String, baseUrl: String)
case class IndexFinished(dataSets: List[DataSet])
case class ScrapeFailure(start: Long, number: Int, reason: Throwable)
