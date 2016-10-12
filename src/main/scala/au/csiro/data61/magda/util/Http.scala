package au.csiro.data61.magda.util

import java.net.URL

/**
 * Created by gil308 on 12/10/2016.
 */
object Http {
  def getPort(url: URL) = if (url.getPort == -1) 80 else url.getPort
}
