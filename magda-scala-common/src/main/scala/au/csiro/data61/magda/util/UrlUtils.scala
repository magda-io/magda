package au.csiro.data61.magda.util

import io.lemonlabs.uri._
import io.lemonlabs.uri.config.UriConfig
import io.lemonlabs.uri.decoding.PercentDecoder
import io.lemonlabs.uri.encoding.PercentEncoder

object UrlUtils {

  val uriConfig = UriConfig.default
    .copy(
      queryEncoder = PercentEncoder(
        PercentEncoder.FRAGMENT_CHARS_TO_ENCODE ++ Set(' ', '&')
      ),
      queryDecoder = PercentDecoder
    )

  def parse(urlStr: String)(implicit config: UriConfig = uriConfig) =
    Url.parse(urlStr)(config)

  def getQuery(urlStr: String) = {
    Url.parse(urlStr).query.paramMap
  }
}
