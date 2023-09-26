package au.csiro.data61.magda.util

import io.lemonlabs.uri.encoding

object StringUtils {
  val urlSegmentEncoder = encoding.percentEncode -- ('-', '.', '_', '~', '!', '$', '&', '\'', '(', ')', '*', '+', ',', ';', '=', ':', '@')
  val urlQsValEncoder = encoding.percentEncode ++ (' ') -- ('/', ':', '@', '-', '.', '_', '~', '!', '$', '\'', '(', ')', '*', '+', ',', ';')

  implicit class ExtraStringHelperFunctions(val s: String) {
    def stripLineEndingWhitespaces = s.replaceAll("""(?m)(\s)+$""", "")

    def toUrlSegment = urlSegmentEncoder.encode(s, "utf-8")

    def toQueryStringVal = urlQsValEncoder.encode(s, "utf-8")
  }
}
