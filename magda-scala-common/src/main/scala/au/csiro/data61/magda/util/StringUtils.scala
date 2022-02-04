package au.csiro.data61.magda.util

object StringUtils {
  implicit class ExtraStringHelperFunctions(val s: String) {
    def stripLineEndingWhitespaces = s.replaceAll("""(?m)(\s)+$""", "")
  }
}
